import { Address } from '@ton/core';
import { VestingContract, VestingContractState } from './VestingContract';
import { StakingPool, StakingPoolParams } from './StakingPool';
import { STAKING_FEES, STAKING_LIMITS } from './StakingConstants';

/**
 * Configuration for staking operations
 */
export interface StakingConfig {
  /** Target staking pool address */
  stakingPoolAddress: Address;
  /** Amount to stake (optional, defaults to maximum available) */
  stakeAmount?: bigint;
  /** Whether to perform strict validation (default: true) */
  strictValidation?: boolean;
}

/**
 * Result of staking validation
 */
export interface ValidationResult {
  /** Whether validation passed */
  isValid: boolean;
  /** Array of error messages if validation failed */
  errors: string[];
  /** Array of warning messages */
  warnings: string[];
  /** Calculated optimal stake amount */
  calculatedStakeAmount?: bigint;
  /** Pool parameters if retrieved */
  poolParams?: StakingPoolParams;
}

/**
 * Utility class for validating staking operations
 *
 * Provides comprehensive validation for:
 * - Owner authorization
 * - Whitelist status
 * - Balance sufficiency
 * - Pool health and requirements
 * - Stake amount limits
 */
export class StakingValidation {
  /**
   * Performs comprehensive validation for a staking operation
   *
   * @param vestingContract - The vesting contract instance
   * @param stakingPool - The staking pool instance
   * @param config - Staking configuration
   * @param walletAddress - Address of the wallet initiating the operation
   * @returns Validation result with errors, warnings, and calculated amounts
   */
  static async validateStakingOperation(
    vestingContract: VestingContract,
    stakingPool: StakingPool,
    config: StakingConfig,
    walletAddress: Address
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Get contract and pool states
      const [contractState, poolParams] = await Promise.all([
        vestingContract.getAllContractData(),
        stakingPool.getPoolParams(),
      ]);

      // 1. Owner authorization check
      const ownershipErrors = this.validateOwnership(contractState, walletAddress);
      errors.push(...ownershipErrors);

      // 2. Whitelist validation
      const whitelistErrors = await this.validateWhitelist(
        vestingContract,
        config.stakingPoolAddress
      );
      errors.push(...whitelistErrors);

      // 3. Pool health validation
      const poolErrors = await this.validatePoolHealth(poolParams);
      errors.push(...poolErrors.errors);
      warnings.push(...poolErrors.warnings);

      // 4. Balance and amount validation
      const amountValidation = this.validateStakeAmount(
        contractState,
        config.stakeAmount,
        poolParams
      );
      errors.push(...amountValidation.errors);
      warnings.push(...amountValidation.warnings);

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        calculatedStakeAmount: amountValidation.calculatedAmount,
        poolParams,
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Validation failed: ${error instanceof Error ? error.message : String(error)}`],
        warnings,
      };
    }
  }

  /**
   * Validates that the wallet address matches the vesting contract owner
   */
  private static validateOwnership(
    contractState: VestingContractState,
    walletAddress: Address
  ): string[] {
    const errors: string[] = [];

    if (!walletAddress.equals(contractState.ownerAddress)) {
      errors.push(
        `Access denied: Wallet address (${walletAddress.toString()}) ` +
          `does not match vesting contract owner (${contractState.ownerAddress.toString()})`
      );
    }

    return errors;
  }

  /**
   * Validates that the staking pool is whitelisted
   */
  private static async validateWhitelist(
    vestingContract: VestingContract,
    stakingPoolAddress: Address
  ): Promise<string[]> {
    const errors: string[] = [];

    try {
      const isWhitelisted = await vestingContract.isWhitelisted(stakingPoolAddress);

      if (!isWhitelisted) {
        errors.push(
          'Security error: Staking pool address is not whitelisted. ' +
            'Add it to the whitelist first using the vesting sender address.'
        );
      }
    } catch (error) {
      errors.push(
        `Failed to check whitelist status: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return errors;
  }

  /**
   * Validates pool health and availability
   */
  private static async validatePoolHealth(
    poolParams: StakingPoolParams
  ): Promise<{ errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if pool is enabled
    if (!poolParams.enabled) {
      errors.push('Staking pool is currently disabled and not accepting deposits');
    }

    return { errors, warnings };
  }

