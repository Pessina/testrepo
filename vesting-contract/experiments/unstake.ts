import { TonClient } from '@ton/ton';
import { Address } from '@ton/core';
import { getWallet } from './utils/getWallet';
import { getEnv } from './utils/getEnv';
import { VestingContract } from './utils/VestingContract';
import { StakingPool } from './utils/StakingPool';
import { formatter } from './utils/formatter';
import { TON_POOL_PAIR } from './utils/constants';

/**
 * Comprehensive unstaking script using the organized class structure
 *
 * This script demonstrates how to:
 * 1. Validate unstaking preconditions comprehensively
 * 2. Execute unstaking operations safely
 * 3. Monitor transaction results
 * 4. Handle errors gracefully
 *
 * The code follows the same pattern as stake.ts:
 * - VestingContract: Core vesting and unstaking operations
 * - StakingPool: Pool status and information queries
 * - StakingValidation: Comprehensive validation logic
 * - Constants: Centralized configuration
 */
async function main(): Promise<void> {
  try {
    // Initialize environment and connections
    const { contractAddress, apiKey, endpoint, keyPair } = await getEnv();
    const client = new TonClient({ endpoint, apiKey });
    const ownerWallet = getWallet({ keyPair, subwalletNumber: 0 });

    console.log('\n🔄 === TON Vesting Contract Unstaking === 🔄');
    console.log('Using organized class structure with comprehensive validation\n');

    // Initialize contract and pool instances
    const vestingContract = new VestingContract(client, contractAddress, ownerWallet);
    const stakingPoolAddress = Address.parse(TON_POOL_PAIR[0]);
    const stakingPool = new StakingPool(client, stakingPoolAddress);

    // Configuration for unstaking operation
    const unstakingConfig: UnstakingConfig = {
      stakingPoolAddress,
      // unstakeAmount: toNano('5'), // Optional: specify amount, otherwise withdraws all
      strictValidation: true, // Enable strict validation mode
      poolType: 'regular', // 'regular' or 'single-nominator'
    };

    console.log('=== Configuration ===');
    console.log(`👤 Owner Wallet:         ${formatter.address(ownerWallet.address)}`);
    console.log(`📋 Vesting Contract:     ${formatter.address(vestingContract.contractAddress)}`);
    console.log(`🏦 Staking Pool:         ${formatter.address(stakingPoolAddress)}`);
    console.log(
      `🔍 Validation Mode:      ${unstakingConfig.strictValidation ? 'Strict' : 'Lenient'}`
    );
    console.log(`🏗️ Pool Type:            ${unstakingConfig.poolType}`);
    console.log('========================================\n');

    // Load and display contract state
    const contractState = await vestingContract.getAllContractData();
    await vestingContract.logContractState(contractState);

    // Comprehensive validation
    console.log('🔍 === Validation Phase ===');
    const validationResult = await validateUnstakingOperation(
      vestingContract,
      stakingPool,
      unstakingConfig,
      ownerWallet.address
    );

    // Display validation results
    console.log(formatUnstakingValidationSummary(validationResult));

    if (!validationResult.isValid) {
      console.log('\n❌ Validation failed. Please fix the issues above before proceeding.');
      process.exit(1);
    }

    // Display warnings if any
    if (validationResult.warnings.length > 0) {
      console.log('\n⚠️ Proceeding with warnings...');
    }

    // Get validated unstake amount (0 = withdraw all)
    const unstakeAmount = validationResult.calculatedUnstakeAmount || 0n;
    console.log(
      `\n💰 Unstake amount: ${unstakeAmount === 0n ? 'ALL' : `${Number(unstakeAmount) / 1e9} TON`}`
    );

    // Display pool information before unstaking
    await displayPoolInformation(stakingPool, vestingContract.contractAddress);

    // Confirm operation
    console.log('\n🎯 === Executing Unstaking Operation ===');
    console.log('📤 Method: Text Command via Internal Message');
    console.log('🔄 Flow: Owner Wallet → Vesting Contract → Staking Pool');
    console.log('🔒 Security: Whitelist validation + vesting contract protection\n');

    // Store initial balance for monitoring
    const initialBalance = contractState.balance;

    const seqno = await vestingContract.unstakeFromPool(keyPair, stakingPoolAddress, unstakeAmount);

    console.log(`✅ Transaction submitted successfully!`);
    console.log(`📊 Next sequence number: ${seqno}`);

    // Monitor transaction results
    console.log('\n⏳ === Monitoring Transaction ===');
    const [success, newBalance, receivedAmount] =
      await vestingContract.waitForUnstakingResult(initialBalance);

    // Display results
    displayUnstakingResults(success, initialBalance, newBalance, receivedAmount);

    // Show updated pool status
    console.log('\n📈 === Post-Unstaking Status ===');
    await displayMemberStatus(stakingPool, vestingContract.contractAddress);

    console.log('\n🎉 Unstaking operation completed successfully!');
    console.log('💡 Your tokens have been returned to the vesting contract.');
  } catch (error) {
    console.error('\n💥 Unstaking operation failed:');
    console.error(error instanceof Error ? error.message : String(error));

    if (error instanceof Error && error.stack) {
      console.error('\n📍 Stack trace:');
      console.error(error.stack);
    }

    process.exit(1);
  }
}

