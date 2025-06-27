import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { EmitCpi } from "../target/types/emit_cpi";

describe("emit-cpi-authorization", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.emitCpi as Program<EmitCpi>;

  const ANCHOR_EMIT_CPI_CALL_BACK_DISCRIMINATOR = Buffer.from([
    0xe4, 0x45, 0xa5, 0x2e, 0x51, 0xcb, 0x9a, 0x1d,
  ]);

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
