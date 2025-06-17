import {
  Blockchain,
  RemoteBlockchainStorage,
  wrapTonClient4ForRemote,
  createShardAccount,
} from "@ton/sandbox";
import { TonClient4 } from "@ton/ton";
import { Address, toNano, beginCell, Dictionary, TupleReader } from "@ton/core";

let client = new TonClient4({
  endpoint: "https://mainnet-v4.tonhubapi.com",
});

const latestBlock = await client.getLastBlock();
console.log("Latest block seqno:", latestBlock.last.seqno);

let blockchain = await Blockchain.create({
  storage: new RemoteBlockchainStorage(
    wrapTonClient4ForRemote(client),
    latestBlock.last.seqno
  ),
});

const address = Address.parse(
  "EQBFbbSCrAnX2XWOjSq2qnAx_GRdx2wZIFqrlk9D0-1mxHDN"
);

// Get original contract state
const contract = await blockchain.getContract(address);
console.log(`Original balance: ${contract.balance} nanotons`);

// Try to get original contract code and state info
console.log("\n=== INVESTIGATING ORIGINAL CONTRACT ===");
try {
  const originalState = contract.accountState;
  console.log("Original account state type:", originalState?.type);

  if (originalState?.type === "active") {
    console.log("Original code exists:", !!originalState.state.code);
    console.log("Original data exists:", !!originalState.state.data);

    if (originalState.state.code) {
      console.log(
        "Original code hash:",
        originalState.state.code.hash().toString("hex")
      );
    }
  }
} catch (e) {
  console.log(
    "Could not inspect original state:",
    e instanceof Error ? e.message : String(e)
  );
}

// Read original state before modification
console.log("\n=== READING ORIGINAL STATE ===");
try {
  const originalPoolStatus = await blockchain.runGetMethod(
    contract.address,
    "get_pool_status"
  );
  const originalReader = new TupleReader(originalPoolStatus.stack);
  const originalBalance = originalReader.readBigNumber();
  const originalBalanceSent = originalReader.readBigNumber();
  console.log(
    "Original ctx_balance:",
    originalBalance.toString(),
    `(${Number(originalBalance) / 1e9} TON)`
  );
  console.log(
    "Original ctx_balance_sent:",
    originalBalanceSent.toString(),
    `(${Number(originalBalanceSent) / 1e9} TON)`
  );
} catch (e) {
  console.log(
    "Could not read original pool status:",
    e instanceof Error ? e.message : String(e)
  );
}

// ===========================================
// MINIMAL STATE MODIFICATION TEST
// ===========================================

// For testing purposes, we'll use a dummy code cell
// In a real scenario, you'd want to use the actual contract code
const dummyCode = beginCell()
  .storeUint(0, 32) // Simple dummy code for testing
  .endCell();

// Create a simple modified data cell
// Must match the exact structure in load_base_data()
const balanceCell = beginCell()
  .storeInt(0, 128) // ctx_profit_per_coin = 0
  .storeCoins(toNano("1000")) // ctx_balance = 1000 TON (modified)
  .storeCoins(toNano("100")) // ctx_balance_sent = 100 TON (modified)
  .storeCoins(toNano("93829382938")) // ctx_balance_withdraw = 50 TON (modified)
  .storeCoins(toNano("25")) // ctx_balance_pending_withdraw = 25 TON (modified)
  .storeCoins(toNano("75")) // ctx_balance_pending_deposits = 75 TON (modified)
  .endCell();

// Empty nominators dictionary for simplicity
const emptyNominators = Dictionary.empty();

// Proxy state matching store_validator_data()
const validatorState = beginCell()
  .storeUint(0, 32) // proxy_stake_at = 0
  .storeUint(0, 32) // proxy_stake_until = 0
  .storeCoins(0) // proxy_stake_sent = 0
  .storeUint(0, 64) // proxy_stored_query_id = 0
  .storeUint(0, 32) // proxy_stored_query_op = 0
  .storeCoins(0) // proxy_stored_query_stake = 0
  .storeUint(0, 32) // proxy_stake_held_for = 0
  .storeBit(false) // proxy_stake_lock_final = false
  .endCell();

// Extras cell matching the contract structure
const extrasCell = beginCell()
  .storeBit(true) // enabled = true
  .storeBit(true) // updates_enabled = true
  .storeCoins(toNano("1")) // min_stake = 1 TON
  .storeCoins(toNano("0.1")) // deposit_fee = 0.1 TON
  .storeCoins(toNano("0.1")) // withdraw_fee = 0.1 TON
  .storeCoins(1000) // pool_fee = 10%
  .storeCoins(toNano("0.1")) // receipt_price = 0.1 TON
  .endCell();

// Create modified data cell matching exact load_base_data() structure
const modifiedDataCell = beginCell()
  .storeBit(false) // ctx_locked = false (unlocked)
  .storeAddress(contract.address) // ctx_owner (keep original)
  .storeAddress(contract.address) // ctx_controller (keep original)
  .storeAddress(contract.address) // ctx_proxy (keep original)
  .storeRef(balanceCell) // Balance data ref
  .storeDict(emptyNominators) // Empty nominators dictionary
  .storeRef(validatorState) // Validator/proxy state ref
  .storeRef(extrasCell) // Extras ref
  .endCell();

// Apply the modified state using setShardAccount (as per @ton/sandbox docs)
console.log("Modifying contract state...");

