import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { mainnet } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "Polygon Staking Demo",
  projectId: "polygon-staking-mainnet",
  chains: [mainnet],
  ssr: true,
});
