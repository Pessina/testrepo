import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CallEmitCpi } from "../target/types/call_emit_cpi";

describe("call-emit-cpi", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.callEmitCpi as Program<CallEmitCpi>;

  it.only("Triggers emit CPI!", async () => {
    const emitCpiProgramId = new anchor.web3.PublicKey(
      "Aqfn78XViUa2vS8JZKcLS9cvof8CJvNxkWyrABfweA4D"
    );

    // Test data for the CustomEvent
    const sender = anchor.web3.Keypair.generate().publicKey;
    const payload = Array(32)
      .fill(0)
      .map(() => Math.floor(Math.random() * 256));
    const keyVersion = 1;
    const deposit = new anchor.BN(1000000); // 1 SOL in lamports
    const chainId = new anchor.BN(1); // Solana mainnet
    const path = "/example/path";
    const algo = "ed25519";

    // Generate event authority PDA - this is required by #[event_cpi]
    const [eventAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("__event_authority")],
      emitCpiProgramId
    );

    const tx = await program.methods
      .triggerEmitCpi(sender, payload, keyVersion, deposit, chainId, path, algo)
      .accounts({
        payer: anchor.getProvider().publicKey,
        eventAuthority: eventAuthority,
      })
      .rpc();

    console.log("CPI transaction signature", tx);
  });
});
