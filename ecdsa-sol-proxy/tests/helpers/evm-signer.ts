import { ethers } from "ethers";
import jsSha3 from "js-sha3";
const { keccak_256 } = jsSha3;
import { PublicKey } from "@solana/web3.js";

export interface InnerAccountMeta {
  pubkey: PublicKey;
  isSigner: boolean;
  isWritable: boolean;
}

export interface InnerInstruction {
  programId: PublicKey;
  accounts: InnerAccountMeta[];
  data: Buffer;
}

/** Index-based version sent on-chain (flags: bit 0 = isSigner, bit 1 = isWritable) */
export interface IndexedInnerAccountMeta {
  accountIndex: number;
  isSigner: boolean;
  isWritable: boolean;
}

function packFlags(isSigner: boolean, isWritable: boolean): number {
  return (isSigner ? 0x01 : 0) | (isWritable ? 0x02 : 0);
}

export interface IndexedInnerInstruction {
  programIdIndex: number;
  accounts: IndexedInnerAccountMeta[];
  data: Buffer;
}

const CHAIN_ID = 1n;
const WALLET_SEED = Buffer.from("ecdsa_proxy");
const WALLET_PREFIX = Buffer.from("wallet");

const SECP256K1_ORDER = BigInt(
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141"
);

export function deriveWalletPDA(ethAddress: Buffer, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([WALLET_SEED, WALLET_PREFIX, ethAddress], programId);
}

export function ethAddressFromWallet(wallet: ethers.BaseWallet): Buffer {
  return Buffer.from(wallet.address.slice(2), "hex");
}

/**
 * Convert pubkey-based InnerInstructions to index-based, given a remaining_accounts list.
 * Returns the indexed instructions that match the indices in remainingAccounts.
 */
export function toIndexedInnerInstructions(
  innerInstructions: InnerInstruction[],
  remainingAccounts: PublicKey[]
): IndexedInnerInstruction[] {
  const keyToIndex = new Map<string, number>();
  remainingAccounts.forEach((key, i) => keyToIndex.set(key.toBase58(), i));

  return innerInstructions.map((ix) => {
    const programIdIndex = keyToIndex.get(ix.programId.toBase58());
    if (programIdIndex === undefined) {
      throw new Error(`Program ID ${ix.programId.toBase58()} not found in remainingAccounts`);
    }
    return {
      programIdIndex,
      accounts: ix.accounts.map((a) => {
        const accountIndex = keyToIndex.get(a.pubkey.toBase58());
        if (accountIndex === undefined) {
          throw new Error(`Account ${a.pubkey.toBase58()} not found in remainingAccounts`);
        }
        return {
          accountIndex,
          isSigner: a.isSigner,
          isWritable: a.isWritable,
        };
      }),
      data: ix.data,
    };
  });
}

/** Borsh-serialize an IndexedInnerInstruction (matches on-chain Borsh layout) */
function borshSerializeIndexedInnerInstruction(ix: IndexedInnerInstruction): Buffer {
  const programIdIndexBuf = Buffer.alloc(1);
  programIdIndexBuf[0] = ix.programIdIndex;

  const accountsLen = Buffer.alloc(4);
  accountsLen.writeUInt32LE(ix.accounts.length, 0);
  const accountsBufs = ix.accounts.map((a) => {
    const buf = Buffer.alloc(2);
    buf[0] = a.accountIndex;
    buf[1] = packFlags(a.isSigner, a.isWritable);
    return buf;
  });

  const dataLen = Buffer.alloc(4);
  dataLen.writeUInt32LE(ix.data.length, 0);

  return Buffer.concat([programIdIndexBuf, accountsLen, ...accountsBufs, dataLen, ix.data]);
}

export function computeInnerHash(
  programId: PublicKey,
  nonce: bigint,
  remainingAccountKeys: PublicKey[],
  indexedInstructions: IndexedInnerInstruction[]
): Buffer {
  const instructionsData = Buffer.concat(
    indexedInstructions.length > 0
      ? indexedInstructions.map(borshSerializeIndexedInnerInstruction)
      : [Buffer.alloc(0)]
  );
  const instructionsHash = Buffer.from(keccak_256.arrayBuffer(instructionsData));

  // Hash remaining account keys: keccak256(key0 || key1 || ... || keyN)
  const accountsData = Buffer.concat(remainingAccountKeys.map((k) => k.toBuffer()));
  const accountsHash = Buffer.from(keccak_256.arrayBuffer(accountsData));

  // chain_id(8) || program_id(32) || nonce(8) || accounts_hash(32) || instructions_hash(32) = 112
  const innerData = Buffer.alloc(8 + 32 + 8 + 32 + 32);
  innerData.writeBigUInt64LE(CHAIN_ID, 0);
  programId.toBuffer().copy(innerData, 8);
  innerData.writeBigUInt64LE(nonce, 40);
  accountsHash.copy(innerData, 48);
  instructionsHash.copy(innerData, 80);

  return Buffer.from(keccak_256.arrayBuffer(innerData));
}

