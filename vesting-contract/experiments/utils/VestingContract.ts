import { Address, beginCell } from '@ton/core';
import { TonClient, internal, SendMode, WalletContractV5R1 } from '@ton/ton';
import { KeyPair } from '@ton/crypto';
import { formatter } from './formatter';
import { SAFETY_MARGIN } from './constants';
import {
  STAKING_OPS,
  SEND_MODES,
  STAKING_FEES,
  MESSAGE_FLAGS,
  VALIDATION_SETTINGS,
} from './StakingConstants';

export interface VestingContractState {
  balance: bigint;
  state: string;
  vestingStartTime: number;
  vestingTotalDuration: number;
  unlockPeriod: number;
  cliffDuration: number;
  vestingTotalAmount: bigint;
  vestingSenderAddress: Address;
  ownerAddress: Address;
  lockedAmount: bigint;
  currentTime: number;
  whitelistedAddresses: Address[];
}

/**
 * Enhanced VestingContract class with staking capabilities
 *
 * This class provides comprehensive functionality for:
 * - Basic vesting contract operations (withdraw, whitelist management)
 * - Staking operations via whitelisted pools
 * - Text command and binary operation support
 * - Transaction monitoring and validation
 */
export class VestingContract {
  private client: TonClient;
  private address: Address;
  private wallet: WalletContractV5R1;

  constructor(client: TonClient, contractAddress: string, wallet: WalletContractV5R1) {
    this.client = client;
    this.address = Address.parse(contractAddress);
    this.wallet = wallet;
  }

  /**
   * Retrieves comprehensive contract state including vesting parameters and balances
   */
  async getAllContractData(): Promise<VestingContractState> {
    const contractState = await this.client.getContractState(this.address);
    if (!contractState.state || Number(contractState.balance) <= 0) {
      throw new Error('Error: Contract has no balance to withdraw');
    }

    const vestingDataResult = await this.client.runMethod(this.address, 'get_vesting_data');
    const stack = vestingDataResult.stack;

    const vestingStartTime = stack.readNumber();
    const vestingTotalDuration = stack.readNumber();
    const unlockPeriod = stack.readNumber();
    const cliffDuration = stack.readNumber();
    const vestingTotalAmount = stack.readBigNumber();
    const vestingSenderAddress = stack.readAddress();
    const ownerAddress = stack.readAddress();

    const currentTime = Math.floor(Date.now() / 1000);
    const lockedAmountResult = await this.client.runMethod(this.address, 'get_locked_amount', [
      { type: 'int', value: BigInt(currentTime) },
    ]);
    const lockedAmount = lockedAmountResult.stack.readBigNumber();

    const whitelistedAddresses = await this.getWhitelistedAddresses();

    return {
      balance: BigInt(contractState.balance),
      state: contractState.state,
      vestingStartTime,
      vestingTotalDuration,
      unlockPeriod,
      cliffDuration,
      vestingTotalAmount,
      vestingSenderAddress,
      ownerAddress,
      lockedAmount,
      currentTime,
      whitelistedAddresses,
    };
  }

