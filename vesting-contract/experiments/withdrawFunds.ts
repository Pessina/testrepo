import { TonClient } from '@ton/ton';
import { getWallet } from './utils/getWallet';
import { getEnv } from './utils/getEnv';
import { VestingContract } from './utils/VestingContract';
import { formatter } from './utils/formatter';
import { SAFETY_MARGIN } from './utils/constants';

async function main() {
  const { contractAddress, apiKey, endpoint, keyPair } = await getEnv();

  try {
    const client = new TonClient({
      endpoint,
      apiKey,
    });

    /* 
      Test:
        - Owner -> Owner
        - VestingSender -> VestingSender
        - Owner -> VestingSender
        - VestingSender -> Owner
        - Owner -> Whitelisted address
        - VestingSender -> Whitelisted address
        - Internal/External message (External = Public Key)
    */

    const ownerWallet = getWallet({ keyPair, subwalletNumber: 0 });
    const receiverWallet = getWallet({ keyPair, subwalletNumber: 0 });

    console.log('\n=== Wallet Information ===');
    console.log(`Owner Wallet Address:      ${formatter.address(ownerWallet.address)}`);
    console.log(`Receiver Wallet Address:   ${formatter.address(receiverWallet.address)}`);
    console.log('\n========================================');

    const vestingContract = new VestingContract(client, contractAddress, ownerWallet);
    const contractState = await vestingContract.getAllContractData();
    await vestingContract.logContractState(contractState);

    const withdrawAmount = contractState.balance - SAFETY_MARGIN - contractState.lockedAmount;

    if (withdrawAmount <= 0) {
      console.log('No funds available to withdraw');
      return;
    }

    console.log(
      `Attempting to withdraw ${Number(withdrawAmount) / 1e9} TON to ${formatter.address(receiverWallet.address)}`
    );

    await vestingContract.extractFunds(keyPair, receiverWallet.address, withdrawAmount);

    const [isSuccess, newBalance] = await vestingContract.waitForBalanceChange(
      contractState.balance
    );

    if (isSuccess) {
      console.log(`Withdrawal successful. New balance: ${Number(newBalance) / 1e9} TON`);
    } else {
      console.error(
        'Withdrawal may have failed or is still processing. Please check the contract balance manually.'
      );
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);
