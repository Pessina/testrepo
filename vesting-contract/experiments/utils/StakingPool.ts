import { Address, beginCell, TonClient } from '@ton/ton';

/**
 * Represents the staking status of a specific member in the pool
 */
export interface StakingPoolMemberStatus {
  /** Currently staked and earning rewards */
  balance: bigint;
  /** Deposited but not yet accepted into staking */
  pendingDeposit: bigint;
  /** Requested withdrawal, waiting for cycle completion */
  pendingWithdraw: bigint;
  /** Available for immediate withdrawal */
  withdrawReady: bigint;
}

/**
 * Pool configuration parameters and fee structure
 */
export interface StakingPoolParams {
  /** Whether the pool accepts new deposits */
  enabled: boolean;
  /** Whether pool updates are enabled */
  updatesEnabled: boolean;
  /** Minimum stake amount required */
  minStake: bigint;
  /** Fee charged for deposits */
  depositFee: bigint;
  /** Fee charged for withdrawals */
  withdrawFee: bigint;
  /** Pool fee percentage (basis points) */
  poolFee: bigint;
  /** Price for receipt messages */
  receiptPrice: bigint;
}

/**
 * Utility class for interacting with TON staking pools
 *
 * Provides methods to:
 * - Query member status and balances
 * - Check pool health and statistics
 * - Monitor validation cycles
 * - Retrieve pool parameters and fees
 */
export class StakingPool {
  constructor(
    private readonly client: TonClient,
    private readonly poolAddress: Address
  ) {}

  /**
   * Gets the staking status for a specific member address
   *
   * @param memberAddress - Address to check status for
   * @returns Member's staking status including balances and pending operations
   * @throws Error if the pool method call fails
   */
  async getMemberStatus(memberAddress: Address): Promise<StakingPoolMemberStatus> {
    try {
      const result = await this.client.runMethod(this.poolAddress, 'get_member_balance', [
        { type: 'slice', cell: beginCell().storeAddress(memberAddress).endCell() },
      ]);

      return {
        balance: result.stack.readBigNumber(),
        pendingDeposit: result.stack.readBigNumber(),
        pendingWithdraw: result.stack.readBigNumber(),
        withdrawReady: result.stack.readBigNumber(),
      };
    } catch (error) {
      throw new Error(
        `Failed to get member status: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Gets pool parameters and fee structure
   *
   * @returns Pool configuration including fees and limits
   * @throws Error if the pool method call fails
   */
  async getPoolParams(): Promise<StakingPoolParams> {
    try {
      const result = await this.client.runMethod(this.poolAddress, 'get_params');

      return {
        enabled: result.stack.readBoolean(),
        updatesEnabled: result.stack.readBoolean(),
        minStake: result.stack.readBigNumber(),
        depositFee: result.stack.readBigNumber(),
        withdrawFee: result.stack.readBigNumber(),
        poolFee: result.stack.readBigNumber(),
        receiptPrice: result.stack.readBigNumber(),
      };
    } catch (error) {
      throw new Error(
        `Failed to get pool params: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Calculates the total amount a member has in the pool
   *
   * @param memberAddress - Address to calculate total for
   * @returns Total amount across all member states
   */
  async getTotalMemberAmount(memberAddress: Address): Promise<bigint> {
    const status = await this.getMemberStatus(memberAddress);
    return status.balance + status.pendingDeposit + status.pendingWithdraw + status.withdrawReady;
  }

  /**
   * Estimates daily earnings for a given stake amount
   *
   * @param stakeAmount - Amount staked in nanoTON
   * @param annualAPY - Annual percentage yield (default: 3%)
   * @returns Estimated daily earnings in TON
   */
  estimateDailyEarnings(stakeAmount: bigint, annualAPY: number = 0.03): number {
    const stakeInTon = Number(stakeAmount) / 1e9;
    return stakeInTon * (annualAPY / 365);
  }

  /**
   * Formats time remaining in a validation cycle
   *
   * @param stakeUntil - End timestamp of the validation cycle
   * @returns Formatted time string (e.g., "2h 30m")
   */
  formatTimeRemaining(stakeUntil: number): string {
    const now = Math.floor(Date.now() / 1000);
    const remaining = Math.max(0, stakeUntil - now);

    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return 'Less than 1 minute';
    }
  }

  /**
   * Gets the pool address
   */
  get address(): Address {
    return this.poolAddress;
  }
}
