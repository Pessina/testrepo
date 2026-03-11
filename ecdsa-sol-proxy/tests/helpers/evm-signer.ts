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

const CHAIN_ID = 1n;
const WALLET_SEED = Buffer.from("ecdsa_proxy");
const WALLET_PREFIX = Buffer.from("wallet");

const SECP256K1_ORDER = BigInt(
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141"
);

export function deriveWalletPDA(
  ethAddress: Buffer,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [WALLET_SEED, WALLET_PREFIX, ethAddress],
    programId
  );
}

export function ethAddressFromWallet(wallet: ethers.Wallet): Buffer {
  return Buffer.from(wallet.address.slice(2), "hex");
}

function borshSerializeInnerInstruction(ix: InnerInstruction): Buffer {
  const programIdBuf = ix.programId.toBuffer();

  const accountsLen = Buffer.alloc(4);
  accountsLen.writeUInt32LE(ix.accounts.length, 0);
  const accountsBufs = ix.accounts.map((a) => {
    const buf = Buffer.alloc(34);
    a.pubkey.toBuffer().copy(buf, 0);
    buf[32] = a.isSigner ? 1 : 0;
    buf[33] = a.isWritable ? 1 : 0;
    return buf;
  });

  const dataLen = Buffer.alloc(4);
  dataLen.writeUInt32LE(ix.data.length, 0);

  return Buffer.concat([
    programIdBuf,
    accountsLen,
    ...accountsBufs,
    dataLen,
    ix.data,
  ]);
}

export function computeInnerHash(
  programId: PublicKey,
  nonce: bigint,
  innerInstructions: InnerInstruction[]
): Buffer {
  const instructionsData = Buffer.concat(
    innerInstructions.length > 0
      ? innerInstructions.map(borshSerializeInnerInstruction)
      : [Buffer.alloc(0)]
  );
  const instructionsHash = Buffer.from(
    keccak_256.arrayBuffer(instructionsData)
  );

  const innerData = Buffer.alloc(8 + 32 + 8 + 32);
  innerData.writeBigUInt64LE(CHAIN_ID, 0);
  programId.toBuffer().copy(innerData, 8);
  innerData.writeBigUInt64LE(nonce, 40);
  instructionsHash.copy(innerData, 48);

  return Buffer.from(keccak_256.arrayBuffer(innerData));
}

export function computeInnerHashWithChainId(
  chainId: bigint,
  programId: PublicKey,
  nonce: bigint,
  innerInstructions: InnerInstruction[]
): Buffer {
  const instructionsData = Buffer.concat(
    innerInstructions.length > 0
      ? innerInstructions.map(borshSerializeInnerInstruction)
      : [Buffer.alloc(0)]
  );
  const instructionsHash = Buffer.from(
    keccak_256.arrayBuffer(instructionsData)
  );

  const innerData = Buffer.alloc(8 + 32 + 8 + 32);
  innerData.writeBigUInt64LE(chainId, 0);
  programId.toBuffer().copy(innerData, 8);
  innerData.writeBigUInt64LE(nonce, 40);
  instructionsHash.copy(innerData, 48);

  return Buffer.from(keccak_256.arrayBuffer(innerData));
}

export async function signMessage(
  wallet: ethers.Wallet,
  programId: PublicKey,
  nonce: bigint,
  innerInstructions: InnerInstruction[]
): Promise<{ signature: Buffer; recoveryId: number }> {
  const innerHash = computeInnerHash(programId, nonce, innerInstructions);
  const sig = await wallet.signMessage(innerHash);

  const sigBytes = Buffer.from(sig.slice(2), "hex");
  const r = sigBytes.slice(0, 32);
  const s = sigBytes.slice(32, 64);
  const v = sigBytes[64];
  const recoveryId = v - 27;

  return { signature: Buffer.concat([r, s]), recoveryId };
}

export async function signMessageWithChainId(
  wallet: ethers.Wallet,
  chainId: bigint,
  programId: PublicKey,
  nonce: bigint,
  innerInstructions: InnerInstruction[]
): Promise<{ signature: Buffer; recoveryId: number }> {
  const innerHash = computeInnerHashWithChainId(
    chainId,
    programId,
    nonce,
    innerInstructions
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

  let sBigInt = BigInt("0x" + s.toString("hex"));
  const highS = SECP256K1_ORDER - sBigInt;
  const highSHex = highS.toString(16).padStart(64, "0");

  return Buffer.concat([r, Buffer.from(highSHex, "hex")]);
}

export function toAnchorInnerInstructions(
  innerInstructions: InnerInstruction[]
) {
  return innerInstructions.map((ix) => ({
    programId: ix.programId,
    accounts: ix.accounts.map((a) => ({
      pubkey: a.pubkey,
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data: ix.data,
  }));
}
