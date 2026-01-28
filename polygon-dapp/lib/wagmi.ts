import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "Polygon Staking Demo",
  projectId: "demo-polygon-staking-testnet",
  chains: [sepolia],
  ssr: true,
});
