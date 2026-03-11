# TX Size Optimization Tracker

## Context for next agent
All optimizations are **DONE**. This file documents the iterative tx-size optimizations applied to the `ecdsa-proxy` Solana Anchor program. The benchmark test at `tests/benchmark-tx-size.ts` measures serialized transaction bytes. Run `anchor test` to reproduce results. All 19 tests pass and all linters (`clippy`, `eslint`, `prettier`, `tsc`, `knip`) are clean.

## Benchmark scenarios
1. **Single SPL transfer** — 1 inner instruction, 3 account metas, 9 bytes data
2. **Two SPL transfers** — 2 inner instructions, 3 account metas each (some overlap), 9 bytes data each
3. **Swap-like** — 1 inner instruction, 8 account metas, 20 bytes data

## Optimizations

### 1. [DONE] Index-based InnerInstruction / InnerAccountMeta
- Replaced `program_id: Pubkey` (32 bytes) with `program_id_index: u8` (1 byte)
- Replaced `pubkey: Pubkey` (32 bytes) with `account_index: u8` (1 byte)
- Indices reference `remaining_accounts` at runtime; on-chain handler resolves them
- Files changed: `lib.rs`, `execute.rs`, `error.rs`, `tests/helpers/evm-signer.ts`, `tests/ecdsa-proxy.ts`, `tests/benchmark-tx-size.ts`

### 2. [DONE] Pack is_signer + is_writable into single flags byte
- Replaced 2 bools (2 bytes) with 1 `flags: u8` (bit 0 = is_signer, bit 1 = is_writable)
- Added `const fn is_signer()` / `is_writable()` accessor methods on `InnerAccountMeta`
- Files changed: `lib.rs`, `execute.rs`, `tests/helpers/evm-signer.ts`

### 3. [DONE] Fixed-size arrays in compute_message_hash
- Replaced `Vec::new()` with `[u8; 80]` for inner_data, `[u8; 60]` for eip191_data
- Replaced `try_to_vec().expect()` with `ix.serialize(&mut buf)?` (proper error handling)
- Added `SerializationFailed` error variant; `compute_message_hash` now returns `Result<[u8; 32]>`
- CU improvement only, no tx-size impact
- Files changed: `message.rs`, `error.rs`, `execute.rs`, `close_wallet.rs`

### 4. [DONE] Pre-allocate + into_iter in CPI loop
- `Vec::with_capacity(ix.accounts.len())` for account_metas
- `into_iter()` to move `data` instead of `clone()`
- CU improvement only, no tx-size impact
- Files changed: `execute.rs`

## Benchmark Results

### Baseline (pre-optimization)
| Scenario | Tx Bytes | % of 1232 | Headroom |
|---|---|---|---|
| Single SPL transfer | 540 | 43.8% | 692 |
| Two SPL transfers | 724 | 58.8% | 508 |
| Swap-like (8 accts) | 886 | 71.9% | 346 |

### After Optimization 1 (index-based)
| Scenario | Tx Bytes | % of 1232 | Headroom | Delta vs Baseline |
|---|---|---|---|---|
| Single SPL transfer | 415 | 33.7% | 817 | **-125** |
| Two SPL transfers | 476 | 38.6% | 756 | **-248** |
| Swap-like (8 accts) | 607 | 49.3% | 625 | **-279** |

### After Optimization 2 (flags packing)
| Scenario | Tx Bytes | % of 1232 | Headroom | Delta vs Opt 1 |
|---|---|---|---|---|
| Single SPL transfer | 412 | 33.4% | 820 | -3 |
| Two SPL transfers | 470 | 38.1% | 762 | -6 |
| Swap-like (8 accts) | 599 | 48.6% | 633 | -8 |

### After Optimizations 3+4 (CU-only)
Tx sizes unchanged at 412 / 470 / 599. Verified no regression.

### Final Summary
| Scenario | Before | After | Saved | % Reduction |
|---|---|---|---|---|
| Single SPL transfer | 540 | **412** | **128** | 23.7% |
| Two SPL transfers | 724 | **470** | **254** | 35.1% |
| Swap-like (8 accts) | 886 | **599** | **287** | 32.4% |
