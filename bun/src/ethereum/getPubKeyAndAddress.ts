import { privateKeyToAccount } from 'viem/accounts';

function getPubKeyAndAddressFromPrivateKey(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  
  const publicKey = account.publicKey;
  const address = account.address;
  
  return {
    publicKey,
    address
  };
}

function main(privateKey: `0x${string}`) {
  if (!privateKey) {
    console.error('Please set ETHEREUM_PRIVATE_KEY in your .env file');
    console.error('Example: ETHEREUM_PRIVATE_KEY=0x1234567890abcdef...');
    process.exit(1);
  }
  
  if (!privateKey.startsWith('0x')) {
    console.error('Private key must start with 0x');
    process.exit(1);
  }
  
  try {
    const { publicKey, address } = getPubKeyAndAddressFromPrivateKey(privateKey as `0x${string}`);
    
    console.log('=== Ethereum Key Derivation ===');
    console.log('Private Key:', privateKey.slice(0, 10) + '...' + privateKey.slice(-8));
    console.log('Public Key:', publicKey);
    console.log('Address:', address);
    console.log('===============================');
  } catch (error) {
    console.error('Error deriving keys:', error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
}

export { getPubKeyAndAddressFromPrivateKey };