  /**
   * Stakes tokens to a whitelisted staking pool using text command format
   *
   * Obs: Vesting contract doesn't allow the op_code for staking, so we have to use text command. See: https://github.com/ChorusOne/ton-pool-contracts/blob/fa98fb53556bad6f03db2adf84476a16502de6bf/vesting.fc#L241
   *
   * @param keyPair - Key pair for signing the transaction
   * @param stakingPoolAddress - Address of the whitelisted staking pool
   * @param stakeAmount - Amount to stake in nanoTON
   * @param queryId - Optional query ID for tracking (default: current timestamp)
   * @returns Transaction sequence number
   *
   * @throws Error if validation fails or transaction cannot be sent
   */
  async stakeToPool(
    keyPair: KeyPair,
    stakingPoolAddress: Address,
    stakeAmount: bigint,
    queryId?: bigint
  ): Promise<number> {
    // Validate preconditions
    await this.validateStakingPreconditions(stakingPoolAddress, stakeAmount);

    const actualQueryId = queryId ?? BigInt(Date.now());

    console.log(
      `🎯 Staking ${Number(stakeAmount) / 1e9} TON to pool ${formatter.address(stakingPoolAddress)}`
    );

    // Create text command message body for "Deposit"
    const stakingMessageBody = beginCell()
      .storeUint(STAKING_OPS.TEXT_COMMAND, 32) // 0 = text command
      .storeUint(STAKING_OPS.DEPOSIT_FIRST_CHAR, 8) // 'D' = 68
      .storeUint(STAKING_OPS.DEPOSIT_REMAINING, 48) // 'eposit' = 111533580577140
      .endCell();

    // Calculate total value needed (stake + fees)
    const totalStakingValue = stakeAmount + STAKING_FEES.RECEIPT_FEE + STAKING_FEES.DEPOSIT_FEE;

    // Build message to staking pool
    const stakingMessage = beginCell()
      .storeUint(MESSAGE_FLAGS.BOUNCEABLE, 6) // Bounceable required for whitelisted addresses
      .storeAddress(stakingPoolAddress)
      .storeCoins(totalStakingValue)
      .storeUint(0, 1 + 4 + 4 + 64 + 32 + 1) // Standard message flags
      .storeUint(1, 1) // Has body reference
      .storeRef(stakingMessageBody)
      .endCell();

    // Build vesting contract message
    const vestingMessageBody = beginCell()
      .storeUint(STAKING_OPS.SEND, 32) // op::send
      .storeUint(actualQueryId, 64)
      .storeUint(SEND_MODES.IGNORE_ERRORS_PAY_FEES_SEPARATELY, 8) // Required mode = 3
      .storeRef(stakingMessage)
      .endCell();

    // Send transaction
    const walletContract = this.client.open(this.wallet);
    const seqno = await walletContract.getSeqno();

    const vestingMessage = internal({
      to: this.address,
      value: totalStakingValue + STAKING_FEES.VESTING_OP_FEE,
      body: vestingMessageBody,
    });

    await walletContract.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [vestingMessage],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    });

    console.log(`✅ Staking transaction sent with query ID: ${actualQueryId}`);
    console.log(
      `📊 Total value: ${Number(totalStakingValue + STAKING_FEES.VESTING_OP_FEE) / 1e9} TON`
    );

    return seqno + 1;
  }

  /**
   * Unstakes tokens from a whitelisted staking pool using text command format
   *
   * @param keyPair - Key pair for signing the transaction
   * @param stakingPoolAddress - Address of the whitelisted staking pool
   * @param unstakeAmount - Amount to unstake in nanoTON (0 = withdraw all)
   * @param queryId - Optional query ID for tracking (default: current timestamp)
   * @returns Transaction sequence number
   *
   * @throws Error if validation fails or transaction cannot be sent
   */
  async unstakeFromPool(
    keyPair: KeyPair,
    stakingPoolAddress: Address,
    unstakeAmount: bigint = 0n,
    queryId?: bigint
  ): Promise<number> {
    // Validate preconditions
    await this.validateUnstakingPreconditions(stakingPoolAddress, unstakeAmount);

    const actualQueryId = queryId ?? BigInt(Date.now());

    console.log(
      `🎯 Unstaking ${unstakeAmount === 0n ? 'ALL' : `${Number(unstakeAmount) / 1e9} TON`} from pool ${formatter.address(stakingPoolAddress)}`
    );

    // Create text command message body for "Withdraw"
    const unstakingMessageBody = beginCell()
      .storeUint(STAKING_OPS.TEXT_COMMAND, 32) // 0 = text command
      .storeUint(STAKING_OPS.WITHDRAW_FIRST_CHAR, 8) // 'W' = 87
      .storeUint(STAKING_OPS.WITHDRAW_REMAINING, 56) // 'ithdraw' = 29682864265257335
      .endCell();

    // Calculate total value needed (fees only, no unstake amount needed)
    const totalUnstakingValue = STAKING_FEES.RECEIPT_FEE + STAKING_FEES.WITHDRAW_FEE;

    // Build message to staking pool
    const unstakingMessage = beginCell()
      .storeUint(MESSAGE_FLAGS.BOUNCEABLE, 6) // Bounceable required for whitelisted addresses
      .storeAddress(stakingPoolAddress)
      .storeCoins(totalUnstakingValue)
      .storeUint(0, 1 + 4 + 4 + 64 + 32 + 1) // Standard message flags
      .storeUint(1, 1) // Has body reference
      .storeRef(unstakingMessageBody)
      .endCell();

    // Build vesting contract message
    const vestingMessageBody = beginCell()
      .storeUint(STAKING_OPS.SEND, 32) // op::send
      .storeUint(actualQueryId, 64)
      .storeUint(SEND_MODES.IGNORE_ERRORS_PAY_FEES_SEPARATELY, 8) // Required mode = 3
      .storeRef(unstakingMessage)
      .endCell();

    // Send transaction
    const walletContract = this.client.open(this.wallet);
    const seqno = await walletContract.getSeqno();

    const vestingMessage = internal({
      to: this.address,
      value: totalUnstakingValue + STAKING_FEES.VESTING_OP_FEE,
      body: vestingMessageBody,
    });

    await walletContract.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [vestingMessage],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    });

    console.log(`✅ Unstaking transaction sent with query ID: ${actualQueryId}`);
    console.log(
      `📊 Total value: ${Number(totalUnstakingValue + STAKING_FEES.VESTING_OP_FEE) / 1e9} TON`
    );

    return seqno + 1;
  }

  /**
   * Validates all preconditions for staking operations
   *
   * @private
   * @param stakingPoolAddress - Target staking pool address
   * @param stakeAmount - Amount to stake
   * @throws Error if any validation fails
   */
  private async validateStakingPreconditions(
    stakingPoolAddress: Address,
    stakeAmount: bigint
  ): Promise<void> {
    const contractState = await this.getAllContractData();

    // 1. Owner authorization check
    const isOwner = this.wallet.address.toString() === contractState.ownerAddress.toString();
    if (!isOwner) {
      throw new Error(
        `Access denied: Wallet address (${this.wallet.address.toString()}) ` +
          `does not match vesting contract owner (${contractState.ownerAddress.toString()})`
      );
    }

    // 2. Validate stake amount
    if (stakeAmount <= 0n) {
      throw new Error('Stake amount must be greater than 0');
    }

    // 3. Validate minimum stake (1 TON minimum)
    if (stakeAmount < 1_000_000_000n) {
      throw new Error(
        `Stake amount (${Number(stakeAmount) / 1e9} TON) below minimum required (1 TON)`
      );
    }

    // 4. Validate staking pool address
    if (!stakingPoolAddress) {
      throw new Error('Staking pool address is required');
    }

    // 5. Check if pool is whitelisted
    const isWhitelisted = await this.isWhitelisted(stakingPoolAddress);
    if (!isWhitelisted) {
      throw new Error(
        'Security error: Staking pool address is not whitelisted. ' +
          'Add it to the whitelist first using the vesting sender address.'
      );
    }

    // 6. Check sufficient balance for stake + fees
    const totalRequired = stakeAmount + STAKING_FEES.TOTAL + SAFETY_MARGIN;
    if (contractState.balance < totalRequired) {
      throw new Error(
        `Insufficient balance. Required: ${Number(totalRequired) / 1e9} TON, ` +
          `Available: ${Number(contractState.balance) / 1e9} TON`
      );
    }

    // 7. Warn about locked tokens usage (but allow it for whitelisted pools)
    if (contractState.lockedAmount > 0) {
      const availableUnlocked = contractState.balance - contractState.lockedAmount;
      if (stakeAmount > availableUnlocked) {
        const lockedInStake = stakeAmount - availableUnlocked;
        console.log(
          `⚠️ Using ${Number(lockedInStake) / 1e9} TON of locked tokens ` +
            '(allowed for whitelisted staking pools)'
        );
      }
    }

    console.log('✅ All staking validations passed');
  }

  /**
   * Validates all preconditions for unstaking operations
   *
   * @private
   * @param stakingPoolAddress - Target staking pool address
   * @param unstakeAmount - Amount to unstake (0 = withdraw all)
   * @throws Error if any validation fails
   */
  private async validateUnstakingPreconditions(
    stakingPoolAddress: Address,
    unstakeAmount: bigint
  ): Promise<void> {
    const contractState = await this.getAllContractData();

    // 1. Owner authorization check
    const isOwner = this.wallet.address.toString() === contractState.ownerAddress.toString();
    if (!isOwner) {
      throw new Error(
        `Access denied: Wallet address (${this.wallet.address.toString()}) ` +
          `does not match vesting contract owner (${contractState.ownerAddress.toString()})`
      );
    }

    // 2. Validate unstake amount
    if (unstakeAmount < 0n) {
      throw new Error('Unstake amount cannot be negative');
    }

    // 3. Validate staking pool address
    if (!stakingPoolAddress) {
      throw new Error('Staking pool address is required');
    }

    // 4. Check if pool is whitelisted
    const isWhitelisted = await this.isWhitelisted(stakingPoolAddress);
    if (!isWhitelisted) {
      throw new Error(
        'Security error: Staking pool address is not whitelisted. ' +
          'Cannot unstake from non-whitelisted pools.'
      );
    }

    // 5. Check sufficient balance for unstaking fees
    const totalRequired = STAKING_FEES.WITHDRAW_TOTAL + SAFETY_MARGIN;
    if (contractState.balance < totalRequired) {
      throw new Error(
        `Insufficient balance for unstaking fees. Required: ${Number(totalRequired) / 1e9} TON, ` +
          `Available: ${Number(contractState.balance) / 1e9} TON`
      );
    }

    // 6. Log unstake amount info
    if (unstakeAmount === 0n) {
      console.log('💰 Unstaking ALL tokens from the pool');
    } else {
      console.log(`💰 Unstaking ${Number(unstakeAmount) / 1e9} TON from the pool`);
    }

    console.log('✅ All unstaking validations passed');
  }

  /**
   * Monitors staking transaction by waiting for balance change
   *
   * @param initialBalance - Balance before the transaction
   * @param maxAttempts - Maximum number of attempts to check
   * @param initialDelay - Initial delay between checks in milliseconds
   * @returns Promise resolving to [success, newBalance]
   */
  async waitForStakingResult(
    initialBalance: bigint,
    maxAttempts: number = VALIDATION_SETTINGS.MAX_WAIT_ATTEMPTS,
    initialDelay: number = VALIDATION_SETTINGS.INITIAL_DELAY_MS
  ): Promise<[boolean, bigint]> {
    let attempts = 0;
    let delay = initialDelay;

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    while (attempts < maxAttempts) {
      try {
        await sleep(delay);
        attempts++;

        const state = await this.getAllContractData();
        const currentBalance = state.balance;

        if (currentBalance !== initialBalance) {
          const difference = initialBalance - currentBalance;
          console.log(`🎉 Balance changed! Difference: ${Number(difference) / 1e9} TON`);
          return [true, currentBalance];
        }

        delay = Math.min(
          delay * VALIDATION_SETTINGS.BACKOFF_MULTIPLIER,
          VALIDATION_SETTINGS.MAX_DELAY_MS
        );
        console.log(`⏳ Attempt ${attempts}/${maxAttempts} - No balance change yet...`);
      } catch (error) {
        console.log(`⚠️ Error checking balance on attempt ${attempts}: ${error}`);
      }
    }

    try {
      const finalState = await this.getAllContractData();
      return [false, finalState.balance];
    } catch (error) {
      console.log('❌ Failed to get final balance');
      return [false, initialBalance];
    }
  }

  /**
   * Monitors unstaking transaction by waiting for balance increase
   *
   * @param initialBalance - Balance before the unstaking transaction
   * @param maxAttempts - Maximum number of attempts to check
   * @param initialDelay - Initial delay between checks in milliseconds
   * @returns Promise resolving to [success, newBalance, receivedAmount]
   */
  async waitForUnstakingResult(
    initialBalance: bigint,
    maxAttempts: number = VALIDATION_SETTINGS.MAX_WAIT_ATTEMPTS,
    initialDelay: number = VALIDATION_SETTINGS.INITIAL_DELAY_MS
  ): Promise<[boolean, bigint, bigint]> {
    let attempts = 0;
    let delay = initialDelay;

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    while (attempts < maxAttempts) {
      try {
        await sleep(delay);
        attempts++;

        const state = await this.getAllContractData();
        const currentBalance = state.balance;

        if (currentBalance !== initialBalance) {
          const difference = currentBalance - initialBalance;
          if (difference > 0) {
            console.log(`🎉 Unstaking successful! Received: ${Number(difference) / 1e9} TON`);
            return [true, currentBalance, difference];
          } else {
            console.log(`⚠️ Balance decreased by ${Number(-difference) / 1e9} TON (fees paid)`);
            return [false, currentBalance, 0n];
          }
        }

        delay = Math.min(
          delay * VALIDATION_SETTINGS.BACKOFF_MULTIPLIER,
          VALIDATION_SETTINGS.MAX_DELAY_MS
        );
        console.log(`⏳ Attempt ${attempts}/${maxAttempts} - No balance change yet...`);
      } catch (error) {
        console.log(`⚠️ Error checking balance on attempt ${attempts}: ${error}`);
      }
    }

    try {
      const finalState = await this.getAllContractData();
      const difference = finalState.balance - initialBalance;
      return [false, finalState.balance, difference > 0 ? difference : 0n];
    } catch (error) {
      console.log('❌ Failed to get final balance');
      return [false, initialBalance, 0n];
    }
  }

  // ============================================================================
  // Existing methods (unchanged but with improved comments)
  // ============================================================================

  /**
   * Extracts funds from the vesting contract to a specified address
   *
   * @param keyPair - Key pair for signing the transaction
   * @param walletAddress - Destination address for the funds
   * @param withdrawAmount - Amount to withdraw in nanoTON
   * @returns New sequence number
   */
  async extractFunds(
    keyPair: KeyPair,
    walletAddress: Address,
    withdrawAmount: bigint
  ): Promise<number> {
    const contractState = await this.getAllContractData();

    console.log(
      `Withdrawing ${Number(withdrawAmount) / 1e9} TON from ${formatter.address(this.address)} to ${formatter.address(walletAddress)}`
    );

    // Authorization and validation checks
    const isOwner = this.wallet.address.toString() === contractState.ownerAddress.toString();
    const isVestingSender =
      this.wallet.address.toString() === contractState.vestingSenderAddress.toString();
    const isWhitelisted = await this.isWhitelisted(walletAddress);

    if (!isOwner) {
      throw new Error('Error: Only the owner can initiate a withdrawal');
    }

    const txFee = SAFETY_MARGIN;
    if (withdrawAmount + txFee > contractState.balance) {
      throw new Error(
        `Error: Requested amount (${Number(withdrawAmount) / 1e9} TON) plus fees exceeds contract balance (${Number(contractState.balance) / 1e9} TON)`
      );
    }

    const lockedAmount = contractState.lockedAmount;
    if (isOwner && !isVestingSender && withdrawAmount > contractState.balance - lockedAmount) {
      throw new Error(
        `Error: Owner can only withdraw unlocked funds. Maximum available: ${Number(contractState.balance - lockedAmount) / 1e9} TON`
      );
    }

    const isToVestingSender =
      walletAddress.toString() === contractState.vestingSenderAddress.toString();
    const isToOwner = walletAddress.toString() === contractState.ownerAddress.toString();
    if (!isToVestingSender && !isToOwner && !isWhitelisted) {
      throw new Error('Error: Invalid destination address');
    }

    const walletContract = this.client.open(this.wallet);
    const seqno = await walletContract.getSeqno();

    const transferMessage = beginCell()
      .storeUint(0x18, 6)
      .storeAddress(walletAddress)
      .storeCoins(withdrawAmount)
      .storeUint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
      .storeUint(0, 32)
      .endCell();

    const extractBody = beginCell()
      .storeUint(STAKING_OPS.SEND, 32) // Using constant
      .storeUint(0, 64)
      .storeUint(SEND_MODES.IGNORE_ERRORS_PAY_FEES_SEPARATELY, 8) // Using constant
      .storeRef(transferMessage)
      .endCell();

    const vestingMessage = internal({
      to: this.address,
      value: txFee,
      body: extractBody,
    });

    await walletContract.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [vestingMessage],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    });

    return seqno + 1;
  }

  /**
   * Adds addresses to the contract's whitelist (only vesting sender can do this)
   */
  async addWhitelistedAddresses(keyPair: KeyPair, addresses: Address[]): Promise<number> {
    const contractState = await this.getAllContractData();

    const isVestingSender =
      this.wallet.address.toString() === contractState.vestingSenderAddress.toString();

    if (!isVestingSender) {
      throw new Error('Only the vesting sender can add addresses to the whitelist');
    }

    if (addresses.length === 0) {
      throw new Error('No addresses provided to whitelist');
    }

    console.log(`Adding ${addresses.length} address(es) to the whitelist`);
    addresses.forEach(addr => {
      console.log(`- ${formatter.address(addr)}`);
    });

    let body = beginCell()
      .storeUint(0x7258a69b, 32) // op::add_whitelist
      .storeUint(0, 64)
      .storeAddress(addresses[0]);

    if (addresses.length > 1) {
      let currentCell = beginCell();
      for (let i = 1; i < addresses.length; i++) {
        currentCell = currentCell.storeAddress(addresses[i]);
      }
      body = body.storeRef(currentCell.asCell());
    }

    const walletContract = this.client.open(this.wallet);
    const seqno = await walletContract.getSeqno();

    const whitelistMessage = internal({
      to: this.address,
      value: SAFETY_MARGIN,
      body: body.endCell(),
    });

    await walletContract.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [whitelistMessage],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    });

    return seqno + 1;
  }

  /**
   * Checks if an address is whitelisted
   */
  async isWhitelisted(address: Address): Promise<boolean> {
    try {
      const result = await this.client.runMethod(this.address, 'is_whitelisted', [
        { type: 'slice', cell: beginCell().storeAddress(address).endCell() },
      ]);
      return result.stack.readNumber() === -1;
    } catch (error) {
      console.error('Error checking whitelist status:', error);
      return false;
    }
  }

  /**
   * Waits for balance change with configurable retry logic
   */
  async waitForBalanceChange(
    initialBalance: bigint,
    maxAttempts = VALIDATION_SETTINGS.MAX_WAIT_ATTEMPTS,
    initialDelay = VALIDATION_SETTINGS.INITIAL_DELAY_MS
  ): Promise<[boolean, bigint]> {
    return this.waitForStakingResult(initialBalance, maxAttempts, initialDelay);
  }

  /**
   * Logs comprehensive contract state information
   */
  async logContractState(contractState: VestingContractState): Promise<void> {
    try {
      console.log('\n=== Vesting Contract State ===');
      console.log(`Address:       ${formatter.address(this.address)}`);
      console.log(`Owner Address: ${formatter.address(contractState.ownerAddress)}`);
      console.log(
        `Vesting Sender Address: ${formatter.address(contractState.vestingSenderAddress)}`
      );
      console.log(
        `Balance:       ${contractState.balance} nanoTON (${Number(contractState.balance) / 1e9} TON)`
      );

      console.log('\n=== Vesting Schedule Parameters ===');
      console.log(
        `Start Time:     ${new Date(contractState.vestingStartTime * 1000).toLocaleString()}`
      );
      console.log(`Total Duration: ${contractState.vestingTotalDuration / 60} minutes`);
      console.log(`Unlock Period:  ${contractState.unlockPeriod / 60} minutes`);
      console.log(`Cliff Duration: ${contractState.cliffDuration / 60} minutes`);

      console.log('\n=== Token Allocation ===');
      console.log(`Total Amount:      ${Number(contractState.vestingTotalAmount) / 1e9} TON`);
      console.log(`Locked Amount:     ${Number(contractState.lockedAmount) / 1e9} TON`);
      console.log(
        `Available Amount:  ${Number(contractState.vestingTotalAmount - contractState.lockedAmount) / 1e9} TON`
      );
      console.log(
        `Withdrawable:      ${Number(contractState.balance - contractState.lockedAmount) / 1e9} TON`
      );

      console.log('\n=== Whitelisted Addresses ===');
      if (contractState.whitelistedAddresses.length === 0) {
        console.log('No whitelisted addresses found');
      } else {
        contractState.whitelistedAddresses.forEach((address, index) => {
          console.log(`${index + 1}. ${formatter.address(address)}`);
        });
      }

      console.log(`\n========================================\n`);
    } catch (error) {
      console.error('Error logging contract state:', error);
    }
  }

  /**
   * Retrieves whitelisted addresses from the contract
   */
  async getWhitelistedAddresses(): Promise<Address[]> {
    try {
      const { stack } = await this.client.runMethod(this.address, 'get_whitelist');

      if (stack.remaining === 0) {
        return [];
      }

      const data = stack.readTuple();
      const addresses: Address[] = [];

      while (data.remaining > 0) {
        const item = data.pop();

        if (Array.isArray(item) && item.length === 2) {
          const [workchain, hash] = item;

          if (typeof workchain === 'bigint' && typeof hash === 'bigint') {
            const address = Address.parse(
              `${Number(workchain)}:${hash.toString(16).padStart(64, '0')}`
            );
            addresses.push(address);
          }
        }
      }

      return addresses;
    } catch {
      return [];
    }
  }

  /**
   * Gets the contract address
   */
  get contractAddress(): Address {
    return this.address;
  }

  /**
   * Gets the wallet instance
   */
  get walletInstance(): WalletContractV5R1 {
    return this.wallet;
  }
}
