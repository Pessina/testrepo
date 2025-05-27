import { toNano, Address } from '@ton/core';

export const SAFETY_MARGIN = toNano('0.01');

// TON Pool addresses (testnet)
export const TON_POOL_PAIR = [
  'kQAHBakDk_E7qLlNQZxJDsqj_ruyAFpqarw85tO-c03fK26F',
  'kQCltujow9Sq3ZVPPU6CYGfqwDxYwjlmFGZ1Wt0bAYebio4o',
];

// TON Pool nominators contract address (example - replace with actual)
export const TON_POOL_NOMINATORS_ADDRESS = Address.parse(
  'kQAHBakDk_E7qLlNQZxJDsqj_ruyAFpqarw85tO-c03fK26F'
);

// Staking constants
export const MIN_STAKE_AMOUNT = toNano('1'); // 1 TON minimum stake
export const DEPOSIT_FEE = toNano('0.1'); // 0.1 TON deposit fee
export const WITHDRAW_FEE = toNano('0.1'); // 0.1 TON withdraw fee
export const RECEIPT_PRICE = toNano('0.1'); // 0.1 TON receipt price
export const GAS_LIMIT = toNano('0.1'); // 0.1 TON gas limit for operations

// Operation timeouts
export const OPERATION_TIMEOUT = 60000; // 60 seconds
