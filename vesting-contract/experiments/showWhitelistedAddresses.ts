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

    // Create wallets
    const ownerWallet = getWallet({ keyPair, subwalletNumber: 1 });

    console.log('\n=== Wallet Information ===');
    console.log(`Owner Wallet Address: ${formatter.address(ownerWallet.address)}`);
    console.log('\n========================================');

    // Initialize the contract
    const vestingContract = new VestingContract(client, contractAddress, ownerWallet);

    // Get contract data (includes whitelisted addresses)
    const contractState = await vestingContract.getAllContractData();

    // Log the contract state (will include whitelisted addresses)
    await vestingContract.logContractState(contractState);

    // Additional detailed information about whitelisted addresses
    if (contractState.whitelistedAddresses.length > 0) {
      console.log('\n=== Checking Whitelist Status ===');

      for (const address of contractState.whitelistedAddresses) {
        // Double-check each address with the contract's is_whitelisted method
        const isWhitelisted = await vestingContract.isWhitelisted(address);
        console.log(
          `Address ${formatter.address(address)}: ${isWhitelisted ? 'Confirmed' : 'Not confirmed'} as whitelisted`
        );
      }

      console.log('\n========================================');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);
