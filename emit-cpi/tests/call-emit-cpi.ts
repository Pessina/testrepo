import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CallEmitCpi } from "../target/types/call_emit_cpi";
import { logComputeUnitsUsed } from "../utils/solana";

describe("call-emit-cpi", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.callEmitCpi as Program<CallEmitCpi>;

  it("Triggers emit CPI with cost logging!", async () => {
    const emitCpiProgramId = new anchor.web3.PublicKey(
      "Aqfn78XViUa2vS8JZKcLS9cvof8CJvNxkWyrABfweA4D"
    );

    // Test data for the SignatureRequestedEvent
    const sender = anchor.web3.Keypair.generate().publicKey;
    const payload = Array(32)
      .fill(0)
      .map(() => Math.floor(Math.random() * 256));
    const keyVersion = 1;
    const deposit = new anchor.BN(1000000); // 1 SOL in lamports
    const chainId = new anchor.BN(1); // Solana mainnet
    const path = "/example/path";
    const algo = "ed25519";
    const dest = "destination_address";
    const params = "signature_params";
    const feePayer = anchor.getProvider().publicKey;

    // Generate event authority PDA - this is required by #[event_cpi]
    const [eventAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("__event_authority")],
      emitCpiProgramId
    );

    const signature = await program.methods
      .triggerEmitCpi(
        sender,
        payload,
        keyVersion,
        deposit,
        chainId,
        path,
        algo,
        dest,
        params,
        feePayer
      )
      .accounts({
        payer: anchor.getProvider().publicKey,
        eventAuthority: eventAuthority,
      })
      .rpc();

    await logComputeUnitsUsed({
      txSignature: signature,
      memo: "CPI emit event",
    });
  });
});
