import { sepolia, mainnet } from "wagmi/chains";

export type NetworkType = "testnet" | "mainnet";

export const networkConfig = {
  testnet: {
    chain: sepolia,
    validatorShare: "0x91344055cb0511b3aa36c561d741ee356b95f1c9" as const,
    label: "Sepolia",
  },
  mainnet: {
    chain: mainnet,
    validatorShare: "0x857679d69fE50E7B722f94aCd2629d80C355163d" as const,
    label: "Ethereum",
  },
} as const;
