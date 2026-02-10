"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  usePublicClient,
  useWalletClient,
  useSwitchChain,
  useBalance,
} from "wagmi";
import { parseEther, maxUint256, formatEther, type Address } from "viem";
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PolygonStaker,
  NETWORK_CONTRACTS,
  type UnbondInfo,
} from "@chorus-one/polygon";
import { useNetwork } from "@/lib/network-context";
import { networkConfig } from "@/lib/network";

type UnbondItem = UnbondInfo & { nonce: bigint };

type StakeInfo = {
  staked: string;
  rewards: string;
  allowance: string;
  unbonding: string;
  withdrawable: string;
  unbonds: UnbondItem[];
  epoch: string;
  withdrawalDelay: string;
};

export default function Home() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { switchChain } = useSwitchChain();
  const { network, setNetwork } = useNetwork();

  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const currentConfig = networkConfig[network];
  const validatorShare = currentConfig.validatorShare;
  const stakingTokenAddress = NETWORK_CONTRACTS[network].stakingTokenAddress;

  const staker = useMemo(() => new PolygonStaker({ network }), [network]);

  const { data: polBalance } = useBalance({
    address,
    token: stakingTokenAddress,
    query: { refetchInterval: 10000 },
  });

  const { data: info, refetch } = useQuery<StakeInfo>({
    queryKey: ["stakingInfo", network, address, validatorShare],
    queryFn: async () => {
      if (!address) throw new Error("No address");

      const [stakeInfo, rewards, allowance, nonce, epoch, withdrawalDelay] =
        await Promise.all([
          staker.getStake({
            delegatorAddress: address,
            validatorShareAddress: validatorShare,
          }),
          staker.getLiquidRewards({
            delegatorAddress: address,
            validatorShareAddress: validatorShare,
          }),
          staker.getAllowance(address),
          staker.getUnbondNonce({
            delegatorAddress: address,
            validatorShareAddress: validatorShare,
          }),
          staker.getEpoch(),
          staker.getWithdrawalDelay(),
        ]);

      const unbondNonces = Array.from({ length: Number(nonce) }, (_, i) =>
        BigInt(i + 1),
      );
      const unbondResults =
        unbondNonces.length > 0
          ? await staker.getUnbonds({
              delegatorAddress: address,
              validatorShareAddress: validatorShare,
              unbondNonces,
            })
          : [];

      const unbonds: UnbondItem[] = [];
      let unbondingAmount = 0;
      let withdrawableAmount = 0;

      unbondResults.forEach((unbond, index) => {
        if (unbond.shares > 0n) {
          const amount = parseFloat(unbond.amount);
          if (unbond.isWithdrawable) {
            withdrawableAmount += amount;
          } else {
            unbondingAmount += amount;
          }
          unbonds.push({ ...unbond, nonce: unbondNonces[index] });
        }
      });

      const allowanceWei = parseEther(allowance);
      const isUnlimited = allowanceWei >= maxUint256 / 2n;

      return {
        staked: stakeInfo.balance,
        rewards,
        allowance: isUnlimited ? "Unlimited" : allowance,
        unbonding: unbondingAmount.toString(),
        withdrawable: withdrawableAmount.toString(),
        unbonds,
        epoch: epoch.toString(),
        withdrawalDelay: withdrawalDelay.toString(),
      };
    },
    enabled: !!address,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (chainId && chainId !== currentConfig.chain.id) {
      switchChain({ chainId: currentConfig.chain.id });
    }
  }, [network, chainId, currentConfig.chain.id, switchChain]);

  const waitForTx = async (hash: `0x${string}`) => {
    if (!publicClient) return;
    setStatus(`Tx sent: ${hash.slice(0, 10)}... waiting...`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    setStatus(
      `Tx ${
        receipt.status === "success" ? "confirmed" : "failed"
      }: ${hash.slice(0, 10)}...`,
    );
  };

  const sendTx = async (tx: {
    to: Address;
    data: `0x${string}`;
    value?: bigint;
  }) => {
    if (!walletClient || !address) throw new Error("Wallet not connected");
    const hash = await walletClient.sendTransaction({
      to: tx.to,
      data: tx.data,
      value: tx.value ?? 0n,
      account: address,
      chain: walletClient.chain,
    });
    await waitForTx(hash);
  };

  const exec = async (fn: () => Promise<void>) => {
    setLoading(true);
    try {
      await fn();
      await refetch();
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
      const requiredAllowance = parseEther(amount);

      if (parseEther(allowance) < requiredAllowance) {
        setStatus("Approving POL...");
        const { tx: approveTx } = await staker.buildApproveTx({ amount });
        console.log("Approve tx:", approveTx);
        await sendTx(approveTx);
      }

      setStatus("Staking POL...");
      const { tx: stakeTx } = await staker.buildStakeTx({
        delegatorAddress: address,
        validatorShareAddress: validatorShare,
        amount,
        slippageBps: 0,
      });
      console.log("Stake tx:", stakeTx);
      await sendTx(stakeTx);
    });

  const unstake = () =>
    exec(async () => {
      if (!staker || !address) return;
      setStatus("Unstaking POL...");
      const { tx } = await staker.buildUnstakeTx({
        delegatorAddress: address,
        validatorShareAddress: validatorShare,
        amount,
        slippageBps: 0,
      });
      console.log("Unstake tx:", tx);
      await sendTx(tx);
    });

  const withdraw = (unbondNonce: bigint) =>
    exec(async () => {
      if (!staker || !address) return;

      setStatus(`Withdrawing unbond #${unbondNonce}...`);
      const { tx } = await staker.buildWithdrawTx({
        delegatorAddress: address,
        validatorShareAddress: validatorShare,
        unbondNonce,
      });
      console.log("Withdraw tx:", tx);
      await sendTx(tx);
    });

  const claimRewards = () =>
    exec(async () => {
      if (!staker || !address) return;
      setStatus("Claiming rewards...");
      const { tx } = await staker.buildClaimRewardsTx({
        delegatorAddress: address,
        validatorShareAddress: validatorShare,
      });
      console.log("Claim rewards tx:", tx);
      await sendTx(tx);
    });

  const compound = () =>
    exec(async () => {
      if (!staker || !address) return;
      setStatus("Compounding rewards...");
      const { tx } = await staker.buildCompoundTx({
        delegatorAddress: address,
        validatorShareAddress: validatorShare,
      });
      console.log("Compound tx:", tx);
      await sendTx(tx);
    });

  const revokeApproval = () =>
    exec(async () => {
      if (!staker || !address) return;
      setStatus("Revoking POL approval...");
      const { tx } = await staker.buildApproveTx({ amount: "0.01" });
      console.log("Revoke approval tx:", tx);
      await sendTx(tx);
    });

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold">POL Staking</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span
              className={
                network === "testnet" ? "font-medium" : "text-muted-foreground"
              }
            >
              Testnet
            </span>
            <Switch
              checked={network === "mainnet"}
              onCheckedChange={(checked) =>
                setNetwork(checked ? "mainnet" : "testnet")
              }
            />
            <span
              className={
                network === "mainnet" ? "font-medium" : "text-muted-foreground"
              }
            >
              Mainnet
            </span>
          </div>
          <ConnectButton />
        </div>
      </div>

      {address && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{currentConfig.label} Validator</CardTitle>
              <CardDescription className="font-mono text-xs break-all">
                {validatorShare}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm">
                <span className="text-muted-foreground">
                  Wallet POL Balance:
                </span>{" "}
                <span className="font-mono font-medium">
                  {polBalance ? formatEther(polBalance.value) : "0"} POL
                </span>
              </p>
            </CardContent>
          </Card>

          {info && (
            <Card>
              <CardHeader>
                <CardTitle>Staking Info</CardTitle>
                <CardDescription>Auto-refreshes every 15s</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm font-mono">
                <p>Staked: {info.staked} POL</p>
                <p>Pending Rewards: {info.rewards} POL</p>
                <p>Unbonding: {info.unbonding} POL</p>
                <p>Withdrawable: {info.withdrawable} POL</p>
                <div className="flex items-center gap-2">
                  <p>
                    Allowance: {info.allowance}
                    {info.allowance !== "Unlimited" && " POL"}
                  </p>
                  {info.allowance !== "0" && (
                    <Button
                      size="xs"
                      variant="destructive"
                      disabled={loading}
                      onClick={revokeApproval}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
                <p>Current Epoch: {info.epoch}</p>
                <p>Withdrawal Delay: {info.withdrawalDelay} epochs</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Stake / Unstake</CardTitle>
              <CardDescription>Enter amount in POL</CardDescription>
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
                <Button onClick={approveAndStake} disabled={loading || !amount}>
                  Approve &amp; Stake
                </Button>
                <Button
                  onClick={unstake}
                  disabled={loading || !amount}
                  variant="secondary"
                >
                  Unstake
                </Button>
              </div>
            </CardContent>
          </Card>

          {info && info.unbonds.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Withdrawals</CardTitle>
                <CardDescription>
                  Withdraw each unbond individually
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {info.unbonds.map((unbond) => (
                  <div
                    key={unbond.nonce.toString()}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="text-sm font-mono">
                      <p className="font-medium">{unbond.amount} POL</p>
                      <p className="text-xs">
                        <span className="text-muted-foreground">
                          Nonce #{unbond.nonce.toString()}
                        </span>
                        {" · "}
                        <span
                          className={
                            unbond.isWithdrawable
                              ? "text-green-600"
                              : "text-yellow-600"
                          }
                        >
                          {unbond.isWithdrawable ? "Withdrawable" : "Unbonding"}
                        </span>
                        {!unbond.isWithdrawable && (
                          <span className="text-muted-foreground">
                            {" "}
                            · Ready at epoch{" "}
                            {(
                              BigInt(info.withdrawalDelay) +
                              unbond.withdrawEpoch
                            ).toString()}
                          </span>
                        )}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={unbond.isWithdrawable ? "default" : "outline"}
                      disabled={loading || !unbond.isWithdrawable}
                      onClick={() => withdraw(unbond.nonce)}
                    >
                      {unbond.isWithdrawable ? "Withdraw" : "Pending"}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Rewards</CardTitle>
              <CardDescription>Claim or compound your rewards</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
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
