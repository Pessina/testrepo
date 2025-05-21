import { Address, toNano, beginCell } from '@ton/core';
import { mnemonicToWalletKey } from '@ton/crypto';
import * as dotenv from 'dotenv';
import { TonClient, WalletContractV5R1, internal, SendMode } from '@ton/ton';

dotenv.config();

async function main() {
  console.log('Starting vesting wallet withdrawal script...');

  const contractAddress = process.env.VESTING_CONTRACT_ADDRESS;
  const apiKey = process.env.TON_API_KEY;
  const mnemonic = process.env.WALLET_MNEMONIC;
  const endpoint = process.env.TON_API_ENDPOINT;

  if (!contractAddress || !apiKey || !mnemonic || !endpoint) {
    console.error('Error: Missing required environment variables');
    process.exit(1);
  }

  console.log(`Checking vesting contract: ${contractAddress}`);

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
          subwalletNumber: 0,
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

    if (Number(walletState.balance) < Number(toNano('0.05'))) {
      console.error('Error: Your wallet has insufficient balance for transaction fees');
      console.log('Please ensure your wallet has at least 0.05 TON for gas fees');
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
    console.log(`Contract balance: ${contractState.balance} nanoTON`);

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
    console.log(`- Cliff duration: ${vestingData.cliffDuration} seconds`);
    console.log(`- Total amount: ${vestingData.vestingTotalAmount.toString()} nanoTON`);
    console.log(`- Sender address: ${vestingData.vestingSenderAddress.toString()}`);
    console.log(`- Owner address: ${vestingData.ownerAddress.toString()}`);

    const lockedAmountResult = await client.runMethod(vestingAddress, 'get_locked_amount', [
      { type: 'int', value: BigInt(currentTime) },
    ]);

    const lockedAmount = lockedAmountResult.stack.readBigNumber();
    console.log(`Currently locked amount: ${lockedAmount.toString()} nanoTON`);

    const availableAmount = vestingData.vestingTotalAmount - lockedAmount;
    console.log(
      `Available to withdraw: ${availableAmount.toString()} nanoTON (${Number(availableAmount) / 1e9} TON)`
    );

    if (availableAmount <= 0n) {
      console.log('No funds available for withdrawal.');
      process.exit(0);
    }

    const isDryRun = process.env.DRY_RUN !== 'false';
    if (isDryRun) {
      console.log(
        '\nThis is a dry run. Set DRY_RUN=false in your .env file to perform the actual withdrawal.'
      );
      process.exit(0);
    }

    console.log('\n*** PERFORMING ACTUAL WITHDRAWAL ***');
    console.log(`Withdrawing ${Number(availableAmount) / 1e9} TON to ${walletAddress.toString()}`);

    const withdrawBody = beginCell()
      .storeUint(0x10, 32)
      .storeUint(0, 64)
      .storeCoins(availableAmount)
      .storeAddress(walletAddress)
      .endCell();

    const walletContract = client.open(wallet);

    const seqno = await walletContract.getSeqno();
    console.log(`Current wallet seqno: ${seqno}`);

    if (seqno === 0 && walletState.state !== 'active') {
      console.error('Warning: Your wallet appears to be uninitialized (seqno=0)');
      console.log('You need to initialize your wallet by making an outgoing transaction first');
      console.log('Please send a small amount of TON from another wallet to activate it');
      process.exit(1);
    }

    const vestingMessage = internal({
      to: vestingAddress,
      value: toNano('0.05'),
      body: withdrawBody,
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
      console.log(
        `Check your transactions at https://testnet.tonscan.org/address/${walletAddress.toString()}`
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
      console.log(`4. Incorrect wallet version (you're using: ${walletVersion})`);
      console.log("5. The owner_address of the vesting contract doesn't match your wallet");
    }
  } catch (error: any) {
    console.error('Error:', error.message || error);
    if (error.response && error.response.data) {
      console.error('Response details:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

main().catch(console.error);
