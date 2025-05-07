#!/usr/bin/env bun
import { Address, beginCell, TonClient, fromNano } from "@ton/ton";
import { mnemonicToWalletKey, mnemonicValidate } from "@ton/crypto";
import { WalletContractV5R1 } from "@ton/ton";
import { program } from "commander";

interface WalletInfo {
  type: string;
  address: Address;
}

function formatAddress(address: Address): string {
  const addrString = address.toString({
    bounceable: true,
    testOnly: true,
    urlSafe: false,
  });

  return addrString;
}

const POOL_ADDRESSES: Address[] = [
  Address.parse("kQAHBakDk_E7qLlNQZxJDsqj_ruyAFpqarw85tO-c03fK26F"),
  Address.parse("kQCltujow9Sq3ZVPPU6CYGfqwDxYwjlmFGZ1Wt0bAYebio4o"),
];

const RPC_URL =
  "https://testnet.toncenter.com/api/v2/jsonRPC?api_key=dd49c6910f1cd10985124e2c7bf17a405db11cf38aab44e03965847b21e65410";

async function initTonClient(): Promise<TonClient> {
  return new TonClient({ endpoint: RPC_URL });
}

async function generateWalletAddresses(
  mnemonic: string
): Promise<WalletInfo[]> {
  const mnemonicArray = mnemonic.split(" ").filter((word) => word !== "");
  if (!mnemonicValidate(mnemonicArray)) {
    throw new Error("Invalid mnemonic phrase");
  }

  const keyPair = await mnemonicToWalletKey(mnemonicArray);

  const walletAddresses: WalletInfo[] = [];

  walletAddresses.push({
    type: "v5r1",
    address: WalletContractV5R1.create({
      publicKey: keyPair.publicKey,
      walletId: {
        networkGlobalId: -3,
        context: {
          walletVersion: "v5r1",
          workchain: 0,
          subwalletNumber: 0,
        },
      },
    }).address,
  });

  return walletAddresses;
}

interface BalanceInfo {
  balance: bigint;
  pendingDeposit: bigint;
  pendingWithdraw: bigint;
  withdrawReady: bigint;
}

async function getStakedBalance(
  client: TonClient,
  walletAddress: Address,
  poolAddress: Address
): Promise<BalanceInfo> {
  try {
    const result = await client.runMethod(poolAddress, "get_member", [
      {
        type: "slice",
        cell: beginCell().storeAddress(walletAddress).endCell(),
      },
    ]);

    if (!result || !result.stack) {
      throw new Error("Invalid response from the contract");
    }

    const balance = result.stack.readBigNumber();
    const pendingDeposit = result.stack.readBigNumber();
    const pendingWithdraw = result.stack.readBigNumber();
    const withdrawReady = result.stack.readBigNumber();

    return { balance, pendingDeposit, pendingWithdraw, withdrawReady };
  } catch (error) {
    return {
      balance: 0n,
      pendingDeposit: 0n,
      pendingWithdraw: 0n,
      withdrawReady: 0n,
    };
  }
}

function formatTon(amount: bigint): string {
  return `${fromNano(amount)} TON`;
}

async function main() {
  program
    .option("-k, --key <key>", "Mnemonic phrase")
    .option("-a, --address <address>", "Wallet address")
    .parse();

  const options = program.opts();

  if (!options.key && !options.address) {
    console.error(
      "Error: You must provide either a mnemonic phrase (-k) or a wallet address (-a)"
    );
    process.exit(1);
  }

  try {
    const client = await initTonClient();
    console.log("Connected to TON testnet");

    let poolsToCheck: Address[] = POOL_ADDRESSES;

    if (options.address) {
      const walletAddress = Address.parse(options.address);
      console.log(`Checking balance for: ${formatAddress(walletAddress)}`);

      await checkAndDisplayBalances(
        client,
        [{ type: "provided", address: walletAddress }],
        poolsToCheck,
        options
      );
    } else {
      console.log("Generating wallet addresses from mnemonic...");
      const walletAddresses = await generateWalletAddresses(options.key);

      await checkAndDisplayBalances(
        client,
        walletAddresses,
        poolsToCheck,
        options
      );
    }
  } catch (error) {
    console.error("Failed to execute:", error);
    process.exit(1);
  }
}

interface PoolBalanceInfo extends BalanceInfo {
  pool: Address;
}

async function checkAndDisplayBalances(
  client: TonClient,
  walletAddresses: WalletInfo[],
  poolsToCheck: Address[],
  options: any
) {
  let foundActiveWallet = false;

  for (const wallet of walletAddresses) {
    let totalActiveStake = 0n;
    let totalPendingDeposit = 0n;
    let balances: PoolBalanceInfo[] = [];

    for (const poolAddress of poolsToCheck) {
      const balance = await getStakedBalance(
        client,
        wallet.address,
        poolAddress
      );
      balances.push({ pool: poolAddress, ...balance });

      totalActiveStake += balance.balance;
      totalPendingDeposit += balance.pendingDeposit;
    }

    if (walletAddresses.length > 1) {
      console.log(`\n=== Found wallet with balance: ${wallet.type} ===`);
      console.log(`Address: ${formatAddress(wallet.address)}\n`);
    }

    for (let i = 0; i < balances.length; i++) {
      const balance = balances[i];
      console.log(`=== Pool ${i}: ${formatAddress(balance.pool)} ===`);
      console.log(`Active Stake: ${formatTon(balance.balance)}`);
      console.log(`Pending Deposit: ${formatTon(balance.pendingDeposit)}`);
      console.log(`Pending Withdraw: ${formatTon(balance.pendingWithdraw)}`);
      console.log(`Ready to Withdraw: ${formatTon(balance.withdrawReady)}`);
      console.log("");
    }

    if (poolsToCheck.length > 1) {
      console.log("=== Summary Across All Pools ===");
      console.log(`Total Active Stake: ${formatTon(totalActiveStake)}`);
      console.log(`Total Pending Deposit: ${formatTon(totalPendingDeposit)}`);
      console.log(
        `Total Stake + Pending: ${formatTon(
          totalActiveStake + totalPendingDeposit
        )}`
      );
    }

    foundActiveWallet = true;
    break;
  }
}

main();