// Let's try using the original code if it exists, otherwise use dummy
let codeToUse = dummyCode;
if (
  contract.accountState?.type === "active" &&
  contract.accountState.state.code
) {
  codeToUse = contract.accountState.state.code;
  console.log("Using original contract code");
} else {
  console.log("Using dummy code (original not available)");
}

await blockchain.setShardAccount(
  address,
  createShardAccount({
    address: address,
    code: codeToUse, // Use original code if available, otherwise dummy
    data: modifiedDataCell,
    balance: toNano("2000"), // Set contract balance to 2000 TON
    workchain: 0,
  })
);

// Test the modification
const modifiedContract = await blockchain.getContract(address);

// Try to read some get methods if they exist (this may fail if methods don't exist)
console.log("\n=== ATTEMPTING TO READ GET METHODS ===");
try {
  // get_pool_status returns 5 values: (ctx_balance, ctx_balance_sent, ctx_balance_pending_deposits, ctx_balance_pending_withdraw, ctx_balance_withdraw)
  try {
    const poolStatus = await blockchain.runGetMethod(
      modifiedContract.address,
      "get_pool_status"
    );
    console.log("✅ get_pool_status succeeded, parsing 5 values...");

    const reader = new TupleReader(poolStatus.stack);
    console.log("Stack length:", poolStatus.stack.length);

    const balance = reader.readBigNumber();
    const balanceSent = reader.readBigNumber();
    const pendingDeposits = reader.readBigNumber();
    const pendingWithdraw = reader.readBigNumber();
    const balanceWithdraw = reader.readBigNumber();

    console.log(
      `ctx_balance: ${balance.toString()} (${Number(balance) / 1e9} TON)`
    );
    console.log(
      `ctx_balance_sent: ${balanceSent.toString()} (${
        Number(balanceSent) / 1e9
      } TON)`
    );
    console.log(
      `ctx_balance_pending_deposits: ${pendingDeposits.toString()} (${
        Number(pendingDeposits) / 1e9
      } TON)`
    );
    console.log(
      `ctx_balance_pending_withdraw: ${pendingWithdraw.toString()} (${
        Number(pendingWithdraw) / 1e9
      } TON)`
    );
    console.log(
      `ctx_balance_withdraw: ${balanceWithdraw.toString()} (${
        Number(balanceWithdraw) / 1e9
      } TON)`
    );
  } catch (e) {
    console.log(
      "❌ get_pool_status failed:",
      e instanceof Error ? e.message : String(e)
    );
  }

  // get_params returns 7 values: (enabled, updates_enabled, min_stake, deposit_fee, withdraw_fee, pool_fee, receipt_price)
  try {
    const params = await blockchain.runGetMethod(
      modifiedContract.address,
      "get_params"
    );
    console.log("\n✅ get_params succeeded, parsing 7 values...");

    const reader = new TupleReader(params.stack);
    console.log("Stack length:", params.stack.length);

    const enabled = reader.readBoolean();
    const updatesEnabled = reader.readBoolean();
    const minStake = reader.readBigNumber();
    const depositFee = reader.readBigNumber();
    const withdrawFee = reader.readBigNumber();
    const poolFee = reader.readBigNumber();
    const receiptPrice = reader.readBigNumber();

    console.log(`enabled: ${enabled}`);
    console.log(`updates_enabled: ${updatesEnabled}`);
    console.log(
      `min_stake: ${minStake.toString()} (${Number(minStake) / 1e9} TON)`
    );
    console.log(
      `deposit_fee: ${depositFee.toString()} (${Number(depositFee) / 1e9} TON)`
    );
    console.log(
      `withdraw_fee: ${withdrawFee.toString()} (${
        Number(withdrawFee) / 1e9
      } TON)`
    );
    console.log(`pool_fee: ${poolFee.toString()} (${Number(poolFee) / 100}%)`);
    console.log(
      `receipt_price: ${receiptPrice.toString()} (${
        Number(receiptPrice) / 1e9
      } TON)`
    );
  } catch (e) {
    console.log(
      "❌ get_params failed:",
      e instanceof Error ? e.message : String(e)
    );
  }

  // get_staking_status returns 7 values: (proxy_stake_at, until_val, proxy_stake_sent, querySent, can_unlock, ctx_locked, proxy_stake_lock_final)
  try {
    const stakingStatus = await blockchain.runGetMethod(
      modifiedContract.address,
      "get_staking_status"
    );
    console.log("\n✅ get_staking_status succeeded, parsing 7 values...");

    const reader = new TupleReader(stakingStatus.stack);
    console.log("Stack length:", stakingStatus.stack.length);

    const stakeAt = reader.readBigNumber();
    const untilVal = reader.readBigNumber();
    const stakeSent = reader.readBigNumber();
    const querySent = reader.readBoolean();
    const canUnlock = reader.readBoolean();
    const locked = reader.readBoolean();
    const lockFinal = reader.readBoolean();

    console.log(`proxy_stake_at: ${stakeAt.toString()}`);
    console.log(`until_val: ${untilVal.toString()}`);
    console.log(
      `proxy_stake_sent: ${stakeSent.toString()} (${
        Number(stakeSent) / 1e9
      } TON)`
    );
    console.log(`query_sent: ${querySent}`);
    console.log(`can_unlock: ${canUnlock}`);
    console.log(`ctx_locked: ${locked}`);
    console.log(`proxy_stake_lock_final: ${lockFinal}`);
  } catch (e) {
    console.log(
      "❌ get_staking_status failed:",
      e instanceof Error ? e.message : String(e)
    );
  }
} catch (e) {
  console.log(
    "Could not read get methods:",
    e instanceof Error ? e.message : String(e)
  );
}
