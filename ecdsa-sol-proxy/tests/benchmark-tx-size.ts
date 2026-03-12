import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { EcdsaProxy } from "../target/types/ecdsa_proxy";
import { ethers } from "ethers";
import {
  AddressLookupTableAccount,
  AddressLookupTableProgram,
  Keypair,
  PublicKey,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
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
  const connection = provider.connection;

  const program = anchor.workspace.ecdsaProxy as Program<EcdsaProxy>;
  const programId = program.programId;
  const payer = (provider.wallet as anchor.Wallet).payer;

  const evmWallet = ethers.Wallet.createRandom();
  const ethAddress = ethAddressFromWallet(evmWallet);

  // Pre-generated keys for deterministic benchmarks
  const fakeSwapProgram = Keypair.generate().publicKey;
  const fakeSwapAccounts = Array.from({ length: 7 }, () => Keypair.generate().publicKey);

  let walletPDA: PublicKey;
  let mint: PublicKey;
  let pdaTokenAccount: PublicKey;
  let recipientTA1: PublicKey;
  let recipientTA2: PublicKey;
  let recipientTA3: PublicKey;
  let lookupTableAccount: AddressLookupTableAccount;

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
    const accounts = fakeSwapAccounts.map((pubkey, i) => ({
      pubkey,
      isSigner: false,
      isWritable: i < 4,
    }));
    accounts.push({ pubkey: authority, isSigner: true, isWritable: false });

    return {
      programId: fakeSwapProgram,
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

    mint = await createMint(connection, payer, payer.publicKey, null, 6);

    const ata = await getOrCreateAssociatedTokenAccount(connection, payer, mint, walletPDA, true);
    pdaTokenAccount = ata.address;
    await mintTo(connection, payer, mint, pdaTokenAccount, payer, 10_000_000);

    // Pre-create recipient token accounts for all scenarios
    recipientTA1 = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        Keypair.generate().publicKey,
        true
      )
    ).address;
    recipientTA2 = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        Keypair.generate().publicKey,
        true
      )
    ).address;
    recipientTA3 = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        Keypair.generate().publicKey,
        true
      )
    ).address;

    // Collect all addresses that will appear across all benchmark scenarios
    const allInnerIxs = [
      buildTokenTransferIx(pdaTokenAccount, recipientTA1, walletPDA, 1n),
      buildTokenTransferIx(pdaTokenAccount, recipientTA2, walletPDA, 1n),
      buildTokenTransferIx(pdaTokenAccount, recipientTA3, walletPDA, 1n),
      buildFakeSwapIx(walletPDA),
    ];
    const allRemaining = buildRemainingAccounts(allInnerIxs);

    // Include the program ID so it can also be compressed via ALT
    const uniqueKeys = new Map<string, PublicKey>();
    uniqueKeys.set(programId.toBase58(), programId);
    for (const r of allRemaining) {
      uniqueKeys.set(r.pubkey.toBase58(), r.pubkey);
    }
    const allAddresses = Array.from(uniqueKeys.values());

    // Create and populate Address Lookup Table
    // Use a past slot to ensure it's in SlotHashes sysvar
    const slot = (await connection.getSlot("confirmed")) - 1;
    const [createIx, tableAddress] = AddressLookupTableProgram.createLookupTable({
      authority: payer.publicKey,
      payer: payer.publicKey,
      recentSlot: slot,
    });
    await provider.sendAndConfirm(new Transaction().add(createIx));

    const extendIx = AddressLookupTableProgram.extendLookupTable({
      lookupTable: tableAddress,
      authority: payer.publicKey,
      payer: payer.publicKey,
      addresses: allAddresses,
    });
    await provider.sendAndConfirm(new Transaction().add(extendIx));

    // Wait for ALT entries to be available
    await new Promise((resolve) => setTimeout(resolve, 400));

    const result = await connection.getAddressLookupTable(tableAddress);
    if (!result.value) throw new Error("Failed to fetch address lookup table");
    lookupTableAccount = result.value;
  });

  async function measureTxSizes(
    innerIxs: InnerInstruction[],
    remaining: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]
  ): Promise<{ legacy: number; versioned: number }> {
    const remainingKeys = remaining.map((r) => r.pubkey);
    const indexed = toIndexedInnerInstructions(innerIxs, remainingKeys);
    const nonce = 0n;
    const { signature, recoveryId } = await signMessage(
      evmWallet,
      programId,
      nonce,
      remainingKeys,
      indexed
    );

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

    const { blockhash } = await connection.getLatestBlockhash();

    // Legacy transaction
    const legacyTx = new Transaction();
    legacyTx.add(ix);
    legacyTx.recentBlockhash = blockhash;
    legacyTx.feePayer = payer.publicKey;
    legacyTx.sign(payer);
    const legacy = legacyTx.serialize().length;

    // Versioned transaction with Address Lookup Table
    const messageV0 = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message([lookupTableAccount]);
    const versionedTx = new VersionedTransaction(messageV0);
    versionedTx.sign([payer]);
    const versioned = versionedTx.serialize().length;

    return { legacy, versioned };
  }

  it("Scenario 1: Single SPL transfer", async () => {
    const innerIx = buildTokenTransferIx(pdaTokenAccount, recipientTA1, walletPDA, 100_000n);
    const remaining = buildRemainingAccounts([innerIx]);

    const { legacy, versioned } = await measureTxSizes([innerIx], remaining);
    const saved = legacy - versioned;
    console.log(`[Benchmark] Single SPL transfer:`);
    console.log(
      `  Legacy:    ${legacy} bytes (${((legacy / 1232) * 100).toFixed(1)}%) — headroom: ${1232 - legacy}`
    );
    console.log(
      `  Versioned: ${versioned} bytes (${((versioned / 1232) * 100).toFixed(1)}%) — headroom: ${1232 - versioned}`
    );
    console.log(`  Saved:     ${saved} bytes with ALT`);
  });

  it("Scenario 2: Two SPL transfers", async () => {
    const innerIx1 = buildTokenTransferIx(pdaTokenAccount, recipientTA1, walletPDA, 50_000n);
    const innerIx2 = buildTokenTransferIx(pdaTokenAccount, recipientTA2, walletPDA, 30_000n);
    const remaining = buildRemainingAccounts([innerIx1, innerIx2]);

    const { legacy, versioned } = await measureTxSizes([innerIx1, innerIx2], remaining);
    const saved = legacy - versioned;
    console.log(`[Benchmark] Two SPL transfers:`);
    console.log(
      `  Legacy:    ${legacy} bytes (${((legacy / 1232) * 100).toFixed(1)}%) — headroom: ${1232 - legacy}`
    );
    console.log(
      `  Versioned: ${versioned} bytes (${((versioned / 1232) * 100).toFixed(1)}%) — headroom: ${1232 - versioned}`
    );
    console.log(`  Saved:     ${saved} bytes with ALT`);
  });

  it("Scenario 3: Swap-like (8 accounts)", async () => {
    const innerIx = buildFakeSwapIx(walletPDA);
    const remaining = buildRemainingAccounts([innerIx]);

    const { legacy, versioned } = await measureTxSizes([innerIx], remaining);
    const saved = legacy - versioned;
    console.log(`[Benchmark] Swap-like (8 accts):`);
    console.log(
      `  Legacy:    ${legacy} bytes (${((legacy / 1232) * 100).toFixed(1)}%) — headroom: ${1232 - legacy}`
    );
    console.log(
      `  Versioned: ${versioned} bytes (${((versioned / 1232) * 100).toFixed(1)}%) — headroom: ${1232 - versioned}`
    );
    console.log(`  Saved:     ${saved} bytes with ALT`);
  });
});
