import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia, mainnet } from "wagmi/chains";
import { createConfig, http } from "wagmi";

const isServer = typeof window === "undefined";

const WALLETCONNECT_PROJECT_ID = "d16b5c78a5f57e998fdcb9bb4fc86f48";
const INFURA_KEY = process.env.NEXT_PUBLIC_INFURA_KEY;

export const rpcUrls = {
  [mainnet.id]: INFURA_KEY
    ? `https://mainnet.infura.io/v3/${INFURA_KEY}`
    : undefined,
  [sepolia.id]: INFURA_KEY
    ? `https://sepolia.infura.io/v3/${INFURA_KEY}`
    : undefined,
} as const;

export const config = isServer
  ? createConfig({
      chains: [sepolia, mainnet],
      transports: {
        [sepolia.id]: http(rpcUrls[sepolia.id]),
        [mainnet.id]: http(rpcUrls[mainnet.id]),
      },
      ssr: true,
    })
  : getDefaultConfig({
      appName: "Polygon Staking Demo",
      projectId: WALLETCONNECT_PROJECT_ID,
      chains: [sepolia, mainnet],
      transports: {
        [sepolia.id]: http(rpcUrls[sepolia.id]),
        [mainnet.id]: http(rpcUrls[mainnet.id]),
      },
      ssr: true,
    });
