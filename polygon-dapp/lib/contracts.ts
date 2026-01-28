import { type Abi } from "viem";

export const TESTNET_POL_TOKEN = "0x3fd0A53F4Bf853985a95F4Eb3F9C9FDE1F8e2b53" as const;
export const TESTNET_STAKE_MANAGER = "0x4AE8f648B1Ec892B6cc68C89cc088583964d08bE" as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const satisfies Abi;

export const VALIDATOR_SHARE_ABI = [
  {
    type: "function",
    name: "buyVoucherPOL",
    inputs: [
      { name: "_amount", type: "uint256" },
      { name: "_minSharesToMint", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "sellVoucher_newPOL",
    inputs: [
      { name: "claimAmount", type: "uint256" },
      { name: "maximumSharesToBurn", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "unstakeClaimTokens_newPOL",
    inputs: [{ name: "unbondNonce", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdrawRewardsPOL",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "restakePOL",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getTotalStake",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "", type: "uint256" },
      { name: "", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "unbondNonces",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "unbonds_new",
    inputs: [
      { name: "user", type: "address" },
      { name: "nonce", type: "uint256" },
    ],
    outputs: [
      { name: "shares", type: "uint256" },
      { name: "withdrawEpoch", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getLiquidRewards",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const satisfies Abi;

export const STAKE_MANAGER_ABI = [
  {
    type: "function",
    name: "epoch",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const satisfies Abi;
