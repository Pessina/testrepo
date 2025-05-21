import { Address, toNano } from '@ton/core';
import { TonClient } from '@ton/ton';
import { VestingContract } from './contract';
import { KeyPair } from '@ton/crypto';

export function calculateWithdrawableAmount(
  contractBalance: bigint,
  lockedAmount: bigint,
  safetyMargin: bigint = toNano('0.01'),
  mode: 'all' | 'vested' = 'all'
): bigint {
  if (mode === 'all') {
    return contractBalance > safetyMargin ? contractBalance - safetyMargin : 0n;
  } else {
    return contractBalance - lockedAmount;
  }
}

export async function withdrawAllFunds(
  client: TonClient,
  contractAddress: string,
  keyPair: KeyPair,
  walletAddress: Address
): Promise<number> {
  const vestingContract = new VestingContract(client, contractAddress);
  const contractState = await vestingContract.getContractState();
  const contractBalance = BigInt(contractState.balance);

  const withdrawAmount = calculateWithdrawableAmount(contractBalance, 0n, toNano('0.01'), 'all');

  if (withdrawAmount <= 0n) {
    throw new Error('No funds available for withdrawal after safety margin');
  }

  return await vestingContract.extractFunds(keyPair, walletAddress, withdrawAmount);
}

/**
 * Withdraws only the vested (unlocked) amount from a vesting contract
 * @param client TonClient instance
 * @param contractAddress Address of the vesting contract
 * @param keyPair Wallet key pair
 * @param walletAddress Address to receive the funds
 * @returns Transaction sequence number
 */
export async function withdrawVestedAmount(
  client: TonClient,
  contractAddress: string,
  keyPair: KeyPair,
  walletAddress: Address
): Promise<number> {
  const vestingContract = new VestingContract(client, contractAddress);
  const currentTime = Math.floor(Date.now() / 1000);

  const vestingData = await vestingContract.getVestingData();
  const lockedAmount = await vestingContract.getLockedAmount(currentTime);

  const availableAmount = calculateWithdrawableAmount(
    vestingData.vestingTotalAmount,
    lockedAmount,
    toNano('0.01'),
    'vested'
  );

  if (availableAmount <= 0n) {
    throw new Error('No vested funds available for withdrawal');
  }

  return await vestingContract.extractFunds(keyPair, walletAddress, availableAmount);
}
