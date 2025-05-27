import { toNano } from '@ton/core';

/**
 * Staking-related operation codes and constants
 */
export const STAKING_OPS = {
  // Vesting contract operations
  SEND: 0xa7733acd, // Tell vesting contract: "Execute send_message()"

  // Text command constants from staking pool contract
  TEXT_COMMAND: 0, // Text commands start with 0
  DEPOSIT_FIRST_CHAR: 68, // 'D' as uint8
  DEPOSIT_REMAINING: 111533580577140, // 'eposit' as uint48

  // Binary operations (alternative to text commands)
  STAKE_DEPOSIT: 2077040623, // op::stake_deposit()
} as const;

/**
 * Send modes for vesting contract restrictions
 */
export const SEND_MODES = {
  IGNORE_ERRORS_PAY_FEES_SEPARATELY: 3, // Required by vesting contract
  REGULAR: 0,
  PAY_GAS_SEPARATELY: 1,
  IGNORE_ERRORS: 2,
} as const;

/**
 * Fee structure based on staking pool contract analysis
 */
export const STAKING_FEES = {
  // Pool fees (from contract: fees::receipt() and fees::op())
  RECEIPT_FEE: toNano('0.1'),
  DEPOSIT_FEE: toNano('0.1'),
  WITHDRAW_FEE: toNano('0.1'),

  // Transaction processing fees
  GAS_FEE: toNano('0.1'),
  VESTING_OP_FEE: toNano('0.1'),

  // Total recommended minimum
  get TOTAL() {
    return this.RECEIPT_FEE + this.DEPOSIT_FEE + this.GAS_FEE + this.VESTING_OP_FEE;
  },
} as const;

/**
 * Staking pool requirements and limits
 */
export const STAKING_LIMITS = {
  MIN_STAKE: toNano('1'), // Most pools require minimum 1 TON
  SAFETY_MARGIN: toNano('0.1'), // Buffer for unexpected fees
} as const;

/**
 * Message flags for TON blockchain
 */
export const MESSAGE_FLAGS = {
  BOUNCEABLE: 0x18, // Standard bounceable message
  NON_BOUNCEABLE: 0x10, // Non-bounceable message
} as const;

/**
 * Validation timeouts and retry settings
 */
export const VALIDATION_SETTINGS = {
  MAX_WAIT_ATTEMPTS: 10,
  INITIAL_DELAY_MS: 3000,
  MAX_DELAY_MS: 10000,
  BACKOFF_MULTIPLIER: 1.5,
} as const;
