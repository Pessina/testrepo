import { TonClient } from '@ton/ton';
import { Address, beginCell } from '@ton/core';
import { getWallet } from './utils/getWallet';
import { getEnv } from './utils/getEnv';
import { VestingContract } from './utils/VestingContract';
import { formatter } from './utils/formatter';
import { TON_POOL_PAIR } from './utils/constants';

interface StakingPoolMemberStatus {
  balance: bigint;
  pendingDeposit: bigint;
  pendingWithdraw: bigint;
  withdrawReady: bigint;
}

interface StakingPoolStatus {
  totalBalance: bigint;
  balanceSent: bigint;
  pendingDeposits: bigint;
  pendingWithdrawals: bigint;
  withdrawReady: bigint;
}

interface ValidationStatus {
  stakeAt: number;
  stakeUntil: number;
  stakeSent: bigint;
  querySent: boolean;
  canUnlock: boolean;
  isLocked: boolean;
  stakeLockFinal: boolean;
}

interface StakingPoolParams {
  enabled: boolean;
  updatesEnabled: boolean;
  minStake: bigint;
  depositFee: bigint;
  withdrawFee: bigint;
  poolFee: bigint;
  receiptPrice: bigint;
}

/**
 * Comprehensive staking status checker for vesting contract participation in TON staking pools
 *
 * FUNCTIONALITY:
 * - Shows detailed member status (balance, pending deposits/withdrawals, ready amounts)
 * - Displays pool-wide statistics and parameters
 * - Reports validation cycle status and timing
 * - Calculates earnings and provides actionable insights
 *
 * MEMBER STATUS BREAKDOWN:
 * - Balance: Currently staked and earning rewards
 * - Pending Deposit: Deposited but not yet accepted into staking
 * - Pending Withdraw: Requested withdrawal, waiting for cycle completion
 * - Withdraw Ready: Available for immediate withdrawal
 *
 * POOL STATUS:
 * - Shows overall pool health and activity
 * - Validation cycle timing and lock status
 * - Fee structure and minimum requirements
 */
