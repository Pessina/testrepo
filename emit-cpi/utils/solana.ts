import { Connection, TransactionSignature } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

const TRANSACTION_RETRY_COUNT = 5;
const RETRY_DELAY_MS = 1000;

/**
 * Confirms a transaction and waits for it to be processed
 * @param connection Solana connection
 * @param txSignature Transaction signature
 * @param commitment Commitment level to use, defaults to "confirmed"
 */
export async function confirmTransaction(
  connection: Connection,
  txSignature: TransactionSignature,
  commitment: "confirmed" | "finalized" = "confirmed"
) {
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    {
      signature: txSignature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    commitment
  );

  let retries = TRANSACTION_RETRY_COUNT;
  let txInfo = null;

  while (retries > 0 && !txInfo) {
    txInfo = await connection.getTransaction(txSignature, {
      commitment: commitment,
      maxSupportedTransactionVersion: 0,
    });

    if (!txInfo) {
      retries--;
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  if (!txInfo) {
    throw new Error("Transaction not found");
  }

  return txInfo;
}

/**
 * Logs the compute units used and calculates realistic priority fees
 * @param txSignature Transaction signature
 * @param memo Optional memo for logging
 */
export const logComputeUnitsUsed = async ({
  txSignature,
  memo = "",
}: {
  txSignature: string;
  memo?: string;
}) => {
  const txInfo = await getTxInfo({ txSignature });

  if (txInfo && txInfo.meta) {
    const computeUnits = txInfo.meta.computeUnitsConsumed;

    // Customizable based on the current fee, maybe fetch it: https://triton.one/solana-prioritization-fees/, https://triton.one/solana-prioritization-fees/
    const PRIORITY_FEE_MICRO_LAMPORTS = 10_000;
    const MICRO_LAMPORTS_PER_LAMPORTS = 1_000_000;
    const LAMPORTS_PER_SOL = 1_000_000_000;

    const totalLamportsUsed =
      txInfo.meta.fee +
      (computeUnits * PRIORITY_FEE_MICRO_LAMPORTS) /
        MICRO_LAMPORTS_PER_LAMPORTS;

    console.log(
      `${memo ? `${memo}: ` : ""}${computeUnits} CU, ${
        totalLamportsUsed / LAMPORTS_PER_SOL
      } SOL`
    );
  }
};

/**
 * Gets transaction info with proper confirmation and retry logic
 * @param txSignature Transaction signature
 */
export const getTxInfo = async ({ txSignature }: { txSignature: string }) => {
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  const txInfo = await confirmTransaction(
    provider.connection,
    txSignature,
    "finalized"
  );

  return txInfo as unknown as {
    meta: {
      returnData: {
        data: string[];
      };
      logMessages: string[];
      computeUnitsConsumed: number;
      fee: number;
    };
  };
};
