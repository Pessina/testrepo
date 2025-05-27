import { Address, TonClient } from '@ton/ton';
import { getWallet } from './utils/getWallet';
import { getEnv } from './utils/getEnv';
import { VestingContract } from './utils/VestingContract';
import { formatter } from './utils/formatter';
import { TON_POOL_PAIR } from './utils/constants';

async function main() {
  const { contractAddress, apiKey, endpoint, keyPair } = await getEnv();

  try {
    const client = new TonClient({
      endpoint,
      apiKey,
    });

    const ownerWallet = getWallet({ keyPair, subwalletNumber: 1 });
    const vestingSenderWallet = getWallet({ keyPair, subwalletNumber: 1 });

    console.log('\n=== Wallet Information ===');
    console.log(`Owner Wallet Address:      ${formatter.address(ownerWallet.address)}`);
    console.log(`Vesting Sender Address:    ${formatter.address(vestingSenderWallet.address)}`);
    console.log('\n========================================');

    const vestingContract = new VestingContract(client, contractAddress, vestingSenderWallet);

    const contractState = await vestingContract.getAllContractData();
    await vestingContract.logContractState(contractState);

    const addressesToWhitelist = [Address.parse(TON_POOL_PAIR[0]), Address.parse(TON_POOL_PAIR[1])];

    console.log('\n=== Adding Addresses to Whitelist ===');

    for (const address of addressesToWhitelist) {
      const isWhitelisted = await vestingContract.isWhitelisted(address);
      console.log(
        `Address ${formatter.address(address)} is ${isWhitelisted ? 'already whitelisted' : 'not whitelisted'}`
      );
    }

    const newSeqno = await vestingContract.addWhitelistedAddresses(keyPair, addressesToWhitelist);

    console.log(`\nTransaction sent. Seqno: ${newSeqno}`);
    console.log(`Wait a few seconds for the transaction to be processed...`);

    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log('\n=== Verification ===');
    for (const address of addressesToWhitelist) {
      const isWhitelisted = await vestingContract.isWhitelisted(address);
      console.log(
        `Address ${formatter.address(address)} is ${isWhitelisted ? 'now whitelisted' : 'still not whitelisted'}`
      );
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);
