import { Address, toNano, beginCell } from '@ton/core';
import { TonClient, internal, SendMode } from '@ton/ton';
import { getWallet } from './getWallet';
import { KeyPair } from '@ton/crypto';

export class VestingContract {
  private client: TonClient;
  private address: Address;

  constructor(client: TonClient, contractAddress: string) {
    this.client = client;
    this.address = Address.parse(contractAddress);
  }

  async getContractState() {
    const contractState = await this.client.getContractState(this.address);
    if (!contractState.state || Number(contractState.balance) <= 0) {
      throw new Error('Error: Contract has no balance to withdraw');
    }

    return contractState;
  }

  async getVestingData() {
    const vestingDataResult = await this.client.runMethod(this.address, 'get_vesting_data');
    const stack = vestingDataResult.stack;

    return {
      vestingStartTime: stack.readNumber(),
      vestingTotalDuration: stack.readNumber(),
      unlockPeriod: stack.readNumber(),
      cliffDuration: stack.readNumber(),
      vestingTotalAmount: stack.readBigNumber(),
      vestingSenderAddress: stack.readAddress(),
      ownerAddress: stack.readAddress(),
    };
  }

  async getLockedAmount(timestamp: number) {
    const lockedAmountResult = await this.client.runMethod(this.address, 'get_locked_amount', [
      { type: 'int', value: BigInt(timestamp) },
    ]);

    return lockedAmountResult.stack.readBigNumber();
  }

  async extractFunds(keyPair: KeyPair, walletAddress: Address, withdrawAmount: bigint) {
    const wallet = getWallet({ keyPair, subwalletNumber: 0 });
    const walletContract = this.client.open(wallet);
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

    // Send with more value to ensure enough for processing
    const vestingMessage = internal({
      to: this.address,
      value: toNano('0.1'), // 0.1 TON should be enough to cover all fees
      body: extractBody,
    });

    // Send the transaction
    await walletContract.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [vestingMessage],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    });

    return seqno + 1;
  }

  async waitForBalanceChange(
    initialBalance: bigint,
    maxAttempts = 10,
    initialDelay = 3000
  ): Promise<[boolean, bigint]> {
    let attempts = 0;
    let delay = initialDelay;

    // Sleep function to wait
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    while (attempts < maxAttempts) {
      try {
        // Wait before checking
        await sleep(delay);
        attempts++;

        const state = await this.getContractState();
        const currentBalance = BigInt(state.balance);

        // If balance changed, we're done
        if (currentBalance !== initialBalance) {
          return [true, currentBalance];
        }

        // Exponential backoff with cap
        delay = Math.min(delay * 1.5, 10000); // Cap at 10 seconds
      } catch (error) {
        console.log(`Error checking contract state on attempt ${attempts}: ${error}`);
      }
    }

    // We've exhausted retries, return the last known balance
    try {
      const finalState = await this.getContractState();
      return [false, BigInt(finalState.balance)];
    } catch (error) {
      return [false, initialBalance]; // Return original balance if we can't get the current one
    }
  }
}
