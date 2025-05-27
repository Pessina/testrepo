import { TonClient, internal, SendMode } from '@ton/ton';
import { Address, beginCell, toNano } from '@ton/core';
import { KeyPair } from '@ton/crypto';
import { getWallet } from './utils/getWallet';
import { getEnv } from './utils/getEnv';
import { VestingContract } from './utils/VestingContract';
import { formatter } from './utils/formatter';
import { SAFETY_MARGIN } from './utils/constants';
import { TON_POOL_PAIR } from './utils/constants';

// Operation codes
const OP_SEND = 0xa7733acd; // Tell vesting contract: "Execute send_message()"

// Send modes (must use mode 3 for vesting contract restrictions)
const SEND_MODE_IGNORE_ERRORS_PAY_FEES_SEPARATELY = 3;

// Text command constants from the staking pool contract
const TEXT_COMMAND_OP = 0; // Text commands start with 0
const DEPOSIT_FIRST_CHAR = 68; // 'D' as uint8
const DEPOSIT_REMAINING = 111533580577140; // 'eposit' as uint48

// Fees based on the staking pool contract
const STAKING_FEES = {
  RECEIPT_FEE: toNano('0.1'), // fees::receipt() from contract
  DEPOSIT_FEE: toNano('0.1'), // fees::op() from contract
  GAS_FEE: toNano('0.1'), // Gas for transaction processing
  VESTING_OP_FEE: toNano('0.1'), // Fee for vesting contract operation
  TOTAL: toNano('0.4'), // Total minimum fees needed
} as const;

interface StakingConfig {
  stakingPoolAddress: Address;
  stakeAmount?: bigint; // Optional: defaults to max available
}

interface ContractState {
  balance: bigint;
  lockedAmount: bigint;
  [key: string]: any;
}

/**
 * Stakes tokens from a vesting contract to a TON staking pool via internal message
 * Using TEXT COMMAND MODE as requested
 */
