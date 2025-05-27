import { TonClient } from '@ton/ton';
import { Address, toNano } from '@ton/core';
import { getWallet } from './utils/getWallet';
import { getEnv } from './utils/getEnv';
import { VestingContract } from './utils/VestingContract';
import { StakingPool } from './utils/StakingPool';
import { formatter } from './utils/formatter';
import { TON_POOL_PAIR } from './utils/constants';

/**
 * Simplified unstaking script using VestingContract validation
 *
 * This script demonstrates how to:
 * 1. Execute unstaking operations safely with built-in validation
 * 2. Monitor transaction results
 * 3. Handle errors gracefully
 *
 * All validation is now handled inside the VestingContract class methods.
 */
async function main(): Promise<void> {
  try {
    // Initialize environment and connections
    const { contractAddress, apiKey, endpoint, keyPair } = await getEnv();
    const client = new TonClient({ endpoint, apiKey });
    const ownerWallet = getWallet({ keyPair, subwalletNumber: 0 });

    console.log('\n🔄 === TON Vesting Contract Unstaking === 🔄');
    console.log('Using VestingContract built-in validation\n');

    // Initialize contract and pool instances
    const vestingContract = new VestingContract(client, contractAddress, ownerWallet);
    const stakingPoolAddress = Address.parse(TON_POOL_PAIR[0]);
    const stakingPool = new StakingPool(client, stakingPoolAddress);

    console.log('=== Configuration ===');
    console.log(`👤 Owner Wallet:         ${formatter.address(ownerWallet.address)}`);
    console.log(`📋 Vesting Contract:     ${formatter.address(vestingContract.contractAddress)}`);
    console.log(`🏦 Staking Pool:         ${formatter.address(stakingPoolAddress)}`);
    console.log('========================================\n');

    // Load and display contract state
    const contractState = await vestingContract.getAllContractData();
    await vestingContract.logContractState(contractState);

    // Display pool information before unstaking
    await displayPoolInformation(stakingPool, vestingContract.contractAddress);

    // Optional: specify unstake amount, otherwise withdraws all
    // const unstakeAmount = toNano('5'); // Uncomment to unstake specific amount
    const unstakeAmount = 0n; // Withdraw all (default)

    console.log(
      `\n💰 Unstake amount: ${unstakeAmount === 0n ? 'ALL' : `${Number(unstakeAmount) / 1e9} TON`}`
    );

    console.log('\n🎯 === Executing Unstaking Operation ===');
    console.log('📤 Method: Text Command via Internal Message');
    console.log('🔄 Flow: Owner Wallet → Vesting Contract → Staking Pool');
    console.log('🔒 Security: Built-in whitelist validation + vesting contract protection\n');

    // Store initial balance for monitoring
    const initialBalance = contractState.balance;

    // Execute unstaking operation (validation happens inside the method)
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
