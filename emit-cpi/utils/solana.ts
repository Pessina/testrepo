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

    console.log(`${memo ? `${memo}: ` : ""}${computeUnits} CU`);
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
