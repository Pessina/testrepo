import { toNano, TonClient } from '@ton/ton';
import { getWallet } from '../utils/getWallet';
import { getEnv } from '../utils/getEnv';
import { VestingContract } from '../utils/VestingContract';

async function main() {
  const { contractAddress, apiKey, endpoint, keyPair } = await getEnv();

  try {
    const client = new TonClient({
      endpoint,
      apiKey,
    });

    const ownerWallet = getWallet({ keyPair, subwalletNumber: 1 });
    const vestingSenderWallet = getWallet({ keyPair, subwalletNumber: 0 });

    console.log('\n=== Wallet Information ===');
    console.log(
      `Owner Wallet Address:      ${ownerWallet.address.toString({
        testOnly: false,
        bounceable: true,
        urlSafe: true,
      })}`
    );
    console.log(
      `Vesting Sender Address:    ${vestingSenderWallet.address.toString({
        testOnly: false,
        bounceable: true,
        urlSafe: true,
      })}`
    );
    console.log('========================================\n');

    const vestingContract = new VestingContract(client, contractAddress, ownerWallet);
    const contractState = await vestingContract.getAllContractData();
    await vestingContract.logContractState(contractState);

    const SAFETY_MARGIN = toNano('0.01');

    // Calculate the amount to withdraw
    // const withdrawAmount = Number(contractState.balance) - Number(contractState.lockedAmount);
    const withdrawAmount = Number(contractState.balance) - Number(SAFETY_MARGIN);

    await vestingContract.extractFunds(
      keyPair,
      vestingSenderWallet.address,
      BigInt(withdrawAmount)
    );

    const [isSuccess, newBalance] = await vestingContract.waitForBalanceChange(
      contractState.balance,
      withdrawAmount
    );

    if (isSuccess) {
      console.log(`Withdrawal successful. New balance: ${newBalance.toString()} nanoTON`);
    } else {
      console.error('Withdrawal failed.');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);
