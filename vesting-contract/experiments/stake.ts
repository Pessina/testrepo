import { TonClient } from '@ton/ton';
import { Address } from '@ton/core';
import { getWallet } from './utils/getWallet';
import { getEnv } from './utils/getEnv';
import { VestingContract } from './utils/VestingContract';
import { StakingPool } from './utils/StakingPool';
import { StakingValidation, type StakingConfig } from './utils/StakingValidation';
import { formatter } from './utils/formatter';
import { TON_POOL_PAIR } from './utils/constants';

/**
 * Simplified staking script using the organized class structure
 *
 * This script demonstrates how to:
 * 1. Validate staking preconditions comprehensively
 * 2. Execute staking operations safely
 * 3. Monitor transaction results
 * 4. Handle errors gracefully
 *
 * The code is now organized into logical classes:
 * - VestingContract: Core vesting and staking operations
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

    console.log('\n🚀 === TON Vesting Contract Staking === 🚀');
    console.log('Using organized class structure with comprehensive validation\n');

    // Initialize contract and pool instances
    const vestingContract = new VestingContract(client, contractAddress, ownerWallet);
    const stakingPoolAddress = Address.parse(TON_POOL_PAIR[0]);
    const stakingPool = new StakingPool(client, stakingPoolAddress);

    // Configuration for staking operation
    const stakingConfig: StakingConfig = {
      stakingPoolAddress,
      // stakeAmount: toNano('10'), // Optional: specify amount, otherwise uses max available
      strictValidation: true, // Enable strict validation mode
    };

    console.log('=== Configuration ===');
    console.log(`👤 Owner Wallet:         ${formatter.address(ownerWallet.address)}`);
    console.log(`📋 Vesting Contract:     ${formatter.address(vestingContract.contractAddress)}`);
    console.log(`🏦 Staking Pool:         ${formatter.address(stakingPoolAddress)}`);
    console.log(
      `🔍 Validation Mode:      ${stakingConfig.strictValidation ? 'Strict' : 'Lenient'}`
    );
    console.log('========================================\n');

    // Load and display contract state
    const contractState = await vestingContract.getAllContractData();
    await vestingContract.logContractState(contractState);

    // Comprehensive validation
    console.log('🔍 === Validation Phase ===');
    const validationResult = await StakingValidation.validateStakingOperation(
      vestingContract,
      stakingPool,
      stakingConfig,
      ownerWallet.address
    );

    // Display validation results
    console.log(StakingValidation.formatValidationSummary(validationResult));

    if (!validationResult.isValid) {
      console.log('\n❌ Validation failed. Please fix the issues above before proceeding.');
      process.exit(1);
    }

    // Display warnings if any
    if (validationResult.warnings.length > 0) {
      console.log('\n⚠️ Proceeding with warnings...');
    }

    // Get validated stake amount
    const stakeAmount = validationResult.calculatedStakeAmount!;
    console.log(`\n💰 Calculated stake amount: ${Number(stakeAmount) / 1e9} TON`);

    // Display pool information
    await displayPoolInformation(stakingPool, vestingContract.contractAddress);

    // Confirm operation
    console.log('\n🎯 === Executing Staking Operation ===');
    console.log('📤 Method: Text Command via Internal Message');
    console.log('🔄 Flow: Owner Wallet → Vesting Contract → Staking Pool');
    console.log('🔒 Security: Whitelist validation + vesting contract protection\n');

    // Store initial balance for monitoring
    const initialBalance = contractState.balance;

    // Execute staking operation
    const seqno = await vestingContract.stakeToPool(keyPair, stakingPoolAddress, stakeAmount);

    console.log(`✅ Transaction submitted successfully!`);
    console.log(`📊 Next sequence number: ${seqno}`);

    // Monitor transaction results
    console.log('\n⏳ === Monitoring Transaction ===');
    const [success, newBalance] = await vestingContract.waitForStakingResult(initialBalance);

    // Display results
    displayTransactionResults(success, initialBalance, newBalance, stakeAmount);

    // Show updated pool status
    console.log('\n📈 === Post-Staking Status ===');
    await displayMemberStatus(stakingPool, vestingContract.contractAddress);

    console.log('\n🎉 Staking operation completed successfully!');
    console.log(
      '💡 Your locked tokens are now earning staking rewards through the whitelisted pool.'
    );
  } catch (error) {
    console.error('\n💥 Staking operation failed:');
    console.error(error instanceof Error ? error.message : String(error));

    if (error instanceof Error && error.stack) {
      console.error('\n📍 Stack trace:');
      console.error(error.stack);
    }

    process.exit(1);
  }
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
    if (memberStatus.balance > 0) indicators.push('🎯 Earning rewards');
    if (memberStatus.pendingDeposit > 0) indicators.push('⏳ Deposit pending');
    if (memberStatus.pendingWithdraw > 0) indicators.push('🔄 Withdrawal processing');
    if (memberStatus.withdrawReady > 0) indicators.push('💰 Funds ready');

    if (indicators.length > 0) {
      console.log(`\n📍 Status: ${indicators.join(', ')}`);
    }
  } catch (error) {
    console.log(`⚠️ Could not fetch member status: ${error}`);
  }
}

/**
 * Displays transaction results with detailed breakdown
 */
function displayTransactionResults(
  success: boolean,
  initialBalance: bigint,
  newBalance: bigint,
  expectedStakeAmount: bigint
): void {
  console.log('\n📊 === Transaction Results ===');

  if (success) {
    const actualAmount = initialBalance - newBalance;
    const difference = actualAmount - expectedStakeAmount;

    console.log('✅ Transaction successful!');
    console.log(`💸 Total Sent:            ${Number(actualAmount) / 1e9} TON`);
    console.log(`🎯 Expected Stake:        ${Number(expectedStakeAmount) / 1e9} TON`);
    console.log(`💰 Fees Paid:             ${Number(difference) / 1e9} TON`);
    console.log(`📊 New Balance:           ${Number(newBalance) / 1e9} TON`);

    if (difference > (expectedStakeAmount * 10n) / 100n) {
      // More than 10% fees
      console.log(
        '⚠️ Higher than expected fees detected - this is normal for initial transactions'
      );
    }
  } else {
    console.log('⚠️ Transaction status unclear');
    console.log(`📊 Current Balance:       ${Number(newBalance) / 1e9} TON`);
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
