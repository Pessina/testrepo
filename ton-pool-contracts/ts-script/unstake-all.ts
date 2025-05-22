#!/usr/bin/env bun
import {
  Address,
  beginCell,
  TonClient,
  fromNano,
  WalletContractV5R1,
  SendMode,
  internal,
} from "@ton/ton";
import { mnemonicToWalletKey, mnemonicValidate } from "@ton/crypto";
import { program } from "commander";

const POOL_ADDRESSES: Address[] = [
  Address.parse("kQAHBakDk_E7qLlNQZxJDsqj_ruyAFpqarw85tO-c03fK26F"),
  Address.parse("kQCltujow9Sq3ZVPPU6CYGfqwDxYwjlmFGZ1Wt0bAYebio4o"),
];

// Set up the program options
program.option("-k, --key <key>", "Mnemonic phrase for the wallet").parse();

const options = program.opts();

// Validate required options
if (!options.key) {
  console.error("Error: You must provide a mnemonic phrase (-k)");
  process.exit(1);
}

// RPC URL - you might want to use mainnet instead of testnet depending on where your contract is deployed
const RPC_URL =
  "https://testnet.toncenter.com/api/v2/jsonRPC?api_key=dd49c6910f1cd10985124e2c7bf17a405db11cf38aab44e03965847b21e65410";

// Operation code for stake withdrawal (from constants.fc)
const OP_STAKE_WITHDRAW = 3665837821n;

async function main() {
  try {
    // Initialize TON client
    const client = new TonClient({ endpoint: RPC_URL });
    console.log("Connected to TON network");

    // Parse the pool address
    const poolAddress = POOL_ADDRESSES[1];
    console.log(`Pool address: ${poolAddress.toString({ bounceable: true })}`);

    // Generate wallet from mnemonic
    const mnemonicArray = options.key
      .split(" ")
      .filter((word: string) => word !== "");

    if (!mnemonicValidate(mnemonicArray)) {
      throw new Error("Invalid mnemonic phrase");
    }

    const keyPair = await mnemonicToWalletKey(mnemonicArray);

    const wallet = WalletContractV5R1.create({
      publicKey: keyPair.publicKey,
      walletId: {
        networkGlobalId: -3, // testnet
        context: {
          walletVersion: "v5r1",
          workchain: 0,
          subwalletNumber: 0,
        },
      },
    });

    const walletAddress = wallet.address;
    console.log(
      `Using wallet from mnemonic: ${walletAddress.toString({
        bounceable: true,
      })}`
    );

    // Create wallet contract instance to send transactions
    const walletContract = client.open(wallet);

    // Get wallet balance to ensure we have enough funds
    const walletBalance = await client.getBalance(walletAddress);
    console.log(`Wallet balance: ${fromNano(walletBalance)} TON`);

    // Check the balance in the pool
    const balance = await getStakedBalance(client, walletAddress, poolAddress);
    console.log("Your balance in the pool:");
    console.log(`Active Stake: ${formatTon(balance.balance)}`);
    console.log(`Pending Deposit: ${formatTon(balance.pendingDeposit)}`);
    console.log(`Pending Withdraw: ${formatTon(balance.pendingWithdraw)}`);
    console.log(`Ready to Withdraw: ${formatTon(balance.withdrawReady)}`);

    if (
      balance.balance === 0n &&
      balance.pendingDeposit === 0n &&
      balance.pendingWithdraw === 0n &&
      balance.withdrawReady === 0n
    ) {
      console.log("No funds to withdraw from this pool.");
      return;
    }

    // Calculate total balance to withdraw
    const totalBalance =
      balance.balance + balance.pendingDeposit + balance.withdrawReady;
    console.log(`Total balance to withdraw: ${formatTon(totalBalance)}`);

    // Get parameters to determine the correct fee
    const params = await getPoolParams(client, poolAddress);
    console.log(`Withdraw fee: ${formatTon(params.withdrawFee)}`);
    console.log(`Receipt price: ${formatTon(params.receiptPrice)}`);

    const totalFee = params.withdrawFee + params.receiptPrice;
    console.log(`Total required fee: ${formatTon(totalFee)}`);

    // Create the withdraw message body
    // Using the actual total balance instead of 0
    const withdrawBody = beginCell()
      .storeUint(OP_STAKE_WITHDRAW, 32) // op
      .storeUint(Date.now(), 64) // query id
      .storeCoins(100000) // gas limit
      .storeCoins(totalBalance) // withdraw full balance explicitly
      .endCell();

    console.log("Sending withdrawal transaction...");

    try {
      // Send the transaction using the wallet contract
      const seqno = await walletContract.getSeqno();
      await walletContract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
          internal({
            to: poolAddress,
            value: totalFee,
            bounce: true,
            body: withdrawBody,
          }),
        ],
        sendMode: SendMode.PAY_GAS_SEPARATELY,
      });

      console.log(`Transaction sent! Seqno: ${seqno}`);
      console.log(
        `You can track it on a TON explorer by looking at transactions from: ${walletAddress.toString(
          { bounceable: true }
        )}`
      );

      // Wait a bit and check for transaction status
      console.log("Waiting for transaction confirmation...");
      await new Promise((resolve) => setTimeout(resolve, 15000));

      // Check the balance again to see if withdrawal was successful
      const newBalance = await getStakedBalance(
        client,
        walletAddress,
        poolAddress
      );

      if (newBalance.pendingWithdraw > balance.pendingWithdraw) {
        console.log(
          "Withdrawal request successful! Funds are now in pending withdraw."
        );
        console.log(
          `Pending Withdraw: ${formatTon(newBalance.pendingWithdraw)}`
        );
      } else if (newBalance.withdrawReady > balance.withdrawReady) {
        console.log("Withdrawal successful! Funds are ready to withdraw.");
        console.log(
          `Ready to Withdraw: ${formatTon(newBalance.withdrawReady)}`
        );
      } else if (newBalance.balance < balance.balance) {
        console.log(
          "Balance has changed. Withdrawal may have been processed differently."
        );
        console.log(`New Active Stake: ${formatTon(newBalance.balance)}`);
      } else {
        console.log(
          "No change in balances detected. Transaction may have failed."
        );
        console.log("Error 501 likely occurred. Possible reasons:");
        console.log("1. The contract is disabled or in a locked state");
        console.log("2. Insufficient funds were sent for fees");
        console.log("3. Trying to withdraw during stake locking period");
      }
    } catch (error: unknown) {
      console.error("Error during withdrawal:", error);
      if (error instanceof Error && error.message.includes("501")) {
        console.error("Error 501: This usually happens when:");
        console.error("1. The contract is disabled or in a locked state");
        console.error("2. Insufficient funds were sent for fees");
        console.error("3. Trying to withdraw more than your available balance");
      }
    }
  } catch (error: unknown) {
    console.error("Failed to execute:", error);
    process.exit(1);
  }
}

