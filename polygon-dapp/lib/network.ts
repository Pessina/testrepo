import { sepolia, mainnet } from "wagmi/chains";
import { CHORUS_ONE_POLYGON_VALIDATORS } from "@chorus-one/polygon";

export type NetworkType = "testnet" | "mainnet";

export const networkConfig = {
  testnet: {
    chain: sepolia,
    validatorShare: CHORUS_ONE_POLYGON_VALIDATORS.testnet,
    label: "Sepolia",
  },
  mainnet: {
    chain: mainnet,
    validatorShare: CHORUS_ONE_POLYGON_VALIDATORS.mainnet,
    label: "Ethereum",
  },
} as const;