/**
 * Configuration interface for unstaking operations
 */
interface UnstakingConfig {
  stakingPoolAddress: Address;
  unstakeAmount?: bigint; // Optional: if not specified, withdraws all
  strictValidation: boolean;
  poolType: 'regular' | 'single-nominator';
}

/**
 * Validation result interface for unstaking operations
 */
interface UnstakingValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  calculatedUnstakeAmount?: bigint;
  poolInfo?: {
    isWhitelisted: boolean;
    memberBalance: bigint;
    totalInPool: bigint;
  };
}

/**
 * Validates all preconditions for unstaking operations
 */
async function validateUnstakingOperation(
  vestingContract: VestingContract,
  stakingPool: StakingPool,
  config: UnstakingConfig,
  ownerAddress: Address
): Promise<UnstakingValidationResult> {
  const result: UnstakingValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
  };

  try {
    // Get contract state
    const contractState = await vestingContract.getAllContractData();

    // Check if pool is whitelisted
    const isWhitelisted = await vestingContract.isWhitelisted(config.stakingPoolAddress);
    if (!isWhitelisted) {
      result.errors.push('Staking pool is not whitelisted');
      result.isValid = false;
    }

    // Check member status in pool
    let memberStatus;
    let totalInPool = 0n;
    try {
      memberStatus = await stakingPool.getMemberStatus(vestingContract.contractAddress);
      totalInPool = await stakingPool.getTotalMemberAmount(vestingContract.contractAddress);

      result.poolInfo = {
        isWhitelisted,
        memberBalance: memberStatus.balance,
        totalInPool,
      };

      // Check if there's anything to unstake
      if (totalInPool === 0n) {
        result.errors.push('No tokens found in the staking pool');
        result.isValid = false;
      }

      // Validate specific unstake amount if provided
      if (config.unstakeAmount && config.unstakeAmount > 0n) {
        if (config.unstakeAmount > totalInPool) {
          result.errors.push(
            `Requested unstake amount (${Number(config.unstakeAmount) / 1e9} TON) exceeds total in pool (${Number(totalInPool) / 1e9} TON)`
          );
          result.isValid = false;
        }
        result.calculatedUnstakeAmount = config.unstakeAmount;
      } else {
        // Withdraw all
        result.calculatedUnstakeAmount = 0n; // 0 means withdraw all
      }
    } catch (error) {
      result.warnings.push(`Could not fetch pool member status: ${error}`);
    }

    // Check sufficient balance for fees
    const requiredFees = 0.4 * 1e9; // Approximate fees in nanoTON
    if (contractState.balance < BigInt(requiredFees)) {
      result.errors.push(
        `Insufficient balance for unstaking fees. Required: ~${requiredFees / 1e9} TON, Available: ${Number(contractState.balance) / 1e9} TON`
      );
      result.isValid = false;
    }

    // Check owner authorization
    const isOwner = ownerAddress.toString() === contractState.ownerAddress.toString();
    if (!isOwner) {
      result.errors.push('Only the contract owner can initiate unstaking');
      result.isValid = false;
    }

    // Warnings for edge cases
    if (memberStatus?.pendingWithdraw && memberStatus.pendingWithdraw > 0n) {
      result.warnings.push(
        `There are pending withdrawals (${Number(memberStatus.pendingWithdraw) / 1e9} TON) that may affect this operation`
      );
    }

    if (memberStatus?.pendingDeposit && memberStatus.pendingDeposit > 0n) {
      result.warnings.push(
        `There are pending deposits (${Number(memberStatus.pendingDeposit) / 1e9} TON) in the pool`
      );
    }
  } catch (error) {
    result.errors.push(
      `Validation error: ${error instanceof Error ? error.message : String(error)}`
    );
    result.isValid = false;
  }

  return result;
}

/**
 * Formats validation results for display
 */
function formatUnstakingValidationSummary(result: UnstakingValidationResult): string {
  let summary = '\n📋 === Unstaking Validation Summary ===\n';

  if (result.isValid) {
    summary += '✅ All validations passed\n';
  } else {
    summary += '❌ Validation failed\n';
  }

  if (result.poolInfo) {
    summary += `\n🏦 Pool Information:\n`;
    summary += `   • Whitelisted: ${result.poolInfo.isWhitelisted ? '✅' : '❌'}\n`;
    summary += `   • Member Balance: ${Number(result.poolInfo.memberBalance) / 1e9} TON\n`;
    summary += `   • Total in Pool: ${Number(result.poolInfo.totalInPool) / 1e9} TON\n`;
  }

  if (result.calculatedUnstakeAmount !== undefined) {
    summary += `\n💰 Unstake Amount: ${result.calculatedUnstakeAmount === 0n ? 'ALL' : `${Number(result.calculatedUnstakeAmount) / 1e9} TON`}\n`;
  }

  if (result.errors.length > 0) {
    summary += '\n❌ Errors:\n';
    result.errors.forEach(error => {
      summary += `   • ${error}\n`;
    });
  }

  if (result.warnings.length > 0) {
    summary += '\n⚠️ Warnings:\n';
    result.warnings.forEach(warning => {
      summary += `   • ${warning}\n`;
    });
  }

  summary += '========================================';
  return summary;
}