interface BalanceInfo {
  balance: bigint;
  pendingDeposit: bigint;
  pendingWithdraw: bigint;
  withdrawReady: bigint;
}

interface PoolParams {
  enabled: boolean;
  updatesEnabled: boolean;
  minStake: bigint;
  depositFee: bigint;
  withdrawFee: bigint;
  poolFee: bigint;
  receiptPrice: bigint;
}

async function getStakedBalance(
  client: TonClient,
  walletAddress: Address,
  poolAddress: Address
): Promise<BalanceInfo> {
  try {
    // Using get_member_balance based on contract implementation
    const result = await client.runMethod(poolAddress, "get_member_balance", [
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
    console.error("Error getting staked balance:", error);
    return {
      balance: 0n,
      pendingDeposit: 0n,
      pendingWithdraw: 0n,
      withdrawReady: 0n,
    };
  }
}

async function getPoolParams(
  client: TonClient,
  poolAddress: Address
): Promise<PoolParams> {
  try {
    const result = await client.runMethod(poolAddress, "get_params", []);

    if (!result || !result.stack) {
      throw new Error("Invalid response from the contract");
    }

    const enabled = result.stack.readBoolean();
    const updatesEnabled = result.stack.readBoolean();
    const minStake = result.stack.readBigNumber();
    const depositFee = result.stack.readBigNumber();
    const withdrawFee = result.stack.readBigNumber();
    const poolFee = result.stack.readBigNumber();
    const receiptPrice = result.stack.readBigNumber();

    return {
      enabled,
      updatesEnabled,
      minStake,
      depositFee,
      withdrawFee,
      poolFee,
      receiptPrice,
    };
  } catch (error) {
    console.error("Error getting pool parameters:", error);
    return {
      enabled: false,
      updatesEnabled: false,
      minStake: 0n,
      depositFee: 0n,
      withdrawFee: 0n,
      poolFee: 0n,
      receiptPrice: 0n,
    };
  }
}

function formatTon(amount: bigint): string {
  return `${fromNano(amount)} TON`;
}

main();
