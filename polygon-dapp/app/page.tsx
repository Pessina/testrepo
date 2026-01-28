"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { parseEther, formatEther, type Address } from "viem";
import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ERC20_ABI,
  VALIDATOR_SHARE_ABI,
  STAKE_MANAGER_ABI,
  NETWORK_CONTRACTS,
} from "@/lib/contracts";

const { stakingTokenAddress: POL_TOKEN, stakeManagerAddress: STAKE_MANAGER } =
  NETWORK_CONTRACTS.mainnet;

type StakeInfo = {
  totalStaked: string;
  rewards: string;
  allowance: string;
  unbondNonce: string;
  epoch: string;
};

export default function Home() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [validatorShare, setValidatorShare] = useState("");
  const [amount, setAmount] = useState("");
  const [info, setInfo] = useState<StakeInfo | null>(null);
  const [polBalance, setPolBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const vsAddr = validatorShare as Address;

  const waitForTx = useCallback(
    async (hash: `0x${string}`) => {
      if (!publicClient) return;
      setStatus(`Tx sent: ${hash.slice(0, 10)}... waiting...`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      setStatus(
        `Tx ${receipt.status === "success" ? "confirmed" : "failed"}: ${hash.slice(0, 10)}...`
      );
    },
    [publicClient]
  );

  const fetchPolBalance = useCallback(async () => {
    if (!address || !publicClient) return;
    const balance = await publicClient.readContract({
      address: POL_TOKEN,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address],
    });
    setPolBalance(formatEther(balance));
  }, [address, publicClient]);

  useEffect(() => {
    fetchPolBalance();
  }, [fetchPolBalance]);

  const refresh = useCallback(async () => {
    if (!address || !publicClient || !validatorShare) return;
    try {
      const [stakeResult, rewards, allowance, nonce, epoch] =
        await Promise.all([
          publicClient.readContract({
            address: vsAddr,
            abi: VALIDATOR_SHARE_ABI,
            functionName: "getTotalStake",
            args: [address],
          }),
          publicClient.readContract({
            address: vsAddr,
            abi: VALIDATOR_SHARE_ABI,
            functionName: "getLiquidRewards",
            args: [address],
          }),
          publicClient.readContract({
            address: POL_TOKEN,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [address, STAKE_MANAGER],
          }),
          publicClient.readContract({
            address: vsAddr,
            abi: VALIDATOR_SHARE_ABI,
            functionName: "unbondNonces",
            args: [address],
          }),
          publicClient.readContract({
            address: STAKE_MANAGER,
            abi: STAKE_MANAGER_ABI,
            functionName: "epoch",
          }),
        ]);

      setInfo({
        totalStaked: formatEther(stakeResult[0]),
        rewards: formatEther(rewards),
        allowance: formatEther(allowance),
        unbondNonce: nonce.toString(),
        epoch: epoch.toString(),
      });
      await fetchPolBalance();
    } catch (e) {
      setStatus(`Error reading state: ${e instanceof Error ? e.message : e}`);
    }
  }, [address, publicClient, validatorShare, vsAddr, fetchPolBalance]);

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
      if (!walletClient || !publicClient) return;
      const amountWei = parseEther(amount);

      const allowance = await publicClient.readContract({
        address: POL_TOKEN,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address!, STAKE_MANAGER],
      });

      if (allowance < amountWei) {
        setStatus("Approving POL...");
        const approveHash = await walletClient.writeContract({
          address: POL_TOKEN,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [STAKE_MANAGER, amountWei],
        });
        await waitForTx(approveHash);
      }

      setStatus("Staking POL...");
      const stakeHash = await walletClient.writeContract({
        address: vsAddr,
        abi: VALIDATOR_SHARE_ABI,
        functionName: "buyVoucherPOL",
        args: [amountWei, 0n],
      });
      await waitForTx(stakeHash);
    });

  const unstake = () =>
    exec(async () => {
      if (!walletClient) return;
      const amountWei = parseEther(amount);
      const hash = await walletClient.writeContract({
        address: vsAddr,
        abi: VALIDATOR_SHARE_ABI,
        functionName: "sellVoucher_newPOL",
        args: [amountWei, amountWei],
      });
      await waitForTx(hash);
    });

  const withdraw = () =>
    exec(async () => {
      if (!walletClient || !publicClient) return;
      const nonce = await publicClient.readContract({
        address: vsAddr,
        abi: VALIDATOR_SHARE_ABI,
        functionName: "unbondNonces",
        args: [address!],
      });
      const hash = await walletClient.writeContract({
        address: vsAddr,
        abi: VALIDATOR_SHARE_ABI,
        functionName: "unstakeClaimTokens_newPOL",
        args: [nonce],
      });
      await waitForTx(hash);
    });

  const claimRewards = () =>
    exec(async () => {
      if (!walletClient) return;
      const hash = await walletClient.writeContract({
        address: vsAddr,
        abi: VALIDATOR_SHARE_ABI,
        functionName: "withdrawRewardsPOL",
      });
      await waitForTx(hash);
    });

  const compound = () =>
    exec(async () => {
      if (!walletClient) return;
      const hash = await walletClient.writeContract({
        address: vsAddr,
        abi: VALIDATOR_SHARE_ABI,
        functionName: "restakePOL",
      });
      await waitForTx(hash);
    });

  return (
    <main className="mx-auto max-w-lg space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">POL Staking (Mainnet)</h1>
        <ConnectButton />
      </div>

      {address && (
        <>
          {polBalance !== null && (
            <p className="text-sm font-mono">POL Balance: {polBalance}</p>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Validator</CardTitle>
              <CardDescription>
                Enter a ValidatorShare contract address on mainnet
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                placeholder="0x... ValidatorShare address"
                value={validatorShare}
                onChange={(e) => setValidatorShare(e.target.value)}
              />
              <Button
                onClick={refresh}
                disabled={!validatorShare}
                variant="outline"
                className="w-full"
              >
                Load Info
              </Button>
            </CardContent>
          </Card>

          {info && (
            <Card>
              <CardHeader>
                <CardTitle>Staking Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm font-mono">
                <p>Total Staked: {info.totalStaked}</p>
                <p>Pending Rewards: {info.rewards}</p>
                <p>Allowance: {info.allowance}</p>
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
                  disabled={loading || !amount || !validatorShare}
                  className="col-span-2"
                >
                  Approve &amp; Stake
                </Button>
                <Button
                  onClick={unstake}
                  disabled={loading || !amount || !validatorShare}
                  variant="secondary"
                >
                  Unstake
                </Button>
                <Button
                  onClick={withdraw}
                  disabled={loading || !validatorShare}
                  variant="secondary"
                >
                  Withdraw
                </Button>
                <Button
                  onClick={claimRewards}
                  disabled={loading || !validatorShare}
                  variant="outline"
                >
                  Claim Rewards
                </Button>
                <Button
                  onClick={compound}
                  disabled={loading || !validatorShare}
                  variant="outline"
                >
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