async function main(): Promise<void> {
  const { contractAddress, apiKey, endpoint, keyPair } = await getEnv();

  const client = new TonClient({ endpoint, apiKey });

  // Owner wallet that will send the internal message to vesting contract
  const ownerWallet = getWallet({ keyPair, subwalletNumber: 0 });

  // TODO: Replace with your actual staking pool address
  const config: StakingConfig = {
    stakingPoolAddress: Address.parse(TON_POOL_PAIR[0]),
    // stakeAmount: toNano('10'), // Optional: specify amount, otherwise uses max available
  };

  console.log('\n=== Staking Configuration ===');
  console.log(`Owner Wallet Address:       ${formatter.address(ownerWallet.address)}`);
  console.log(`Vesting Contract Address:   ${formatter.address(Address.parse(contractAddress))}`);
  console.log(`Staking Pool Address:       ${formatter.address(config.stakingPoolAddress)}`);
  console.log(`Required Fees:              ${Number(STAKING_FEES.TOTAL) / 1e9} TON`);
  console.log('\n=== Using TEXT COMMAND Mode ===');
  console.log('📞 Internal Message: Owner Wallet → Vesting Contract → Staking Pool');
  console.log('🔤 Message Format: Text Command "Deposit"');
  console.log('🔐 Access Control: Vesting contract validates sender == owner_address');
  console.log('========================================');

  try {
    const vestingContract = new VestingContract(client, contractAddress, ownerWallet);

    // Load and validate contract state
    const contractState = await vestingContract.getAllContractData();
    await vestingContract.logContractState(contractState);

    // Validate that owner wallet matches vesting contract owner
    await validateOwnershipMatch(vestingContract, ownerWallet.address);

    // Perform security validations
    await validateStakingPreconditions(vestingContract, config, contractState);

    // Calculate and validate stake amount
    const stakeAmount = calculateStakeAmount(config, contractState);
    logStakingDetails(contractState, stakeAmount);

    // Execute staking transaction via internal message using text commands
    await executeStakingViaTextCommand(
      client,
      ownerWallet,
      keyPair,
      Address.parse(contractAddress),
      config.stakingPoolAddress,
      stakeAmount
    );

    // Monitor and report results
    await monitorStakingResult(vestingContract, contractState.balance);
  } catch (error) {
    console.error('❌ Staking failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Validates that the owner wallet matches the vesting contract owner
 */
async function validateOwnershipMatch(
  vestingContract: VestingContract,
  walletAddress: Address
): Promise<void> {
  const vestingData = await vestingContract.getAllContractData();
  const contractOwnerAddress = vestingData.ownerAddress;

  if (!walletAddress.equals(contractOwnerAddress)) {
    throw new Error(
      `ACCESS DENIED: Wallet address (${formatter.address(walletAddress)}) ` +
        `does not match vesting contract owner (${formatter.address(contractOwnerAddress)})`
    );
  }
  console.log('✓ Owner wallet matches vesting contract owner');
}

/**
 * Validates all preconditions required for safe staking
 */
async function validateStakingPreconditions(
  vestingContract: VestingContract,
  config: StakingConfig,
  contractState: ContractState
): Promise<void> {
  // SECURITY CHECK: Verify staking pool is whitelisted
  const isWhitelisted = await vestingContract.isWhitelisted(config.stakingPoolAddress);
  if (!isWhitelisted) {
    throw new Error(
      'SECURITY ERROR: Staking pool address is not whitelisted. ' +
        'Add it to whitelist first using the vesting sender address.'
    );
  }
  console.log('✓ Staking pool address is whitelisted');

  // Validate sufficient balance
  const minRequiredBalance = STAKING_FEES.TOTAL + SAFETY_MARGIN + toNano('1'); // 1 TON min stake
  if (contractState.balance < minRequiredBalance) {
    throw new Error(
      `Insufficient balance. Required: ${Number(minRequiredBalance) / 1e9} TON, ` +
        `Available: ${Number(contractState.balance) / 1e9} TON`
    );
  }
  console.log('✓ Sufficient balance available');
}

/**
 * Calculates the optimal stake amount based on configuration and contract state
 */
function calculateStakeAmount(config: StakingConfig, contractState: ContractState): bigint {
  const maxAvailable = contractState.balance - SAFETY_MARGIN - STAKING_FEES.TOTAL;

  // Use specified amount or max available
  const requestedAmount = config.stakeAmount ?? maxAvailable;
  const stakeAmount = requestedAmount > maxAvailable ? maxAvailable : requestedAmount;

  // Validate minimum stake requirement (1 TON as per contract)
  const minimumStake = toNano('1');
  if (stakeAmount < minimumStake) {
    throw new Error(
      `Stake amount (${Number(stakeAmount) / 1e9} TON) below minimum required ` +
        `(${Number(minimumStake) / 1e9} TON)`
    );
  }

  return stakeAmount;
}

/**
 * Logs detailed staking information
 */
function logStakingDetails(contractState: ContractState, stakeAmount: bigint): void {
  console.log('\n=== Staking Details ===');
  console.log(`Total Balance:              ${Number(contractState.balance) / 1e9} TON`);
  console.log(`Locked Amount:              ${Number(contractState.lockedAmount) / 1e9} TON`);
  console.log(
    `Available (Whitelisted):    ${Number(contractState.balance - SAFETY_MARGIN - STAKING_FEES.TOTAL) / 1e9} TON`
  );
  console.log(`Stake Amount:               ${Number(stakeAmount) / 1e9} TON`);
  console.log('\n💡 Note: Whitelisted addresses can stake locked + vested tokens');
  console.log('========================================');
}

/**
 * Creates the proper TEXT COMMAND message body for staking pool deposit
 *
 * Based on the staking pool contract parse_text_command function:
 *
 * if( first_char == 68 ) { ;; D
 *     throw_unless(error::unknown_text_command(), in_msg~load_uint(48) == 111533580577140); ;; eposit
 *     in_msg.end_parse();
 *     op = op::stake_deposit();
 * }
 */
function createTextCommandMessageBody(): any {
  console.log('🔤 Creating text command message body:');
  console.log(`   - Command Op:        ${TEXT_COMMAND_OP} (text command indicator)`);
  console.log(`   - First Char 'D':    ${DEPOSIT_FIRST_CHAR} (uint8)`);
  console.log(`   - Remaining 'eposit': ${DEPOSIT_REMAINING} (uint48)`);

  return beginCell()
    .storeUint(TEXT_COMMAND_OP, 32) // 0 = text command
    .storeUint(DEPOSIT_FIRST_CHAR, 8) // 'D' = 68
    .storeUint(DEPOSIT_REMAINING, 48) // 'eposit' = 111533580577140
    .endCell();
}

/**
 * Executes the staking transaction via internal message using TEXT COMMAND
 */
async function executeStakingViaTextCommand(
  client: TonClient,
  ownerWallet: any,
  keyPair: KeyPair,
  vestingContractAddress: Address,
  stakingPoolAddress: Address,
  stakeAmount: bigint
): Promise<void> {
  console.log('📤 Sending internal message to vesting contract using TEXT COMMAND...');

  const queryId = BigInt(Date.now());

  // Create text command message body for "Deposit"
  const stakingMessageBody = createTextCommandMessageBody();

  // Calculate total value: stake amount + receipt fee + deposit fee
  const totalStakingValue = stakeAmount + STAKING_FEES.RECEIPT_FEE + STAKING_FEES.DEPOSIT_FEE;

  // Build message to staking pool with proper flags for whitelisted address
  const stakingMessage = beginCell()
    .storeUint(0x18, 6) // Bounceable internal message (required for whitelisted addresses)
    .storeAddress(stakingPoolAddress) // Destination: staking pool
    .storeCoins(totalStakingValue) // Value: stake amount + fees
    .storeUint(0, 1 + 4 + 4 + 64 + 32 + 1) // Technical flags
    .storeUint(1, 1) // Has body reference
    .storeRef(stakingMessageBody) // Text command message body
    .endCell();

  // Build internal message body for vesting contract
  const vestingMessageBody = beginCell()
    .storeUint(OP_SEND, 32) // op::send - tells vesting contract to execute send_message()
    .storeUint(queryId, 64) // Query ID for tracking
    .storeUint(SEND_MODE_IGNORE_ERRORS_PAY_FEES_SEPARATELY, 8) // Send mode (must be 3)
    .storeRef(stakingMessage) // Message to forward to staking pool
    .endCell();

  try {
    const walletContract = client.open(ownerWallet);
    const seqno = await walletContract.getSeqno();

    const vestingMessage = internal({
      to: vestingContractAddress,
      value: totalStakingValue + STAKING_FEES.VESTING_OP_FEE, // Include vesting operation fee
      body: vestingMessageBody,
    });

    await walletContract.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [vestingMessage],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    });

    console.log('✅ Text command message sent to vesting contract');
    console.log(`🔍 Query ID: ${queryId}`);
    console.log(
      `💰 Total Value: ${Number(totalStakingValue + STAKING_FEES.VESTING_OP_FEE) / 1e9} TON`
    );
    console.log(`📊 Breakdown:`);
    console.log(`   - Stake Amount: ${Number(stakeAmount) / 1e9} TON`);
    console.log(`   - Receipt Fee:  ${Number(STAKING_FEES.RECEIPT_FEE) / 1e9} TON`);
    console.log(`   - Deposit Fee:  ${Number(STAKING_FEES.DEPOSIT_FEE) / 1e9} TON`);
    console.log(`   - Vesting Fee:  ${Number(STAKING_FEES.VESTING_OP_FEE) / 1e9} TON`);
    console.log('📋 Flow: Owner Wallet → Vesting Contract → Staking Pool');
    console.log('🔤 Command: "Deposit" (text mode)');
  } catch (error) {
    throw new Error(`Failed to send text command message: ${error}`);
  }
}

/**
 * Monitors the staking result by watching for balance changes
 */
async function monitorStakingResult(
  vestingContract: VestingContract,
  initialBalance: bigint
): Promise<void> {
  console.log('⏳ Monitoring transaction result...');

  const [isSuccess, newBalance] = await vestingContract.waitForBalanceChange(initialBalance);

  if (isSuccess) {
    const stakedAmount = initialBalance - newBalance;
    console.log('\n🎉 Staking successful!');
    console.log(`💰 Total Sent:              ${Number(stakedAmount) / 1e9} TON`);
    console.log(`📊 New Contract Balance:    ${Number(newBalance) / 1e9} TON`);
    console.log('\n💡 Your locked tokens are now earning staking rewards!');
    console.log('🔤 Text command "Deposit" was processed successfully');
  } else {
    console.error(
      '\n⚠️  Staking may have failed or is still processing. ' +
        'Please check the contract balance manually.'
    );
  }
}

main().catch(error => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
});