  /**
   * Validates stake amount and calculates optimal amount
   */
  private static validateStakeAmount(
    contractState: VestingContractState,
    requestedAmount: bigint | undefined,
    poolParams: StakingPoolParams
  ): { errors: string[]; warnings: string[]; calculatedAmount?: bigint } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Calculate maximum available amount
    const totalFees = STAKING_FEES.TOTAL;
    const maxAvailable = contractState.balance - STAKING_LIMITS.SAFETY_MARGIN - totalFees;

    if (maxAvailable <= 0) {
      errors.push(
        `Insufficient balance. Required: ${Number(totalFees + STAKING_LIMITS.SAFETY_MARGIN) / 1e9} TON, ` +
          `Available: ${Number(contractState.balance) / 1e9} TON`
      );
      return { errors, warnings };
    }

    // Determine stake amount
    const stakeAmount = requestedAmount ?? maxAvailable;
    const actualStakeAmount = stakeAmount > maxAvailable ? maxAvailable : stakeAmount;

    // Validate against pool minimum
    if (actualStakeAmount < poolParams.minStake) {
      errors.push(
        `Stake amount (${Number(actualStakeAmount) / 1e9} TON) below pool minimum ` +
          `(${Number(poolParams.minStake) / 1e9} TON)`
      );
    }

    // Validate against general minimum
    if (actualStakeAmount < STAKING_LIMITS.MIN_STAKE) {
      errors.push(
        `Stake amount (${Number(actualStakeAmount) / 1e9} TON) below general minimum ` +
          `(${Number(STAKING_LIMITS.MIN_STAKE) / 1e9} TON)`
      );
    }

    // Check if requested amount was adjusted
    if (requestedAmount && requestedAmount > maxAvailable) {
      warnings.push(
        `Requested amount (${Number(requestedAmount) / 1e9} TON) adjusted to available ` +
          `(${Number(actualStakeAmount) / 1e9} TON)`
      );
    }

    // Warn about locked tokens usage for whitelisted addresses
    if (contractState.lockedAmount > 0) {
      const lockedInStake =
        actualStakeAmount > contractState.balance - contractState.lockedAmount
          ? actualStakeAmount - (contractState.balance - contractState.lockedAmount)
          : 0n;

      if (lockedInStake > 0) {
        warnings.push(
          `Using ${Number(lockedInStake) / 1e9} TON of locked tokens ` +
            '(allowed for whitelisted staking pools)'
        );
      }
    }

    return {
      errors,
      warnings,
      calculatedAmount: errors.length === 0 ? actualStakeAmount : undefined,
    };
  }

  /**
   * Validates that sufficient balance exists for a transaction
   */
  static validateSufficientBalance(
    availableBalance: bigint,
    requiredAmount: bigint,
    description: string = 'operation'
  ): string[] {
    const errors: string[] = [];

    if (availableBalance < requiredAmount) {
      errors.push(
        `Insufficient balance for ${description}. ` +
          `Required: ${Number(requiredAmount) / 1e9} TON, ` +
          `Available: ${Number(availableBalance) / 1e9} TON`
      );
    }

    return errors;
  }

  /**
   * Validates an address format
   */
  static validateAddress(address: Address | string, description: string = 'address'): string[] {
    const errors: string[] = [];

    try {
      if (typeof address === 'string') {
        Address.parse(address);
      }
      // If we reach here, address is valid
    } catch {
      errors.push(`Invalid ${description} format`);
    }

    return errors;
  }

  /**
   * Creates a summary of validation results for logging
   */
  static formatValidationSummary(result: ValidationResult): string {
    const lines: string[] = [];

    if (result.isValid) {
      lines.push('✅ Validation passed');
      if (result.calculatedStakeAmount) {
        lines.push(`💰 Stake amount: ${Number(result.calculatedStakeAmount) / 1e9} TON`);
      }
    } else {
      lines.push('❌ Validation failed');
      result.errors.forEach(error => lines.push(`   • ${error}`));
    }

    if (result.warnings.length > 0) {
      lines.push('⚠️  Warnings:');
      result.warnings.forEach(warning => lines.push(`   • ${warning}`));
    }

    return lines.join('\n');
  }
}
