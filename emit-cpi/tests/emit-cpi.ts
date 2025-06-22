import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { EmitCpi } from "../target/types/emit_cpi";

const ANCHOR_EMIT_CPI_CALL_BACK_DISCRIMINATOR = Buffer.from([
  0xe4, 0x45, 0xa5, 0x2e, 0x51, 0xcb, 0x9a, 0x1d,
]);

describe("emit-cpi", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.emitCpi as Program<EmitCpi>;

  it("Should emit event without data", async () => {
    const tx = await program.methods
      .emitEvent(null)
      .accounts({
        payer: anchor.getProvider().publicKey,
      })
      .rpc();
    console.log("Transaction signature (no data):", tx);
  });

  it("Should emit event with custom data", async () => {
    const customEvent = {
      sender: anchor.getProvider().publicKey,
      payload: Array.from(Buffer.alloc(32, 1)), // 32 bytes filled with 1s
      keyVersion: 1,
      deposit: new anchor.BN(1000000),
      chainId: new anchor.BN(1),
      path: "test/path",
      algo: "test-algo",
    };

    const tx = await program.methods
      .emitEvent(customEvent)
      .accounts({
        payer: anchor.getProvider().publicKey,
      })
      .rpc();
    console.log("Transaction signature (with data):", tx);
  });

  it("Throws on unauthorized invocation", async () => {
    const tx = new anchor.web3.Transaction();
    tx.add(
      new anchor.web3.TransactionInstruction({
        programId: program.programId,
        keys: [
          {
            pubkey: anchor.getProvider().publicKey,
            isSigner: true,
            isWritable: true,
          },
        ],
        data: ANCHOR_EMIT_CPI_CALL_BACK_DISCRIMINATOR,
      })
    );

    try {
      await program.provider.sendAndConfirm(tx, []);
    } catch (e) {
      if (e.logs.some((log) => log.includes("ConstraintSeeds."))) return;
      console.log(e);
    }

    throw new Error("Was able to invoke the self-CPI instruction");
  });

  it("Throws on unauthorized invocation", async () => {
    const tx = new anchor.web3.Transaction();
    tx.add(
      new anchor.web3.TransactionInstruction({
        programId: program.programId,
        keys: [
          {
            pubkey: anchor.web3.PublicKey.findProgramAddressSync(
              [Buffer.from("__event_authority")],
              program.programId
            )[0],
            isSigner: false,
            isWritable: false,
          },
          {
            pubkey: program.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
        data: ANCHOR_EMIT_CPI_CALL_BACK_DISCRIMINATOR,
      })
    );

    try {
      await program.provider.sendAndConfirm(tx, []);
    } catch (e) {
      if (e.logs.some((log) => log.includes("ConstraintSigner"))) return;
      console.log(e);
    }

    throw new Error("Was able to invoke the self-CPI instruction");
  });
});
