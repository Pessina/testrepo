import { mnemonicToWalletKey } from '@ton/crypto';
import dotenv from 'dotenv';

dotenv.config();

export const getEnv = async () => {
  const contractAddress = process.env.VESTING_CONTRACT_ADDRESS;
  const apiKey = process.env.TON_API_KEY;
  const endpoint = process.env.TON_API_ENDPOINT;
  const mnemonic = process.env.WALLET_MNEMONIC;

  if (!contractAddress || !apiKey || !mnemonic || !endpoint) {
    console.error('Error: Missing required environment variables');
    process.exit(1);
  }

  const keyPair = await mnemonicToWalletKey(mnemonic.split(' ').filter(word => word !== ''));

  return { contractAddress, apiKey, endpoint, keyPair };
};