async function main(): Promise<void> {
  const { contractAddress, apiKey, endpoint, keyPair } = await getEnv();

  const client = new TonClient({ endpoint, apiKey });
  const ownerWallet = getWallet({ keyPair, subwalletNumber: 0 });

  // Staking pool to check status for
  const stakingPoolAddress = Address.parse(TON_POOL_PAIR[0]);

  console.log('\n=== Staking Status Check ===');
  console.log(`Vesting Contract:    ${formatter.address(Address.parse(contractAddress))}`);
  console.log(`Staking Pool:        ${formatter.address(stakingPoolAddress)}`);
  console.log(`Owner Wallet:        ${formatter.address(ownerWallet.address)}`);
  console.log('========================================');

  try {
    const vestingContract = new VestingContract(client, contractAddress, ownerWallet);

    // Get vesting contract state
    const vestingState = await vestingContract.getAllContractData();
    console.log('\n=== Vesting Contract Overview ===');
    console.log(`Balance:             ${Number(vestingState.balance) / 1e9} TON`);
    console.log(`Locked Amount:       ${Number(vestingState.lockedAmount) / 1e9} TON`);
    console.log(
      `Vested Amount:       ${Number(vestingState.balance - vestingState.lockedAmount) / 1e9} TON`
    );

    // Check if pool is whitelisted
    const isWhitelisted = await vestingContract.isWhitelisted(stakingPoolAddress);
    console.log(`Pool Whitelisted:    ${isWhitelisted ? '✅ Yes' : '❌ No'}`);

    if (!isWhitelisted) {
      console.log('\n⚠️ Staking pool is not whitelisted. Cannot check staking status.');
      return;
    }

    // Get detailed staking information
    await checkMemberStatus(client, stakingPoolAddress, Address.parse(contractAddress));
    await checkPoolStatus(client, stakingPoolAddress);
    await checkValidationStatus(client, stakingPoolAddress);
    await checkPoolParameters(client, stakingPoolAddress);

    // Provide actionable insights
    await provideActionableInsights(
      client,
      stakingPoolAddress,
      Address.parse(contractAddress),
      vestingState
    );
  } catch (error) {
    console.error(
      '❌ Status check failed:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

/**
 * Checks the vesting contract's member status in the staking pool
 */
async function checkMemberStatus(
  client: TonClient,
  stakingPoolAddress: Address,
  vestingContractAddress: Address
): Promise<StakingPoolMemberStatus> {
  console.log('\n=== Member Status in Staking Pool ===');

  try {
    const result = await client.runMethod(stakingPoolAddress, 'get_member_balance', [
      { type: 'slice', cell: beginCell().storeAddress(vestingContractAddress).endCell() },
    ]);

    const balance = result.stack.readBigNumber();
    const pendingDeposit = result.stack.readBigNumber();
    const pendingWithdraw = result.stack.readBigNumber();
    const withdrawReady = result.stack.readBigNumber();

    const status: StakingPoolMemberStatus = {
      balance,
      pendingDeposit,
      pendingWithdraw,
      withdrawReady,
    };

    console.log(`Staked Balance:      ${Number(balance) / 1e9} TON`);
    console.log(`Pending Deposit:     ${Number(pendingDeposit) / 1e9} TON`);
    console.log(`Pending Withdraw:    ${Number(pendingWithdraw) / 1e9} TON`);
    console.log(`Ready to Withdraw:   ${Number(withdrawReady) / 1e9} TON`);

    const totalInPool = balance + pendingDeposit + pendingWithdraw + withdrawReady;
    console.log(`Total in Pool:       ${Number(totalInPool) / 1e9} TON`);

    // Status indicators
    if (pendingDeposit > 0) {
      console.log('🔄 Deposit pending acceptance');
    }
    if (pendingWithdraw > 0) {
      console.log('⏳ Withdrawal pending (wait for cycle completion)');
    }
    if (withdrawReady > 0) {
      console.log('💰 Funds ready for immediate withdrawal');
    }
    if (balance > 0) {
      console.log('🎯 Actively earning staking rewards');
    }

    return status;
  } catch (error) {
    console.log('❌ Could not fetch member status:', error);
    throw error;
  }
}

/**
 * Checks overall pool status and statistics
 */
async function checkPoolStatus(
  client: TonClient,
  stakingPoolAddress: Address
): Promise<StakingPoolStatus> {
  console.log('\n=== Pool Status ===');

  try {
    const result = await client.runMethod(stakingPoolAddress, 'get_pool_status');

    const totalBalance = result.stack.readBigNumber();
    const balanceSent = result.stack.readBigNumber();
    const pendingDeposits = result.stack.readBigNumber();
    const pendingWithdrawals = result.stack.readBigNumber();
    const withdrawReady = result.stack.readBigNumber();

    const status: StakingPoolStatus = {
      totalBalance,
      balanceSent,
      pendingDeposits,
      pendingWithdrawals,
      withdrawReady,
    };

    console.log(`Total Pool Balance:   ${Number(totalBalance) / 1e9} TON`);
    console.log(`Balance Sent (Staking): ${Number(balanceSent) / 1e9} TON`);
    console.log(`Available to Stake:   ${Number(totalBalance - balanceSent) / 1e9} TON`);
    console.log(`Pending Deposits:     ${Number(pendingDeposits) / 1e9} TON`);
    console.log(`Pending Withdrawals:  ${Number(pendingWithdrawals) / 1e9} TON`);
    console.log(`Withdraw Ready:       ${Number(withdrawReady) / 1e9} TON`);

    // Pool health indicators
    const utilizationRate = totalBalance > 0 ? (balanceSent * 100n) / totalBalance : 0n;
    console.log(`Utilization Rate:     ${Number(utilizationRate)}%`);

    return status;
  } catch (error) {
    console.log('❌ Could not fetch pool status:', error);
    throw error;
  }
}

/**
 * Checks validation cycle status and timing
 */
async function checkValidationStatus(
  client: TonClient,
  stakingPoolAddress: Address
): Promise<ValidationStatus> {
  console.log('\n=== Validation Status ===');

  try {
    const result = await client.runMethod(stakingPoolAddress, 'get_staking_status');

    const stakeAt = result.stack.readNumber();
    const stakeUntil = result.stack.readNumber();
    const stakeSent = result.stack.readBigNumber();
    const querySent = result.stack.readBoolean();
    const canUnlock = result.stack.readBoolean();
    const isLocked = result.stack.readBoolean();
    const stakeLockFinal = result.stack.readBoolean();

    const status: ValidationStatus = {
      stakeAt,
      stakeUntil,
      stakeSent,
      querySent,
      canUnlock,
      isLocked,
      stakeLockFinal,
    };

    const now = Math.floor(Date.now() / 1000);

    if (stakeAt > 0) {
      console.log(`Validation Started:   ${new Date(stakeAt * 1000).toLocaleString()}`);
      console.log(`Validation Ends:      ${new Date(stakeUntil * 1000).toLocaleString()}`);

      if (now < stakeUntil) {
        const remainingTime = stakeUntil - now;
        const hours = Math.floor(remainingTime / 3600);
        const minutes = Math.floor((remainingTime % 3600) / 60);
        console.log(`Time Remaining:       ${hours}h ${minutes}m`);
      }
    } else {
      console.log('Validation Cycle:     Not active');
    }

    console.log(`Stake Sent:           ${Number(stakeSent) / 1e9} TON`);
    console.log(`Pool Locked:          ${isLocked ? '🔒 Yes' : '🔓 No'}`);
    console.log(`Can Unlock:           ${canUnlock ? '✅ Yes' : '❌ No'}`);
    console.log(`Query in Progress:    ${querySent ? '🔄 Yes' : '⏸️ No'}`);
    console.log(`Lock Finalized:       ${stakeLockFinal ? '✅ Yes' : '❌ No'}`);

    return status;
  } catch (error) {
    console.log('❌ Could not fetch validation status:', error);
    throw error;
  }
}

/**
 * Checks pool parameters and fee structure
 */
async function checkPoolParameters(
  client: TonClient,
  stakingPoolAddress: Address
): Promise<StakingPoolParams> {
  console.log('\n=== Pool Parameters ===');

  try {
    const result = await client.runMethod(stakingPoolAddress, 'get_params');

    const enabled = result.stack.readBoolean();
    const updatesEnabled = result.stack.readBoolean();
    const minStake = result.stack.readBigNumber();
    const depositFee = result.stack.readBigNumber();
    const withdrawFee = result.stack.readBigNumber();
    const poolFee = result.stack.readBigNumber();
    const receiptPrice = result.stack.readBigNumber();

    const params: StakingPoolParams = {
      enabled,
      updatesEnabled,
      minStake,
      depositFee,
      withdrawFee,
      poolFee,
      receiptPrice,
    };

    console.log(`Pool Enabled:         ${enabled ? '✅ Yes' : '❌ No'}`);
    console.log(`Updates Enabled:      ${updatesEnabled ? '✅ Yes' : '❌ No'}`);
    console.log(`Minimum Stake:        ${Number(minStake) / 1e9} TON`);
    console.log(`Deposit Fee:          ${Number(depositFee) / 1e9} TON`);
    console.log(`Withdraw Fee:         ${Number(withdrawFee) / 1e9} TON`);
    console.log(`Pool Fee:             ${Number(poolFee) / 100}%`);
    console.log(`Receipt Price:        ${Number(receiptPrice) / 1e9} TON`);

    return params;
  } catch (error) {
    console.log('❌ Could not fetch pool parameters:', error);
    throw error;
  }
}

/**
 * Provides actionable insights based on current status
 */
async function provideActionableInsights(
  client: TonClient,
  stakingPoolAddress: Address,
  vestingContractAddress: Address,
  vestingState: any
): Promise<void> {
  console.log('\n=== Actionable Insights ===');

  try {
    // Get current member status
    const memberResult = await client.runMethod(stakingPoolAddress, 'get_member_balance', [
      { type: 'slice', cell: beginCell().storeAddress(vestingContractAddress).endCell() },
    ]);

    const balance = memberResult.stack.readBigNumber();
    const pendingDeposit = memberResult.stack.readBigNumber();
    const pendingWithdraw = memberResult.stack.readBigNumber();
    const withdrawReady = memberResult.stack.readBigNumber();

    const totalStaked = balance + pendingDeposit + pendingWithdraw + withdrawReady;
    const unstaked = vestingState.balance - totalStaked;

    console.log('📊 Summary:');
    console.log(`  Vesting Balance:     ${Number(vestingState.balance) / 1e9} TON`);
    console.log(`  In Staking Pool:     ${Number(totalStaked) / 1e9} TON`);
    console.log(`  Not Staked:          ${Number(unstaked) / 1e9} TON`);

    if (unstaked > 0) {
      console.log(
        `\n💡 Opportunity: You have ${Number(unstaked) / 1e9} TON not earning staking rewards`
      );
      console.log('   Consider staking more to maximize returns');
    }

    if (pendingDeposit > 0) {
      console.log(
        `\n⏳ Pending: ${Number(pendingDeposit) / 1e9} TON deposit waiting for acceptance`
      );
      console.log('   This will automatically be accepted in the next cycle');
    }

    if (pendingWithdraw > 0) {
      console.log(`\n🔄 Processing: ${Number(pendingWithdraw) / 1e9} TON withdrawal in progress`);
      console.log('   Wait for validation cycle to complete');
    }

    if (withdrawReady > 0) {
      console.log(
        `\n💰 Ready: ${Number(withdrawReady) / 1e9} TON available for immediate withdrawal`
      );
      console.log('   Send "Withdraw" command to claim');
    }

    if (balance > 0) {
      console.log(`\n🎯 Active: ${Number(balance) / 1e9} TON actively earning rewards`);

      // Estimate daily earnings (rough calculation)
      const annualAPY = 0.03; // Approximate 3% APY
      const dailyEarnings = (Number(balance) / 1e9) * (annualAPY / 365);
      console.log(`   Estimated daily earnings: ~${dailyEarnings.toFixed(6)} TON`);
    }

    // Pool status insights
    const poolResult = await client.runMethod(stakingPoolAddress, 'get_pool_status');
    const poolBalance = poolResult.stack.readBigNumber();
    const poolSent = poolResult.stack.readBigNumber();

    if (poolBalance > poolSent) {
      console.log(
        `\n🔄 Pool Status: ${Number(poolBalance - poolSent) / 1e9} TON available for next validation cycle`
      );
    }
  } catch (error) {
    console.log('❌ Could not generate insights:', error);
  }

  console.log('\n========================================');
}

main().catch(error => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
});
