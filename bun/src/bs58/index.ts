import bs58 from 'bs58';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the .env file in the bs58 directory
dotenv.config({ path: path.join(__dirname, '.env') });

console.log(process.env.PRIVATE_KEY);

// Input byte array from environment variable
const byteArray: number[] = JSON.parse(process.env.PRIVATE_KEY || '[]');

// Convert to Uint8Array as required by bs58
const uint8Array = new Uint8Array(byteArray);

// Encode to Base58
const base58String = bs58.encode(uint8Array);

console.log(`Base58 encoded string: ${base58String}`);