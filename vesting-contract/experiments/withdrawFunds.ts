import { TonClient } from '@ton/ton';
import { getWallet } from '../utils/getWallet';
import { getEnv } from '../utils/getEnv';
import { VestingContract } from '../utils/contract';
import { withdrawAllFunds } from '../utils/withdrawAmounts';

async function main() {
  const { contractAddress, apiKey, endpoint, keyPair } = await getEnv();

  console.log(`Target vesting contract: ${contractAddress}`);

  try {
    const client = new TonClient({
      endpoint,
      apiKey,
    });

    const wallet = getWallet({ keyPair, subwalletNumber: 0 });
    const walletAddress = wallet.address;

    const walletState = await client.getContractState(walletAddress);
    console.log(
      `Wallet balance: ${walletState.balance} nanoTON (${Number(walletState.balance) / 1e9} TON)`
    );

    const vestingContract = new VestingContract(client, contractAddress);

    const contractState = await vestingContract.getContractState();

    console.log(
      `Contract balance: ${contractState.balance} nanoTON (${Number(contractState.balance) / 1e9} TON)`
    );

    const vestingData = await vestingContract.getVestingData();

    console.log(`\nVesting Schedule Information:`);
    console.log(`- Start Time: ${new Date(vestingData.vestingStartTime * 1000).toLocaleString()}`);
    console.log(`- Total Duration: ${vestingData.vestingTotalDuration / 60} minutes`);
    console.log(`- Unlock Period: ${vestingData.unlockPeriod / 60} minutes`);
    console.log(`- Cliff Duration: ${vestingData.cliffDuration} seconds`);
    console.log(`- Total Amount: ${Number(vestingData.vestingTotalAmount) / 1e9} TON`);

    const withdrawAmount = await withdrawAllFunds(client, contractAddress, keyPair, walletAddress);

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