export function computeInnerHashWithChainId(
  chainId: bigint,
  programId: PublicKey,
  nonce: bigint,
  remainingAccountKeys: PublicKey[],
  indexedInstructions: IndexedInnerInstruction[]
): Buffer {
  const instructionsData = Buffer.concat(
    indexedInstructions.length > 0
      ? indexedInstructions.map(borshSerializeIndexedInnerInstruction)
      : [Buffer.alloc(0)]
  );
  const instructionsHash = Buffer.from(keccak_256.arrayBuffer(instructionsData));

  const accountsData = Buffer.concat(remainingAccountKeys.map((k) => k.toBuffer()));
  const accountsHash = Buffer.from(keccak_256.arrayBuffer(accountsData));

  const innerData = Buffer.alloc(8 + 32 + 8 + 32 + 32);
  innerData.writeBigUInt64LE(chainId, 0);
  programId.toBuffer().copy(innerData, 8);
  innerData.writeBigUInt64LE(nonce, 40);
  accountsHash.copy(innerData, 48);
  instructionsHash.copy(innerData, 80);

  return Buffer.from(keccak_256.arrayBuffer(innerData));
}

export async function signMessage(
  wallet: ethers.BaseWallet,
  programId: PublicKey,
  nonce: bigint,
  remainingAccountKeys: PublicKey[],
  indexedInstructions: IndexedInnerInstruction[]
): Promise<{ signature: Buffer; recoveryId: number }> {
  const innerHash = computeInnerHash(programId, nonce, remainingAccountKeys, indexedInstructions);
  const sig = await wallet.signMessage(innerHash);

  const sigBytes = Buffer.from(sig.slice(2), "hex");
  const r = sigBytes.slice(0, 32);
  const s = sigBytes.slice(32, 64);
  const v = sigBytes[64];
  const recoveryId = v - 27;

  return { signature: Buffer.concat([r, s]), recoveryId };
}

export async function signMessageWithChainId(
  wallet: ethers.BaseWallet,
  chainId: bigint,
  programId: PublicKey,
  nonce: bigint,
  remainingAccountKeys: PublicKey[],
  indexedInstructions: IndexedInnerInstruction[]
): Promise<{ signature: Buffer; recoveryId: number }> {
  const innerHash = computeInnerHashWithChainId(
    chainId,
    programId,
    nonce,
    remainingAccountKeys,
    indexedInstructions
  );
  const sig = await wallet.signMessage(innerHash);
  const sigBytes = Buffer.from(sig.slice(2), "hex");
  return {
    signature: Buffer.concat([sigBytes.slice(0, 32), sigBytes.slice(32, 64)]),
    recoveryId: sigBytes[64] - 27,
  };
}

export function makeHighS(signature: Buffer): Buffer {
  const r = signature.slice(0, 32);
  const s = signature.slice(32, 64);

  const sBigInt = BigInt("0x" + s.toString("hex"));
  const highS = SECP256K1_ORDER - sBigInt;
  const highSHex = highS.toString(16).padStart(64, "0");

  return Buffer.concat([r, Buffer.from(highSHex, "hex")]);
}

export function toAnchorInnerInstructions(indexedInstructions: IndexedInnerInstruction[]) {
  return indexedInstructions.map((ix) => ({
    programIdIndex: ix.programIdIndex,
    accounts: ix.accounts.map((a) => ({
      accountIndex: a.accountIndex,
      flags: packFlags(a.isSigner, a.isWritable),
    })),
    data: ix.data,
  }));
}

/**
 * Build a remainingAccounts list from pubkey-based InnerInstructions,
 * deduplicating keys while preserving order.
 */
export function buildRemainingAccounts(
  innerInstructions: InnerInstruction[]
): { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] {
  const seen = new Map<string, { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>();

  for (const ix of innerInstructions) {
    for (const acct of ix.accounts) {
      const key = acct.pubkey.toBase58();
      const existing = seen.get(key);
      if (existing) {
        // Merge: isWritable is true if any usage is writable
        existing.isWritable = existing.isWritable || acct.isWritable;
      } else {
        seen.set(key, {
          pubkey: acct.pubkey,
          isSigner: false, // PDA signs via invoke_signed, not at tx level
          isWritable: acct.isWritable,
        });
      }
    }
    // Add program ID
    const progKey = ix.programId.toBase58();
    if (!seen.has(progKey)) {
      seen.set(progKey, {
        pubkey: ix.programId,
        isSigner: false,
        isWritable: false,
      });
    }
  }

  return Array.from(seen.values());
}
