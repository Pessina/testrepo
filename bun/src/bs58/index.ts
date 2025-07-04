import bs58 from 'bs58';

// Input byte array
const byteArray: number[] = [];

// Convert to Uint8Array as required by bs58
const uint8Array = new Uint8Array(byteArray);

// Encode to Base58
const base58String = bs58.encode(uint8Array);

console.log(`Base58 encoded string: ${base58String}`);