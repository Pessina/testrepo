import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { EmitCpi } from "../target/types/emit_cpi";
import { logComputeUnitsUsed } from "../utils/solana";

describe("emit-cpi", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.emitCpi as Program<EmitCpi>;

  const createSampleEvent = () => ({
    sender: anchor.getProvider().publicKey,
    payload: Array.from(Buffer.alloc(32, 1)),
    keyVersion: 1,
    deposit: new anchor.BN(1000000),
    chainId: new anchor.BN(1),
    path: "test/path",
    algo: "ed25519",
    dest: "destination_address",
    params: "test_params",
    feePayer: anchor.getProvider().publicKey,
  });

  it("Should emit event using emit! macro and log cost", async () => {
    const signatureEvent = createSampleEvent();

    const signature = await program.methods
      .emitEvent(signatureEvent)
      .accounts({
        payer: anchor.getProvider().publicKey,
      })
      .rpc();

    await logComputeUnitsUsed({
      txSignature: signature,
      memo: "emit! macro",
    });
  });

  it("Should emit event using emit_cpi! macro and log cost", async () => {
    const signatureEvent = createSampleEvent();

    const signature = await program.methods
      .emitEventCpi(signatureEvent)
      .accounts({
        payer: anchor.getProvider().publicKey,
        program: program.programId,
      })
      .rpc();

    await logComputeUnitsUsed({
      txSignature: signature,
      memo: "emit_cpi! macro",
    });
  });
});
