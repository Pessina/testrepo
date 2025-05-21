import { Address, toNano, beginCell } from '@ton/core';
import { mnemonicToWalletKey } from '@ton/crypto';
import * as dotenv from 'dotenv';
import { TonClient, WalletContractV5R1, internal, SendMode } from '@ton/ton';

dotenv.config();

/**
 * Script to extract ALL funds from a vesting contract
 *
 * This script:
 * 1. Uses the correct send_mode flags that are allowed by the contract
 * 2. Tracks transaction status and provides detailed information
 * 3. Attempts to withdraw the maximum possible amount
 */
async function main() {
  console.log('Starting vesting wallet maximum fund extraction...');

  const contractAddress = process.env.VESTING_CONTRACT_ADDRESS;
  const apiKey = process.env.TON_API_KEY;
  const mnemonic = process.env.WALLET_MNEMONIC;
  const endpoint = process.env.TON_API_ENDPOINT;

  if (!contractAddress || !apiKey || !mnemonic || !endpoint) {
    console.error('Error: Missing required environment variables');
    process.exit(1);
  }

  console.log(`Target vesting contract: ${contractAddress}`);

  try {
    const client = new TonClient({
      endpoint,
      apiKey,
    });

    const keyPair = await mnemonicToWalletKey(mnemonic.split(' ').filter(word => word !== ''));

    const walletVersion = 'v5r1';
    console.log(`Using wallet version: ${walletVersion}`);

    const wallet = WalletContractV5R1.create({
      publicKey: keyPair.publicKey,
      walletId: {
        networkGlobalId: -3,
        context: {
          walletVersion: 'v5r1',
          workchain: 0,
          subwalletNumber: 1,
        },
      },
    });

    const walletAddress = wallet.address;
    console.log(
      `Your wallet address: ${walletAddress.toString({
        bounceable: true,
        testOnly: true,
        urlSafe: false,
      })}`
    );

    const walletState = await client.getContractState(walletAddress);
    console.log(
      `Wallet balance: ${walletState.balance} nanoTON (${Number(walletState.balance) / 1e9} TON)`
    );

    if (Number(walletState.balance) < Number(toNano('0.15'))) {
      console.error('Error: Your wallet has insufficient balance for transaction fees');
      console.log('Please ensure your wallet has at least 0.15 TON for gas fees');
      process.exit(1);
    }

    const currentTime = Math.floor(Date.now() / 1000);
    console.log(`Current time: ${new Date(currentTime * 1000).toISOString()}`);

    const vestingAddress = Address.parse(contractAddress);

    const contractState = await client.getContractState(vestingAddress);

    if (!contractState.state) {
      console.error('Error: Contract not found or not active');
      process.exit(1);
    }

    console.log(`Contract status: ${contractState.state}`);
    console.log(
      `Contract balance: ${contractState.balance} nanoTON (${Number(contractState.balance) / 1e9} TON)`
    );

    if (Number(contractState.balance) <= 0) {
      console.error('Error: Contract has no balance to withdraw');
      process.exit(1);
    }

    console.log('\nFetching vesting data...');
    const vestingDataResult = await client.runMethod(vestingAddress, 'get_vesting_data');

    const stack = vestingDataResult.stack;
    const vestingData = {
      vestingStartTime: stack.readNumber(),
      vestingTotalDuration: stack.readNumber(),
      unlockPeriod: stack.readNumber(),
      cliffDuration: stack.readNumber(),
      vestingTotalAmount: stack.readBigNumber(),
      vestingSenderAddress: stack.readAddress(),
      ownerAddress: stack.readAddress(),
    };

    console.log('Vesting Data:');
    console.log(`- Start time: ${new Date(vestingData.vestingStartTime * 1000).toISOString()}`);
    console.log(`- Total duration: ${vestingData.vestingTotalDuration} seconds`);
    console.log(`- Unlock period: ${vestingData.unlockPeriod} seconds`);
    console.log(
      `- End time: ${new Date((vestingData.vestingStartTime + vestingData.vestingTotalDuration) * 1000).toISOString()}`
    );
    console.log(`- Total amount: ${vestingData.vestingTotalAmount.toString()} nanoTON`);
    console.log(`- Owner address: ${vestingData.ownerAddress.toString()}`);

    // Check if the wallet address matches the owner address
    if (walletAddress.toString() !== vestingData.ownerAddress.toString()) {
      console.error(
        'Error: Your wallet address does not match the owner address of the vesting contract'
      );
      console.log(`Contract owner: ${vestingData.ownerAddress.toString()}`);
      console.log(`Your wallet: ${walletAddress.toString()}`);
      process.exit(1);
    }

    // Check locked amount
    const lockedAmountResult = await client.runMethod(vestingAddress, 'get_locked_amount', [
      { type: 'int', value: BigInt(currentTime) },
    ]);

    const lockedAmount = lockedAmountResult.stack.readBigNumber();
    console.log(`Currently locked amount: ${lockedAmount.toString()} nanoTON`);

    // Calculate maximum amount that can be withdrawn
    // For safety, we'll leave some TON for gas
    const contractBalance = BigInt(contractState.balance);
    const safetyMargin = toNano('0.01'); // Leave 0.01 TON for gas
    let withdrawAmount = contractBalance > safetyMargin ? contractBalance - safetyMargin : 0n;

    console.log(`Available contract balance: ${contractBalance.toString()} nanoTON`);
    console.log(
      `Amount to withdraw: ${withdrawAmount.toString()} nanoTON (${Number(withdrawAmount) / 1e9} TON)`
    );

    if (withdrawAmount <= 0n) {
      console.log('No funds available for withdrawal after safety margin.');
      process.exit(0);
    }

    console.log('\n*** PERFORMING FUND EXTRACTION ***');
    console.log(
      `Attempting to withdraw ${Number(withdrawAmount) / 1e9} TON to ${walletAddress.toString()}`
    );

    console.log(`\n--- IMPORTANT INFORMATION ABOUT FEES ---`);
    console.log(
      `1. We're attaching 0.1 TON to the message to ensure sufficient gas for processing.`
    );
    console.log(`2. This attached TON covers:
      - Storage fees for the contract
      - Gas fees for executing the smart contract code
      - Forward fees for sending the response message
    `);
    console.log(`3. The remaining balance from this 0.1 TON will be returned to your wallet.`);

    // IMPORTANT: The contract only allows SEND_MODE_IGNORE_ERRORS + SEND_MODE_PAY_FEES_SEPARETELY when there's locked amount
    // Create the transfer message with exact amount (not using CARRY_ALL_BALANCE)
    const transferMessage = beginCell()
      .storeUint(0x18, 6) // bounceable address flag
      .storeAddress(walletAddress) // destination = wallet address
      .storeCoins(withdrawAmount) // value = exact amount to withdraw
      .storeUint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1) // default message header
      .storeUint(0, 32) // empty op for simple transfer
      .endCell();

    // According to contract, we MUST use SEND_MODE_IGNORE_ERRORS(2) + SEND_MODE_PAY_FEES_SEPARETELY(1) = 3
    // This is enforced by the contract when locked_amount > 0
    const extractBody = beginCell()
      .storeUint(0xa7733acd, 32) // op::send opcode
      .storeUint(0, 64) // query_id
      .storeUint(1 + 2, 8) // send_mode = SEND_MODE_PAY_FEES_SEPARATELY + SEND_MODE_IGNORE_ERRORS = 3
      .storeRef(transferMessage) // message reference
      .endCell();

    const walletContract = client.open(wallet);

    const seqno = await walletContract.getSeqno();
    console.log(`Current wallet seqno: ${seqno}`);

    // Send with more value to ensure enough for processing
    const vestingMessage = internal({
      to: vestingAddress,
      value: toNano('0.1'), // 0.1 TON should be enough to cover all fees
      body: extractBody,
    });

    try {
      console.log('Sending transaction...');
      await walletContract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [vestingMessage],
        sendMode: SendMode.PAY_GAS_SEPARATELY,
      });

      console.log('Transaction sent successfully!');
      console.log(`Wallet seqno is now ${seqno + 1}`);

      // Wait for transaction processing using proper retry mechanism
      console.log('\nWaiting for transaction to complete...');
      console.log('This may take up to 30 seconds on the TON blockchain...');

      // Sleep function to wait
      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      // Function to wait with exponential backoff and retry
      const waitForBalanceChange = async (
        address: Address,
        initialBalance: bigint,
        maxAttempts = 10,
        initialDelay = 3000
      ): Promise<[boolean, bigint]> => {
        let attempts = 0;
        let delay = initialDelay;

        while (attempts < maxAttempts) {
          try {
            // Wait before checking
            await sleep(delay);
            attempts++;

            const state = await client.getContractState(address);
            const currentBalance = BigInt(state.balance);

            console.log(
              `Attempt ${attempts}/${maxAttempts}: Contract balance is ${currentBalance} nanoTON`
            );

            // If balance changed, we're done
            if (currentBalance !== initialBalance) {
              return [true, currentBalance];
            }

            // Exponential backoff with cap
            delay = Math.min(delay * 1.5, 10000); // Cap at 10 seconds
          } catch (error) {
            console.log(`Error checking contract state on attempt ${attempts}: ${error}`);
          }
        }

        // We've exhausted retries, return the last known balance
        try {
          const finalState = await client.getContractState(vestingAddress);
          return [false, BigInt(finalState.balance)];
        } catch (error) {
          return [false, initialBalance]; // Return original balance if we can't get the current one
        }
      };

      // Wait for the balance to change with retry logic
      console.log('\nMonitoring contract balance for changes...');
      const [balanceChanged, _] = await waitForBalanceChange(vestingAddress, contractBalance);

      console.log('\nFinal contract check:');
      try {
        const newContractState = await client.getContractState(vestingAddress);
        console.log(`Contract status: ${newContractState.state || 'not found'}`);
        console.log(
          `Contract balance: ${newContractState.balance} nanoTON (${Number(newContractState.balance) / 1e9} TON)`
        );

        if (balanceChanged && BigInt(newContractState.balance) < contractBalance) {
          const withdrawn = contractBalance - BigInt(newContractState.balance);
          console.log(`\n✅ SUCCESS: Successfully withdrawn ${Number(withdrawn) / 1e9} TON`);
          console.log(`Remaining in contract: ${Number(newContractState.balance) / 1e9} TON`);

          // If there's still substantial balance, suggest another run
          if (BigInt(newContractState.balance) > toNano('0.05')) {
            console.log('\nThere is still a significant balance in the contract.');
            console.log('You may want to run this script again to extract more funds.');
          }
        } else {
          console.log('\n⚠️ WARNING: Contract balance did not appear to change after transaction.');
          console.log('Possible reasons:');
          console.log(
            '1. The transaction might still be processing (TON can sometimes take longer)'
          );
          console.log('2. The transaction may have failed due to contract restrictions');
          console.log('3. There might be network issues with the TON API');
          console.log(
            '\nRecommendation: Check the explorer and try again in a few minutes if needed'
          );
        }
      } catch (stateError) {
        console.log('Could not check final contract state.');
      }

      // Explain the TON transaction lifecycle to help understand the process
      console.log('\n--- Understanding TON Transaction Processing ---');
      console.log(
        '1. Transactions on TON typically finalize in 1-5 seconds but can take up to 30 seconds'
      );
      console.log('2. Your transaction goes through these phases:');
      console.log('   - Initial submission to the network');
      console.log('   - Block candidate inclusion');
      console.log('   - Block validation by validators');
      console.log('   - Final confirmation in the blockchain');
      console.log('3. The explorer sometimes shows results faster than API queries');

      console.log(
        `\nVerify the transaction at: https://testnet.tonscan.org/address/${vestingAddress.toString()}`
      );
      console.log(
        `And check your wallet at: https://testnet.tonscan.org/address/${walletAddress.toString()}`
      );
    } catch (txError: any) {
      console.error('Transaction Error:', txError.message);
      if (txError.response && txError.response.data) {
        console.error('Response details:', JSON.stringify(txError.response.data, null, 2));
      }
      console.log('\nPossible issues:');
      console.log('1. Wallet may not be initialized (seqno = 0 and no outgoing transactions)');
      console.log('2. Insufficient wallet balance for gas fees');
      console.log('3. API key rate limiting or server issues');
      console.log('4. You might not be the owner of the vesting contract');
      console.log('5. The contract may have restrictions based on time or locked amounts');
    }
  } catch (error: any) {
    console.error('Error:', error.message || error);
    if (error.response && error.response.data) {
      console.error('Response details:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

main().catch(console.error);
