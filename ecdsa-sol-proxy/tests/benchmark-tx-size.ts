import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { EcdsaProxy } from "../target/types/ecdsa_proxy";
import { ethers } from "ethers";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  createTransferInstruction,
} from "@solana/spl-token";
import {
  deriveWalletPDA,
  ethAddressFromWallet,
  signMessage,
  toAnchorInnerInstructions,
  toIndexedInnerInstructions,
  buildRemainingAccounts,
  InnerInstruction,
} from "./helpers/evm-signer";

describe("benchmark-tx-size", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ecdsaProxy as Program<EcdsaProxy>;
  const programId = program.programId;
  const payer = (provider.wallet as anchor.Wallet).payer;

  const evmWallet = ethers.Wallet.createRandom();
  const ethAddress = ethAddressFromWallet(evmWallet);

  let walletPDA: PublicKey;
  let mint: PublicKey;
  let pdaTokenAccount: PublicKey;

  function buildTokenTransferIx(
    source: PublicKey,
    dest: PublicKey,
    authority: PublicKey,
    amount: bigint
  ): InnerInstruction {
    const ix = createTransferInstruction(source, dest, authority, amount);
    return {
      programId: ix.programId,
      accounts: ix.keys.map((k) => ({
        pubkey: k.pubkey,
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      data: Buffer.from(ix.data),
    };
  }

  function buildFakeSwapIx(authority: PublicKey): InnerInstruction {
    const fakeProgram = Keypair.generate().publicKey;
    const accounts = [];
    for (let i = 0; i < 7; i++) {
      accounts.push({
        pubkey: Keypair.generate().publicKey,
        isSigner: false,
        isWritable: i < 4,
      });
    }
    accounts.push({ pubkey: authority, isSigner: true, isWritable: false });

    return {
      programId: fakeProgram,
      accounts,
      data: Buffer.alloc(20, 0xab),
    };
  }

  before(async () => {
    [walletPDA] = deriveWalletPDA(ethAddress, programId);

    await program.methods
      .initializeWallet(Array.from(ethAddress))
      .accounts({ payer: payer.publicKey })
      .rpc();

    mint = await createMint(provider.connection, payer, payer.publicKey, null, 6);

    const ata = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      walletPDA,
      true
    );
    pdaTokenAccount = ata.address;
    await mintTo(provider.connection, payer, mint, pdaTokenAccount, payer, 10_000_000);
  });

  async function measureTxSize(
    innerIxs: InnerInstruction[],
    remaining: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]
  ): Promise<number> {
    const remainingKeys = remaining.map((r) => r.pubkey);
    const indexed = toIndexedInnerInstructions(innerIxs, remainingKeys);
    const nonce = 0n;
    const { signature, recoveryId } = await signMessage(evmWallet, programId, nonce, indexed);

    const ix = await program.methods
      .execute(
        Array.from(signature),
        recoveryId,
        new anchor.BN(nonce.toString()),
        toAnchorInnerInstructions(indexed)
      )
      .accounts({
        walletState: walletPDA,
        payer: payer.publicKey,
      })
      .remainingAccounts(remaining)
      .instruction();

    const tx = new Transaction();
    tx.add(ix);
    tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
    tx.feePayer = payer.publicKey;
    tx.sign(payer);

    const serialized = tx.serialize();
    return serialized.length;
  }

  it("Scenario 1: Single SPL transfer", async () => {
    const recipientTA = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        mint,
        Keypair.generate().publicKey,
        true
      )
    ).address;

    const innerIx = buildTokenTransferIx(pdaTokenAccount, recipientTA, walletPDA, 100_000n);
    const remaining = buildRemainingAccounts([innerIx]);

    const size = await measureTxSize([innerIx], remaining);
    console.log(
      `[Benchmark] Single SPL transfer: ${size} bytes (${((size / 1232) * 100).toFixed(1)}%) — headroom: ${1232 - size} bytes`
    );
  });

  it("Scenario 2: Two SPL transfers", async () => {
    const recipientTA1 = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        mint,
        Keypair.generate().publicKey,
        true
      )
    ).address;
    const recipientTA2 = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        mint,
        Keypair.generate().publicKey,
        true
      )
    ).address;

    const innerIx1 = buildTokenTransferIx(pdaTokenAccount, recipientTA1, walletPDA, 50_000n);
    const innerIx2 = buildTokenTransferIx(pdaTokenAccount, recipientTA2, walletPDA, 30_000n);
    const remaining = buildRemainingAccounts([innerIx1, innerIx2]);

    const size = await measureTxSize([innerIx1, innerIx2], remaining);
    console.log(
      `[Benchmark] Two SPL transfers: ${size} bytes (${((size / 1232) * 100).toFixed(1)}%) — headroom: ${1232 - size} bytes`
    );
  });

  it("Scenario 3: Swap-like (8 accounts)", async () => {
    const innerIx = buildFakeSwapIx(walletPDA);
    const remaining = buildRemainingAccounts([innerIx]);

    const size = await measureTxSize([innerIx], remaining);
    console.log(
      `[Benchmark] Swap-like (8 accts): ${size} bytes (${((size / 1232) * 100).toFixed(1)}%) — headroom: ${1232 - size} bytes`
    );
  });
});
