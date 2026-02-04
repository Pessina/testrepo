import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia, mainnet } from "wagmi/chains";
import { createConfig, http } from "wagmi";

const isServer = typeof window === "undefined";

const WALLETCONNECT_PROJECT_ID = "d16b5c78a5f57e998fdcb9bb4fc86f48";

export const config = isServer
  ? createConfig({
      chains: [sepolia, mainnet],
      transports: {
        [sepolia.id]: http(),
        [mainnet.id]: http(),
      },
      ssr: true,
    })
  : getDefaultConfig({
      appName: "Polygon Staking Demo",
      projectId: WALLETCONNECT_PROJECT_ID,
      chains: [sepolia, mainnet],
      ssr: true,
    });