/**
 * Displays comprehensive pool information including status and parameters
 */
async function displayPoolInformation(
  stakingPool: StakingPool,
  memberAddress: Address
): Promise<void> {
  console.log('🏦 === Pool Information ===');

  try {
    // Get pool status and parameters
    const [memberStatus] = await Promise.all([stakingPool.getMemberStatus(memberAddress)]);

    // Current member status
    const totalInPool = await stakingPool.getTotalMemberAmount(memberAddress);
    console.log(`\n👤 Current Member Status:`);
    console.log(`   • Total in Pool:       ${Number(totalInPool) / 1e9} TON`);
    console.log(`   • Active Balance:      ${Number(memberStatus.balance) / 1e9} TON`);
    console.log(`   • Pending Deposit:     ${Number(memberStatus.pendingDeposit) / 1e9} TON`);
    console.log(`   • Pending Withdraw:    ${Number(memberStatus.pendingWithdraw) / 1e9} TON`);
    console.log(`   • Ready to Withdraw:   ${Number(memberStatus.withdrawReady) / 1e9} TON`);
  } catch (error) {
    console.log(`❌ Could not fetch pool information: ${error}`);
  }

  console.log('========================================');
}

/**
 * Displays current member status in the staking pool
 */
async function displayMemberStatus(
  stakingPool: StakingPool,
  memberAddress: Address
): Promise<void> {
  try {
    const memberStatus = await stakingPool.getMemberStatus(memberAddress);
    const totalInPool =
      memberStatus.balance +
      memberStatus.pendingDeposit +
      memberStatus.pendingWithdraw +
      memberStatus.withdrawReady;

    console.log(`💼 Member Status:`);
    console.log(`   • Total in Pool:       ${Number(totalInPool) / 1e9} TON`);
    console.log(`   • Active (Earning):    ${Number(memberStatus.balance) / 1e9} TON`);
    console.log(`   • Pending Deposit:     ${Number(memberStatus.pendingDeposit) / 1e9} TON`);
    console.log(`   • Pending Withdraw:    ${Number(memberStatus.pendingWithdraw) / 1e9} TON`);
    console.log(`   • Ready to Withdraw:   ${Number(memberStatus.withdrawReady) / 1e9} TON`);

    // Status indicators
    const indicators: string[] = [];
    if (memberStatus.balance > 0) indicators.push('🎯 Still earning rewards');
    if (memberStatus.pendingDeposit > 0) indicators.push('⏳ Deposit pending');
    if (memberStatus.pendingWithdraw > 0) indicators.push('🔄 Withdrawal processing');
    if (memberStatus.withdrawReady > 0) indicators.push('💰 Funds ready');
    if (totalInPool === 0n) indicators.push('✅ Fully unstaked');

    if (indicators.length > 0) {
      console.log(`\n📍 Status: ${indicators.join(', ')}`);
    }
  } catch (error) {
    console.log(`⚠️ Could not fetch member status: ${error}`);
  }
}

/**
 * Displays unstaking transaction results with detailed breakdown
 */
function displayUnstakingResults(
  success: boolean,
  initialBalance: bigint,
  newBalance: bigint,
  receivedAmount: bigint
): void {
  console.log('\n📊 === Unstaking Results ===');

  if (success) {
    const totalChange = newBalance - initialBalance;
    const feesPaid = receivedAmount - totalChange;

    console.log('✅ Unstaking successful!');
    console.log(`💰 Received from Pool:    ${Number(receivedAmount) / 1e9} TON`);
    console.log(`💸 Fees Paid:             ${Number(feesPaid) / 1e9} TON`);
    console.log(`📈 Net Increase:          ${Number(totalChange) / 1e9} TON`);
    console.log(`📊 New Balance:           ${Number(newBalance) / 1e9} TON`);

    if (feesPaid > receivedAmount / 10n) {
      // More than 10% fees
      console.log(
        '⚠️ Higher than expected fees detected - this may be normal for unstaking operations'
      );
    }
  } else {
    const balanceChange = newBalance - initialBalance;
    console.log('⚠️ Unstaking status unclear');
    console.log(`📊 Current Balance:       ${Number(newBalance) / 1e9} TON`);
    console.log(`📈 Balance Change:        ${Number(balanceChange) / 1e9} TON`);

    if (receivedAmount > 0) {
      console.log(`💰 Detected Received:     ${Number(receivedAmount) / 1e9} TON`);
    }

    console.log('💡 The transaction may still be processing. Check manually if needed.');
  }

  console.log('========================================');
}

// Execute the main function
main().catch(error => {
  console.error('\n💥 Unhandled error in main:');
  console.error(error);
  process.exit(1);
});
