// import { toNano, TonClient } from '@ton/ton';
// import { getWallet } from '../utils/getWallet';
// import { getEnv } from '../utils/getEnv';
// import { VestingContract } from '../utils/VestingContract';

// async function main() {
//   const { contractAddress, apiKey, endpoint, keyPair } = await getEnv();

//   console.log(`Target vesting contract: ${contractAddress}`);

//   try {
//     const client = new TonClient({
//       endpoint,
//       apiKey,
//     });

//     const wallet = getWallet({ keyPair, subwalletNumber: 0 });
//     const walletAddress = wallet.address;

//     const vestingContract = new VestingContract(client, contractAddress, wallet);

//     const contractState = await vestingContract.getAllContractData();
//     await vestingContract.logContractState(contractState);

//     const walletState = await client.getContractState(walletAddress);
//     console.log(
//       `Wallet balance: ${walletState.balance} nanoTON (${Number(walletState.balance) / 1e9} TON)`
//     );

//     if (Number(walletState.balance) < Number(toNano('0.15'))) {
//       console.error('Error: Your wallet has insufficient balance for transaction fees');
//       console.log('Please ensure your wallet has at least 0.15 TON for gas fees');
//       process.exit(1);
//     }

//     if (walletAddress.toString() !== contractState.ownerAddress.toString()) {
//       console.error(
//         'Error: Your wallet address does not match the owner address of the vesting contract'
//       );
//       console.log(`Contract owner: ${contractState.ownerAddress.toString()}`);
//       console.log(`Your wallet: ${walletAddress.toString()}`);
//       process.exit(1);
//     }

//     // Calculate the amount to withdraw
//     // const withdrawAmount = Number(contractState.balance) - Number(contractState.lockedAmount);
//     const withdrawAmount = Number(contractState.balance);

//     await vestingContract.extractFunds(keyPair, walletAddress, toNano(withdrawAmount.toString()));

//     const [isSuccess, newBalance] = await vestingContract.waitForBalanceChange(
//       contractState.balance,
//       withdrawAmount
//     );

//     if (isSuccess) {
//       console.log(`Withdrawal successful. New balance: ${newBalance.toString()} nanoTON`);
//     } else {
//       console.error('Withdrawal failed.');
//     }
//   } catch (error) {
//     console.error('Error:', error);
//   }
// }

// main().catch(console.error);
