import {
  useCurrentUser,
  useEvmAddress,
  useExportEvmAccount,
  useSendEvmTransaction,
} from "@coinbase/cdp-hooks";
import { AuthComponent } from "./components/AuthComponent";
import { SendTransaction } from "./components/SendTransaction";

function App() {
  const { evmAddress } = useEvmAddress();
  const { currentUser } = useCurrentUser();
  const { sendEvmTransaction } = useSendEvmTransaction();
  const { exportEvmAccount } = useExportEvmAccount();

  const handleSendTransaction = async () => {
    if (!evmAddress) return;

    const { transactionHash } = await sendEvmTransaction({
      evmAccount: evmAddress,
      network: "base-sepolia",
      transaction: {
        to: "0x4174678c78fEaFd778c1ff319D5D326701449b25",
        value: 1n,
        chainId: 84532,
        type: "eip1559",
      },
    });

    console.log({ transactionHash });
  };

  const handleExportEvmAccount = async () => {
    if (!evmAddress) return;

    const account = await exportEvmAccount({
      evmAccount: evmAddress,
    });

    console.log(account);
  };

  console.log({ currentUser });

  return (
    <div className="space-y-4 p-4">
      <AuthComponent />
      <div className="flex flex-col gap-2">
        <p>{evmAddress}</p>
        <SendTransaction />
        <button onClick={handleSendTransaction}>Send Transaction</button>
        <button onClick={handleExportEvmAccount}>Export Account</button>
      </div>
    </div>
  );
}

export default App;
