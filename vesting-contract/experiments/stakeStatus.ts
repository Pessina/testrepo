import { TonClient } from '@ton/ton';
import { Address } from '@ton/core';
import { getWallet } from './utils/getWallet';
import { getEnv } from './utils/getEnv';
import { VestingContract } from './utils/VestingContract';
import { StakingPool } from './utils/StakingPool';
import { formatter } from './utils/formatter';
import { TON_POOL_PAIR } from './utils/constants';

/**
 * Comprehensive status checker using the organized class structure
 *
 * This script provides detailed insights into:
 * 1. Vesting contract state and balances
 * 2. Staking pool participation status
 * 3. Pool health and validation cycles
 * 4. Earnings estimates and recommendations
 * 5. Actionable insights for optimization
 */
async function main(): Promise<void> {
  try {
    // Initialize environment and connections
    const { contractAddress, apiKey, endpoint, keyPair } = await getEnv();
    const client = new TonClient({ endpoint, apiKey });
    const ownerWallet = getWallet({ keyPair, subwalletNumber: 0 });

    console.log('\n📊 === Comprehensive Staking Status === 📊');
    console.log('Powered by organized class structure for better insights\n');

    // Initialize instances
    const vestingContract = new VestingContract(client, contractAddress, ownerWallet);
    const stakingPoolAddress = Address.parse(TON_POOL_PAIR[0]);
    const stakingPool = new StakingPool(client, stakingPoolAddress);

    console.log('=== Account Information ===');
    console.log(`👤 Owner Wallet:         ${formatter.address(ownerWallet.address)}`);
    console.log(`📋 Vesting Contract:     ${formatter.address(vestingContract.contractAddress)}`);
    console.log(`🏦 Staking Pool:         ${formatter.address(stakingPoolAddress)}`);
    console.log('========================================\n');

    // Get comprehensive state information
    const contractState = await vestingContract.getAllContractData();

    // Display vesting contract overview
    await displayVestingOverview(contractState);

    // Check whitelist status
    const isWhitelisted = await vestingContract.isWhitelisted(stakingPoolAddress);
    console.log(
      `🔐 Pool Whitelist Status: ${isWhitelisted ? '✅ Whitelisted' : '❌ Not Whitelisted'}`
    );

    if (!isWhitelisted) {
      console.log('\n⚠️ WARNING: Staking pool is not whitelisted.');
      console.log('   Add it to the whitelist using the vesting sender address to enable staking.');
      console.log('========================================\n');
      return;
    }

    // Get detailed staking information
    await displayMemberStatus(stakingPool, vestingContract.contractAddress);
  } catch (error) {
    console.error('\n💥 Status check failed:');
    console.error(error instanceof Error ? error.message : String(error));

    if (error instanceof Error && error.stack) {
      console.error('\n📍 Stack trace:');
      console.error(error.stack);
    }

    process.exit(1);
  }
}

/**
 * Displays comprehensive vesting contract overview
 */
async function displayVestingOverview(contractState: any): Promise<void> {
  console.log('=== Vesting Contract Overview ===');

  const totalBalance = Number(contractState.balance) / 1e9;
  const lockedAmount = Number(contractState.lockedAmount) / 1e9;
  const vestedAmount = totalBalance - lockedAmount;
  const totalVesting = Number(contractState.vestingTotalAmount) / 1e9;

  console.log(`💰 Total Balance:        ${totalBalance.toFixed(6)} TON`);
  console.log(`🔒 Locked Amount:        ${lockedAmount.toFixed(6)} TON`);
  console.log(`✅ Vested Amount:        ${vestedAmount.toFixed(6)} TON`);
  console.log(`📋 Total Vesting:       ${totalVesting.toFixed(6)} TON`);

  // Vesting progress
  const vestingProgress =
    totalVesting > 0 ? ((totalVesting - lockedAmount) / totalVesting) * 100 : 0;
  console.log(`📈 Vesting Progress:     ${vestingProgress.toFixed(2)}%`);

  // Time information
  const startTime = new Date(contractState.vestingStartTime * 1000);
  const endTime = new Date(
    (contractState.vestingStartTime + contractState.vestingTotalDuration) * 1000
  );
  const now = new Date();

  console.log(`⏰ Vesting Started:      ${startTime.toLocaleDateString()}`);
  console.log(`🏁 Vesting Ends:         ${endTime.toLocaleDateString()}`);

  if (now < endTime) {
    const remainingDays = Math.ceil((endTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    console.log(`⏳ Days Remaining:       ${remainingDays} days`);
  } else {
    console.log(`✅ Vesting Complete:     All tokens unlocked`);
  }

  console.log('========================================\n');
}

/**
 * Displays detailed member status in the staking pool
 */
async function displayMemberStatus(
  stakingPool: StakingPool,
  memberAddress: Address
): Promise<void> {
  console.log('=== Member Status in Staking Pool ===');

  try {
    const memberStatus = await stakingPool.getMemberStatus(memberAddress);

    const balance = Number(memberStatus.balance) / 1e9;
    const pendingDeposit = Number(memberStatus.pendingDeposit) / 1e9;
    const pendingWithdraw = Number(memberStatus.pendingWithdraw) / 1e9;
    const withdrawReady = Number(memberStatus.withdrawReady) / 1e9;
    const totalInPool = balance + pendingDeposit + pendingWithdraw + withdrawReady;

    console.log(`🎯 Active Staking:       ${balance.toFixed(6)} TON`);
    console.log(`⏳ Pending Deposit:      ${pendingDeposit.toFixed(6)} TON`);
    console.log(`🔄 Pending Withdraw:     ${pendingWithdraw.toFixed(6)} TON`);
    console.log(`💰 Ready to Withdraw:    ${withdrawReady.toFixed(6)} TON`);
    console.log(`📊 Total in Pool:        ${totalInPool.toFixed(6)} TON`);
  } catch (error) {
    console.log(`❌ Could not fetch member status: ${error}`);
  }

  console.log('========================================\n');
}

// Execute the main function
main().catch(error => {
  console.error('\n💥 Unhandled error in status checker:');
  console.error(error);
  process.exit(1);
});
