import { Address, beginCell } from '@ton/core';
import { TonClient, internal, SendMode, WalletContractV5R1 } from '@ton/ton';
import { KeyPair } from '@ton/crypto';
import { formatter } from './formatter';
import { SAFETY_MARGIN } from './constants';
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
}

export class VestingContract {
  private client: TonClient;
  private address: Address;
  private wallet: WalletContractV5R1;

  constructor(client: TonClient, contractAddress: string, wallet: WalletContractV5R1) {
    this.client = client;
    this.address = Address.parse(contractAddress);
    this.wallet = wallet;
  }

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
    };
  }

  async extractFunds(keyPair: KeyPair, walletAddress: Address, withdrawAmount: bigint) {
    const contractState = await this.getAllContractData();

    console.log(
      `Withdrawing ${Number(withdrawAmount) / 1e9} TON from ${formatter.address(this.address)} to ${formatter.address(walletAddress)}`
    );

    // 1. Authorization check
    const isOwner = this.wallet.address.toString() === contractState.ownerAddress.toString();
    const isVestingSender =
      this.wallet.address.toString() === contractState.vestingSenderAddress.toString();
    const isWhitelisted = await this.isWhitelisted(walletAddress);

    if (!isOwner) {
      throw new Error('Error: Only the owner can initiate a withdrawal');
    }

    // 2. Balance sufficiency check with fee consideration
    const txFee = SAFETY_MARGIN; // Estimated transaction fee
    if (withdrawAmount + txFee > contractState.balance) {
      throw new Error(
        `Error: Requested amount (${Number(withdrawAmount) / 1e9} TON) plus fees exceeds contract balance (${Number(contractState.balance) / 1e9} TON)`
      );
    }

    // 3. Locked amount check for owner
    const lockedAmount = contractState.lockedAmount;
    if (isOwner && !isVestingSender && withdrawAmount > contractState.balance - lockedAmount) {
      throw new Error(
        `Error: Owner can only withdraw unlocked funds. Maximum available: ${Number(contractState.balance - lockedAmount) / 1e9} TON`
      );
    }

    // 4. Valid destination address check
    const isToVestingSender =
      walletAddress.toString() === contractState.vestingSenderAddress.toString();
    const isToOwner = walletAddress.toString() === contractState.ownerAddress.toString();
    if (!isToVestingSender && !isToOwner && !isWhitelisted) {
      throw new Error('Error: Invalid destination address');
    }

    const walletContract = this.client.open(this.wallet);
    const seqno = await walletContract.getSeqno();

    // Create the transfer message with exact amount
    const transferMessage = beginCell()
      .storeUint(0x18, 6) // bounceable address flag
      .storeAddress(walletAddress) // destination = wallet address
      .storeCoins(withdrawAmount) // value = exact amount to withdraw
      .storeUint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1) // default message header
      .storeUint(0, 32) // empty op for simple transfer
      .endCell();

    // According to contract, we MUST use SEND_MODE_IGNORE_ERRORS(2) + SEND_MODE_PAY_FEES_SEPARETELY(1) = 3
    const extractBody = beginCell()
      .storeUint(0xa7733acd, 32) // op::send opcode
      .storeUint(0, 64) // query_id
      .storeUint(1 + 2, 8) // send_mode = SEND_MODE_PAY_FEES_SEPARATELY + SEND_MODE_IGNORE_ERRORS = 3
      .storeRef(transferMessage) // message reference
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

  async waitForBalanceChange(
    initialBalance: bigint,
    maxAttempts = 10,
    initialDelay = 3000
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
          return [true, currentBalance];
        }

        delay = Math.min(delay * 1.5, 10000);
      } catch (error) {
        console.log(`Error checking contract state on attempt ${attempts}: ${error}`);
      }
    }

    try {
      const finalState = await this.getAllContractData();
      return [false, finalState.balance];
    } catch (error) {
      return [false, initialBalance];
    }
  }

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

      console.log(`\n========================================\n`);
    } catch (error) {
      console.error('Error logging contract state:', error);
    }
  }
}
