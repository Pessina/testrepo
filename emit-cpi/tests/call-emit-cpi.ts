import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CallEmitCpi } from "../target/types/call_emit_cpi";
import { logComputeUnitsUsed } from "../utils/solana";

describe("call-emit-cpi", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.callEmitCpi as Program<CallEmitCpi>;

  // Shared test data for the SignatureRequestedEvent
  const createTestData = () => {
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

    return {
      sender,
      payload,
      keyVersion,
      deposit,
      chainId,
      path,
      algo,
      dest,
      params,
      feePayer,
    };
  };

  it("Triggers emit regular (emit! macro) via CPI with cost logging", async () => {
    const testData = createTestData();

    const signature = await program.methods
      .triggerEmitRegular(
        testData.sender,
        testData.payload,
        testData.keyVersion,
        testData.deposit,
        testData.chainId,
        testData.path,
        testData.algo,
        testData.dest,
        testData.params,
        testData.feePayer
      )
      .accounts({
        payer: anchor.getProvider().publicKey,
      })
      .rpc();

    await logComputeUnitsUsed({
      txSignature: signature,
      memo: "CPI emit! macro",
    });
  });

  it("Triggers emit_cpi (emit_cpi! macro) via CPI with cost logging", async () => {
    const emitCpiProgramId = new anchor.web3.PublicKey(
      "Aqfn78XViUa2vS8JZKcLS9cvof8CJvNxkWyrABfweA4D"
    );

    const testData = createTestData();

    // Generate event authority PDA - this is required by #[event_cpi]
    const [eventAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("__event_authority")],
      emitCpiProgramId
    );

    const signature = await program.methods
      .triggerEmitCpi(
        testData.sender,
        testData.payload,
        testData.keyVersion,
        testData.deposit,
        testData.chainId,
        testData.path,
        testData.algo,
        testData.dest,
        testData.params,
        testData.feePayer
      )
      .accounts({
        payer: anchor.getProvider().publicKey,
        eventAuthority: eventAuthority,
      })
      .rpc();

    await logComputeUnitsUsed({
      txSignature: signature,
      memo: "CPI emit_cpi! macro",
    });
  });
});
