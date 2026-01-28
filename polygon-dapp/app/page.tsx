"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { formatEther, type Address } from "viem";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PolygonStaker, CHORUS_ONE_POLYGON_VALIDATORS } from "@chorus-one/polygon";

const VALIDATOR_SHARE = CHORUS_ONE_POLYGON_VALIDATORS.mainnet;

type StakeInfo = {
  totalStaked: string;
  shares: string;
  rewards: string;
  allowance: string;
  unbondNonce: string;
  epoch: string;
};

export default function Home() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [staker, setStaker] = useState<PolygonStaker | null>(null);
  const [amount, setAmount] = useState("");
  const [info, setInfo] = useState<StakeInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const instance = new PolygonStaker({ network: "mainnet" });
    setStaker(instance);
  }, []);

  const waitForTx = async (hash: `0x${string}`) => {
    if (!publicClient) return;
    setStatus(`Tx sent: ${hash.slice(0, 10)}... waiting...`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    setStatus(
      `Tx ${receipt.status === "success" ? "confirmed" : "failed"}: ${hash.slice(0, 10)}...`
    );
  };

  const sendTx = async (tx: {
    to: Address;
    data: `0x${string}`;
    value: bigint;
  }) => {
    if (!walletClient || !address) throw new Error("Wallet not connected");
    const hash = await walletClient.sendTransaction({
      to: tx.to,
      data: tx.data,
      value: tx.value,
      account: address,
      chain: walletClient.chain,
    });
    await waitForTx(hash);
  };

  const refresh = async () => {
    if (!address || !staker) return;
    try {
      const [stakeInfo, rewards, allowance, nonce, epoch] = await Promise.all([
        staker.getStake({
          delegatorAddress: address,
          validatorShareAddress: VALIDATOR_SHARE,
        }),
        staker.getLiquidRewards({
          delegatorAddress: address,
          validatorShareAddress: VALIDATOR_SHARE,
        }),
        staker.getAllowance(address),
        staker.getUnbondNonce({
          delegatorAddress: address,
          validatorShareAddress: VALIDATOR_SHARE,
        }),
        staker.getEpoch(),
      ]);

      setInfo({
        totalStaked: formatEther(stakeInfo.totalStaked),
        shares: stakeInfo.shares.toString(),
        rewards: formatEther(rewards),
        allowance: formatEther(allowance),
        unbondNonce: nonce.toString(),
        epoch: epoch.toString(),
      });
    } catch (e) {
      setStatus(`Error reading state: ${e instanceof Error ? e.message : e}`);
    }
  };

  const exec = async (fn: () => Promise<void>) => {
    setLoading(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : e}`);
    } finally {
      setLoading(false);
    }
  };

  const approveAndStake = () =>
    exec(async () => {
      if (!staker || !address) return;

      const allowance = await staker.getAllowance(address);
      const requiredAllowance = BigInt(Math.ceil(parseFloat(amount) * 1e18));

      if (allowance < requiredAllowance) {
        setStatus("Approving POL...");
        const { tx: approveTx } = await staker.buildApproveTx({ amount });
        await sendTx(approveTx);
      }

      setStatus("Staking POL...");
      const { tx: stakeTx } = await staker.buildStakeTx({
        delegatorAddress: address,
        validatorShareAddress: VALIDATOR_SHARE,
        amount,
      });
      await sendTx(stakeTx);
    });

  const unstake = () =>
    exec(async () => {
      if (!staker || !address) return;
      setStatus("Unstaking POL...");
      const { tx } = await staker.buildUnstakeTx({
        delegatorAddress: address,
        validatorShareAddress: VALIDATOR_SHARE,
        amount,
      });
      await sendTx(tx);
    });

  const withdraw = () =>
    exec(async () => {
      if (!staker || !address) return;

      const unbondNonce = await staker.getUnbondNonce({
        delegatorAddress: address,
        validatorShareAddress: VALIDATOR_SHARE,
      });

      const unbond = await staker.getUnbond({
        delegatorAddress: address,
        validatorShareAddress: VALIDATOR_SHARE,
        unbondNonce,
      });

      const currentEpoch = await staker.getEpoch();
      if (currentEpoch < unbond.withdrawEpoch) {
        setStatus(
          `Unbonding not complete. Current epoch: ${currentEpoch}, Withdraw epoch: ${unbond.withdrawEpoch}`
        );
        return;
      }

      setStatus("Withdrawing POL...");
      const { tx } = await staker.buildWithdrawTx({
        delegatorAddress: address,
        validatorShareAddress: VALIDATOR_SHARE,
        unbondNonce,
      });
      await sendTx(tx);
    });

  const claimRewards = () =>
    exec(async () => {
      if (!staker || !address) return;
      setStatus("Claiming rewards...");
      const { tx } = await staker.buildClaimRewardsTx({
        delegatorAddress: address,
        validatorShareAddress: VALIDATOR_SHARE,
      });
      await sendTx(tx);
    });

  const compound = () =>
    exec(async () => {
      if (!staker || !address) return;
      setStatus("Compounding rewards...");
      const { tx } = await staker.buildCompoundTx({
        delegatorAddress: address,
        validatorShareAddress: VALIDATOR_SHARE,
      });
      await sendTx(tx);
    });

  return (
    <main className="mx-auto max-w-lg space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">POL Staking (Mainnet)</h1>
        <ConnectButton />
      </div>

      {address && staker && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Chorus One Validator</CardTitle>
              <CardDescription className="font-mono text-xs break-all">
                {VALIDATOR_SHARE}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={refresh} variant="outline" className="w-full">
                Load Staking Info
              </Button>
            </CardContent>
          </Card>

          {info && (
            <Card>
              <CardHeader>
                <CardTitle>Staking Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm font-mono">
                <p>Total Staked: {info.totalStaked} POL</p>
                <p>Shares: {info.shares}</p>
                <p>Pending Rewards: {info.rewards} POL</p>
                <p>Allowance: {info.allowance} POL</p>
                <p>Unbond Nonce: {info.unbondNonce}</p>
                <p>Current Epoch: {info.epoch}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
              <CardDescription>
                Full staking lifecycle: Stake &rarr; Unstake &rarr; Withdraw
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Amount (POL)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                type="number"
                step="0.01"
              />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={approveAndStake}
                  disabled={loading || !amount}
                  className="col-span-2"
                >
                  Approve &amp; Stake
                </Button>
                <Button
                  onClick={unstake}
                  disabled={loading || !amount}
                  variant="secondary"
                >
                  Unstake
                </Button>
                <Button onClick={withdraw} disabled={loading} variant="secondary">
                  Withdraw
                </Button>
                <Button
                  onClick={claimRewards}
                  disabled={loading}
                  variant="outline"
                >
                  Claim Rewards
                </Button>
                <Button onClick={compound} disabled={loading} variant="outline">
                  Compound
                </Button>
              </div>
            </CardContent>
          </Card>

          {status && (
            <p className="text-xs text-muted-foreground break-all">{status}</p>
          )}
        </>
      )}
    </main>
  );
}
