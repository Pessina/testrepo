import { useEvmAddress } from "@coinbase/cdp-hooks";
import { SendEvmTransactionButton } from "@coinbase/cdp-react";

export function SendTransaction() {
  const { evmAddress } = useEvmAddress();
  return (
    <div>
      <div>
        <h2>Send Transaction</h2>
        {evmAddress ? (
          <SendEvmTransactionButton
            className="bg-red h-10 shadow-md rounded-none"
            account={evmAddress}
            network="base-sepolia"
            transaction={{
              to: "0x4174678c78fEaFd778c1ff319D5D326701449b25",
              value: 10n,
              chainId: 84532,
              type: "eip1559",
            }}
            onSuccess={(hash) => {
              console.log("Transaction successful:", hash);
              alert(`Transaction sent! Hash: ${hash}`);
            }}
            onError={(error) => {
              console.error("Transaction failed:", error);
              alert(`Transaction failed: ${error.message}`);
            }}
            pendingLabel="Sending transaction..."
          />
        ) : (
          <p>Wallet not ready yet...</p>
        )}
      </div>
    </div>
  );
}
