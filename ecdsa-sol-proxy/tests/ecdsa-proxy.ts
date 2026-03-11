import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { EcdsaProxy } from "../target/types/ecdsa_proxy";
import { ethers } from "ethers";
import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
} from "@solana/spl-token";
import {
  deriveWalletPDA,
  ethAddressFromWallet,
  signMessage,
  signMessageWithChainId,
  makeHighS,
  toAnchorInnerInstructions,
  InnerInstruction,
} from "./helpers/evm-signer";

describe("ecdsa-proxy", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ecdsaProxy as Program<EcdsaProxy>;
  const programId = program.programId;
  const payer = (provider.wallet as anchor.Wallet).payer;

  const evmWallet = ethers.Wallet.createRandom();
  const evmWallet2 = ethers.Wallet.createRandom();

  const ethAddress = ethAddressFromWallet(evmWallet);
  const ethAddress2 = ethAddressFromWallet(evmWallet2);

  let walletPDA: PublicKey;
  let walletBump: number;
  let wallet2PDA: PublicKey;

  let mint: PublicKey;
  let pdaTokenAccount: PublicKey;

  async function getNonce(pda: PublicKey): Promise<bigint> {
    const state = await program.account.walletState.fetch(pda);
    return BigInt(state.nonce.toString());
  }

  async function createATA(owner: PublicKey): Promise<PublicKey> {
    const ata = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      owner,
      true // allowOwnerOffCurve — needed for PDAs
    );
    return ata.address;
  }

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

  before(async () => {
    [walletPDA, walletBump] = deriveWalletPDA(ethAddress, programId);
    [wallet2PDA] = deriveWalletPDA(ethAddress2, programId);

    mint = await createMint(provider.connection, payer, payer.publicKey, null, 6);
  });

  // ── Test 1: Initialize wallet ──────────────────────────────────────

  it("1. Initialize wallet — PDA created, correct state", async () => {
    await program.methods
      .initializeWallet(Array.from(ethAddress))
      .accounts({ payer: payer.publicKey })
      .rpc();

    const state = await program.account.walletState.fetch(walletPDA);
    expect(Buffer.from(state.ethAddress)).to.deep.equal(ethAddress);
    expect(state.nonce.toNumber()).to.equal(0);
    expect(state.bump).to.equal(walletBump);
  });

  // ── Test 2: Initialize duplicate fails ─────────────────────────────

  it("2. Initialize duplicate — fails (PDA already exists)", async () => {
    try {
      await program.methods
        .initializeWallet(Array.from(ethAddress))
        .accounts({ payer: payer.publicKey })
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: unknown) {
      expect(err).to.not.equal(undefined);
    }
  });

  // ── Test 3: Execute SPL token transfer ─────────────────────────────

  it("3. Execute SPL token transfer — PDA signs as authority, tokens move, nonce increments", async () => {
    pdaTokenAccount = await createATA(walletPDA);

    await mintTo(provider.connection, payer, mint, pdaTokenAccount, payer, 1_000_000);

    const recipientTA = await createATA(Keypair.generate().publicKey);
    const transferAmount = 100_000n;
    const innerIx = buildTokenTransferIx(pdaTokenAccount, recipientTA, walletPDA, transferAmount);

    const nonce = await getNonce(walletPDA);
    const { signature, recoveryId } = await signMessage(evmWallet, programId, nonce, [innerIx]);

    await program.methods
      .execute(
        Array.from(signature),
        recoveryId,
        new anchor.BN(nonce.toString()),
        toAnchorInnerInstructions([innerIx])
      )
      .accounts({
        walletState: walletPDA,
        payer: payer.publicKey,
      })
      .remainingAccounts([
        { pubkey: pdaTokenAccount, isSigner: false, isWritable: true },
        { pubkey: recipientTA, isSigner: false, isWritable: true },
        { pubkey: walletPDA, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ])
      .rpc();

    const recipientAccount = await getAccount(provider.connection, recipientTA);
    expect(Number(recipientAccount.amount)).to.equal(Number(transferAmount));

    const state = await program.account.walletState.fetch(walletPDA);
    expect(state.nonce.toNumber()).to.equal(1);
  });

  // ── Test 4: Execute second transfer ────────────────────────────────

  it("4. Execute second token transfer — nonce increments correctly", async () => {
    const recipientTA = await createATA(Keypair.generate().publicKey);
    const transferAmount = 50_000n;
    const innerIx = buildTokenTransferIx(pdaTokenAccount, recipientTA, walletPDA, transferAmount);

    const nonce = await getNonce(walletPDA);
    const { signature, recoveryId } = await signMessage(evmWallet, programId, nonce, [innerIx]);

    await program.methods
      .execute(
        Array.from(signature),
        recoveryId,
        new anchor.BN(nonce.toString()),
        toAnchorInnerInstructions([innerIx])
      )
      .accounts({
        walletState: walletPDA,
        payer: payer.publicKey,
      })
      .remainingAccounts([
        { pubkey: pdaTokenAccount, isSigner: false, isWritable: true },
        { pubkey: recipientTA, isSigner: false, isWritable: true },
        { pubkey: walletPDA, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ])
      .rpc();

    const recipientAccount = await getAccount(provider.connection, recipientTA);
    expect(Number(recipientAccount.amount)).to.equal(Number(transferAmount));
    expect(Number(await getNonce(walletPDA))).to.equal(Number(nonce) + 1);
  });

  // ── Test 5: Replay protection ──────────────────────────────────────

  it("5. Replay protection — same signed message fails after execution", async () => {
    const recipientTA = await createATA(Keypair.generate().publicKey);
    const innerIx = buildTokenTransferIx(pdaTokenAccount, recipientTA, walletPDA, 10_000n);

    const nonce = await getNonce(walletPDA);
    const { signature, recoveryId } = await signMessage(evmWallet, programId, nonce, [innerIx]);

    const accounts = { walletState: walletPDA, payer: payer.publicKey };
    const remainingAccounts = [
      { pubkey: pdaTokenAccount, isSigner: false, isWritable: true },
      { pubkey: recipientTA, isSigner: false, isWritable: true },
      { pubkey: walletPDA, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    await program.methods
      .execute(
        Array.from(signature),
        recoveryId,
        new anchor.BN(nonce.toString()),
        toAnchorInnerInstructions([innerIx])
      )
      .accounts(accounts)
      .remainingAccounts(remainingAccounts)
      .rpc();

    try {
      await program.methods
        .execute(
          Array.from(signature),
          recoveryId,
          new anchor.BN(nonce.toString()),
          toAnchorInnerInstructions([innerIx])
        )
        .accounts(accounts)
        .remainingAccounts(remainingAccounts)
        .rpc();
      expect.fail("Should have thrown NonceMismatch");
    } catch (err: unknown) {
      expect(String(err)).to.include("NonceMismatch");
    }
  });

  // ── Test 6: Wrong signer ───────────────────────────────────────────

  it("6. Wrong signer — different EVM wallet fails (AddressMismatch)", async () => {
    const recipientTA = await createATA(Keypair.generate().publicKey);
    const innerIx = buildTokenTransferIx(pdaTokenAccount, recipientTA, walletPDA, 10_000n);

    const nonce = await getNonce(walletPDA);
    const { signature, recoveryId } = await signMessage(
      evmWallet2, // wrong signer
      programId,
      nonce,
      [innerIx]
    );

    try {
      await program.methods
        .execute(
          Array.from(signature),
          recoveryId,
          new anchor.BN(nonce.toString()),
          toAnchorInnerInstructions([innerIx])
        )
        .accounts({
          walletState: walletPDA,
          payer: payer.publicKey,
        })
        .remainingAccounts([
          { pubkey: pdaTokenAccount, isSigner: false, isWritable: true },
          { pubkey: recipientTA, isSigner: false, isWritable: true },
          { pubkey: walletPDA, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ])
        .rpc();
      expect.fail("Should have thrown AddressMismatch");
    } catch (err: unknown) {
      expect(String(err)).to.include("AddressMismatch");
    }
  });

  // ── Test 7: Nonce mismatch ─────────────────────────────────────────

  it("7. Nonce mismatch — wrong nonce value fails", async () => {
    const recipientTA = await createATA(Keypair.generate().publicKey);
    const innerIx = buildTokenTransferIx(pdaTokenAccount, recipientTA, walletPDA, 10_000n);

    const wrongNonce = 999n;
    const { signature, recoveryId } = await signMessage(evmWallet, programId, wrongNonce, [
      innerIx,
    ]);

    try {
      await program.methods
        .execute(
          Array.from(signature),
          recoveryId,
          new anchor.BN(wrongNonce.toString()),
          toAnchorInnerInstructions([innerIx])
        )
        .accounts({
          walletState: walletPDA,
          payer: payer.publicKey,
        })
        .remainingAccounts([
          { pubkey: pdaTokenAccount, isSigner: false, isWritable: true },
          { pubkey: recipientTA, isSigner: false, isWritable: true },
          { pubkey: walletPDA, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ])
        .rpc();
      expect.fail("Should have thrown NonceMismatch");
    } catch (err: unknown) {
      expect(String(err)).to.include("NonceMismatch");
    }
  });

  // ── Test 8: Wrong chain_id ─────────────────────────────────────────

  it("8. Wrong chain_id — different chain_id produces AddressMismatch", async () => {
    const recipientTA = await createATA(Keypair.generate().publicKey);
    const innerIx = buildTokenTransferIx(pdaTokenAccount, recipientTA, walletPDA, 10_000n);

    const nonce = await getNonce(walletPDA);
    const { signature, recoveryId } = await signMessageWithChainId(
      evmWallet,
      42n, // wrong chain_id
      programId,
      nonce,
      [innerIx]
    );

    try {
      await program.methods
        .execute(
          Array.from(signature),
          recoveryId,
          new anchor.BN(nonce.toString()),
          toAnchorInnerInstructions([innerIx])
        )
        .accounts({
          walletState: walletPDA,
          payer: payer.publicKey,
        })
        .remainingAccounts([
          { pubkey: pdaTokenAccount, isSigner: false, isWritable: true },
          { pubkey: recipientTA, isSigner: false, isWritable: true },
          { pubkey: walletPDA, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ])
        .rpc();
      expect.fail("Should have thrown AddressMismatch");
    } catch (err: unknown) {
      expect(String(err)).to.include("AddressMismatch");
    }
  });

  // ── Test 9: Signature malleability ─────────────────────────────────

  it("9. Signature malleability — high-S signature rejected", async () => {
    const recipientTA = await createATA(Keypair.generate().publicKey);
    const innerIx = buildTokenTransferIx(pdaTokenAccount, recipientTA, walletPDA, 10_000n);

    const nonce = await getNonce(walletPDA);
    const { signature, recoveryId } = await signMessage(evmWallet, programId, nonce, [innerIx]);

    const malleableSig = makeHighS(signature);

    try {
      await program.methods
        .execute(
          Array.from(malleableSig),
          recoveryId,
          new anchor.BN(nonce.toString()),
          toAnchorInnerInstructions([innerIx])
        )
        .accounts({
          walletState: walletPDA,
          payer: payer.publicKey,
        })
        .remainingAccounts([
          { pubkey: pdaTokenAccount, isSigner: false, isWritable: true },
          { pubkey: recipientTA, isSigner: false, isWritable: true },
          { pubkey: walletPDA, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ])
        .rpc();
      expect.fail("Should have thrown SignatureMalleability");
    } catch (err: unknown) {
      expect(String(err)).to.include("SignatureMalleability");
    }
  });

  // ── Test 10: Multiple inner instructions ───────────────────────────

  it("10. Multiple inner instructions — 2 token transfers, nonce increments once", async () => {
    const recipientTA1 = await createATA(Keypair.generate().publicKey);
    const recipientTA2 = await createATA(Keypair.generate().publicKey);

    const innerIx1 = buildTokenTransferIx(pdaTokenAccount, recipientTA1, walletPDA, 20_000n);
    const innerIx2 = buildTokenTransferIx(pdaTokenAccount, recipientTA2, walletPDA, 30_000n);

    const nonce = await getNonce(walletPDA);
    const { signature, recoveryId } = await signMessage(evmWallet, programId, nonce, [
      innerIx1,
      innerIx2,
    ]);

    await program.methods
      .execute(
        Array.from(signature),
        recoveryId,
        new anchor.BN(nonce.toString()),
        toAnchorInnerInstructions([innerIx1, innerIx2])
      )
      .accounts({
        walletState: walletPDA,
        payer: payer.publicKey,
      })
      .remainingAccounts([
        { pubkey: pdaTokenAccount, isSigner: false, isWritable: true },
        { pubkey: recipientTA1, isSigner: false, isWritable: true },
        { pubkey: walletPDA, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: recipientTA2, isSigner: false, isWritable: true },
      ])
      .rpc();

    const account1 = await getAccount(provider.connection, recipientTA1);
    const account2 = await getAccount(provider.connection, recipientTA2);
    expect(Number(account1.amount)).to.equal(20_000);
    expect(Number(account2.amount)).to.equal(30_000);
    expect(Number(await getNonce(walletPDA))).to.equal(Number(nonce) + 1);
  });

  // ── Test 11: Close wallet ──────────────────────────────────────────

  it("11. Close wallet — PDA closed, rent returned", async () => {
    const rentRecipient = Keypair.generate();
    const nonce = await getNonce(walletPDA);

    const { signature, recoveryId } = await signMessage(evmWallet, programId, nonce, []);

    const recipientBalanceBefore = await provider.connection.getBalance(rentRecipient.publicKey);

    await program.methods
      .closeWallet(Array.from(signature), recoveryId, new anchor.BN(nonce.toString()))
      .accounts({
        walletState: walletPDA,
        payer: payer.publicKey,
        rentRecipient: rentRecipient.publicKey,
      })
      .rpc();

    const accountInfo = await provider.connection.getAccountInfo(walletPDA);
    expect(accountInfo).to.equal(null);

    const recipientBalanceAfter = await provider.connection.getBalance(rentRecipient.publicKey);
    expect(recipientBalanceAfter).to.be.greaterThan(recipientBalanceBefore);
  });

  // ── Test 12: Close wrong signer ────────────────────────────────────

  it("12. Close wrong signer — different EVM wallet cannot close", async () => {
    await program.methods
      .initializeWallet(Array.from(ethAddress2))
      .accounts({ payer: payer.publicKey })
      .rpc();

    // Try closing wallet2 with evmWallet (wrong — wallet2 belongs to evmWallet2)
    const { signature, recoveryId } = await signMessage(evmWallet, programId, 0n, []);

    try {
      await program.methods
        .closeWallet(Array.from(signature), recoveryId, new anchor.BN(0))
        .accounts({
          walletState: wallet2PDA,
          payer: payer.publicKey,
          rentRecipient: payer.publicKey,
        })
        .rpc();
      expect.fail("Should have thrown AddressMismatch");
    } catch (err: unknown) {
      expect(String(err)).to.include("AddressMismatch");
    }
  });

  // ── Test 13: Re-initialize after close ─────────────────────────────

  it("13. Re-initialize after close — can re-create PDA", async () => {
    await program.methods
      .initializeWallet(Array.from(ethAddress))
      .accounts({ payer: payer.publicKey })
      .rpc();

    const state = await program.account.walletState.fetch(walletPDA);
    expect(Buffer.from(state.ethAddress)).to.deep.equal(ethAddress);
    expect(state.nonce.toNumber()).to.equal(0);
  });

  // ── Test 14: Execute after re-init ─────────────────────────────────

  it("14. Execute after re-init — nonce resets to 0", async () => {
    // The ATA for this PDA already exists from before close. Mint more tokens.
    await mintTo(provider.connection, payer, mint, pdaTokenAccount, payer, 500_000);

    const recipientTA = await createATA(Keypair.generate().publicKey);
    const transferAmount = 10_000n;
    const innerIx = buildTokenTransferIx(pdaTokenAccount, recipientTA, walletPDA, transferAmount);

    const nonce = await getNonce(walletPDA);
    expect(Number(nonce)).to.equal(0);

    const { signature, recoveryId } = await signMessage(evmWallet, programId, nonce, [innerIx]);

    await program.methods
      .execute(
        Array.from(signature),
        recoveryId,
        new anchor.BN(nonce.toString()),
        toAnchorInnerInstructions([innerIx])
      )
      .accounts({
        walletState: walletPDA,
        payer: payer.publicKey,
      })
      .remainingAccounts([
        { pubkey: pdaTokenAccount, isSigner: false, isWritable: true },
        { pubkey: recipientTA, isSigner: false, isWritable: true },
        { pubkey: walletPDA, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ])
      .rpc();

    const recipientAccount = await getAccount(provider.connection, recipientTA);
    expect(Number(recipientAccount.amount)).to.equal(Number(transferAmount));
    expect(Number(await getNonce(walletPDA))).to.equal(1);
  });

  // ── Test 15: Tampered instruction data ─────────────────────────────

  it("15. Tampered instruction data — modified inner ix after signing fails", async () => {
    const recipientTA = await createATA(Keypair.generate().publicKey);

    const innerIx = buildTokenTransferIx(pdaTokenAccount, recipientTA, walletPDA, 10_000n);

    const nonce = await getNonce(walletPDA);
    const { signature, recoveryId } = await signMessage(evmWallet, programId, nonce, [innerIx]);

    // Tamper: different amount
    const tamperedIx = buildTokenTransferIx(pdaTokenAccount, recipientTA, walletPDA, 999_999n);

    try {
      await program.methods
        .execute(
          Array.from(signature),
          recoveryId,
          new anchor.BN(nonce.toString()),
          toAnchorInnerInstructions([tamperedIx])
        )
        .accounts({
          walletState: walletPDA,
          payer: payer.publicKey,
        })
        .remainingAccounts([
          { pubkey: pdaTokenAccount, isSigner: false, isWritable: true },
          { pubkey: recipientTA, isSigner: false, isWritable: true },
          { pubkey: walletPDA, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ])
        .rpc();
      expect.fail("Should have thrown AddressMismatch");
    } catch (err: unknown) {
      expect(String(err)).to.include("AddressMismatch");
    }
  });

  // ── Test 16: PDA determinism ───────────────────────────────────────

  it("16. PDA determinism — same eth address always derives same PDA", () => {
    const [pda1] = deriveWalletPDA(ethAddress, programId);
    const [pda2] = deriveWalletPDA(ethAddress, programId);
    expect(pda1.toBase58()).to.equal(pda2.toBase58());

    const [pda3] = deriveWalletPDA(ethAddress2, programId);
    expect(pda1.toBase58()).to.not.equal(pda3.toBase58());
  });
});
