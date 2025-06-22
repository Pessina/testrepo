import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { EmitCpi } from "../target/types/emit_cpi";

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

  // Include test to call our program via CPI, the methods above call it directly
});
