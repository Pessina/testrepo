import { TonClient } from '@ton/ton';
import { getWallet } from '../utils/getWallet';
import { getEnv } from '../utils/getEnv';
import { VestingContract } from '../utils/VestingContract';
import { formatter } from '../utils/formatter';

async function main() {
  const { contractAddress, apiKey, endpoint, keyPair } = await getEnv();

  try {
    const client = new TonClient({
      endpoint,
      apiKey,
    });

    const ownerWallet = getWallet({ keyPair, subwalletNumber: 1 });

    console.log('\n=== Wallet Information ===');
    console.log(`Owner Wallet Address: ${formatter.address(ownerWallet.address)}`);
    console.log('\n========================================');

    const vestingContract = new VestingContract(client, contractAddress, ownerWallet);

    const contractState = await vestingContract.getAllContractData();

    await vestingContract.logContractState(contractState);
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);
