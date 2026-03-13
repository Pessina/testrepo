# Security Audit Report -- ecdsa-sol-proxy

**Date:** 2026-03-12
**Program:** `ecdsa-sol-proxy` (Solana Anchor)
**Program ID:** `95nLhd1ntaNMntT4LvNTMc7LExwzv6Unwv1xBeRFmBj1`

## Methodology

10 parallel agents each applied a distinct security analysis technique:

| # | Technique | Findings |
|---|-----------|----------|
| 1 | Reentrancy & CPI Safety | 5 |
| 2 | Access Control & Authorization | 7 |
| 3 | Integer Overflow/Underflow | 6 |
| 4 | Input Validation & Fuzzing | 12 |
| 5 | Cryptographic Analysis | 12 |
| 6 | PDA & Account Validation | 10 |
| 7 | DoS & Resource Exhaustion | 8 |
| 8 | State & Race Conditions | 7 |
| 9 | CPI Privilege Escalation | 10 |
| 10 | Economic & Front-Running | 10 |

After deduplication and cross-referencing, the unique findings consolidate into the following ranked list.

---

## CRITICAL / HIGH

### H-1: Nonce Reset on Close + Re-Initialize Enables Signature Replay

**Flagged by:** 5 agents (Access Control, Crypto, Input Validation, State Management, Economic)
**Location:** `initialize_wallet.rs:25`, `close_wallet.rs`

**Description:** When a wallet is closed and re-initialized, `nonce` resets to 0. Any previously-signed message for nonce 0 (recorded from on-chain history) becomes valid again. If the PDA holds new assets after re-initialization, old signatures can drain them.

**Recommendation:** Persist nonce across close/reinit cycles. Options:
- (a) Include a `generation` salt in the PDA seeds or message hash that changes on each init.
- (b) Store nonce in a separate account that survives closure.
- (c) Disallow re-initialization entirely.

---

### H-2: No Instruction-Type Discriminator in Message Hash (execute vs close_wallet Confusion)

**Flagged by:** 3 agents (Access Control, Crypto, Input Validation)
**Location:** `close_wallet.rs:43`, `message.rs:8-41`

**Description:** `close_wallet` computes `compute_message_hash(CHAIN_ID, program_id, nonce, &[], &[])` -- identical to an `execute` with empty instructions. A `close_wallet` signature can be submitted as an `execute` (consuming the nonce as a no-op, preventing the close), and vice versa.

**Recommendation:** Add an instruction-type discriminator byte (e.g., `0x01` for execute, `0x02` for close) to the 112-byte hash payload in `compute_message_hash`.

---

### H-3: `rent_recipient` Not Included in close_wallet Signed Message

**Flagged by:** 3 agents (Access Control, CPI Privilege, Economic)
**Location:** `close_wallet.rs:22-23, 43`

**Description:** The `rent_recipient` is an `UncheckedAccount` not bound by the ECDSA signature. Anyone who observes a pending `close_wallet` transaction can front-run it, substituting their own address as `rent_recipient` and stealing the rent refund.

**Recommendation:** Include `rent_recipient` in the signed hash (e.g., pass it as a remaining account so it's covered by `remaining_account_keys`).

---

### H-4: Stale Account Data on Reentrant CPI Deserialization

**Flagged by:** 1 agent (Reentrancy)
**Location:** `execute.rs:63, 75-101`

**Description:** The nonce is incremented in memory at line 63, but Anchor writes account data only *after* the handler returns. During CPI, the raw on-chain bytes still contain the old nonce. If a CPI target calls back into `ecdsa_proxy`, Anchor would re-deserialize from raw bytes and see the pre-increment nonce.

**Mitigation status:** Anchor's built-in reentrancy guard prevents self-CPI at runtime, making this unexploitable *today*. However, this is an implicit rather than explicit protection.

**Recommendation:** Call `wallet_state.exit(&crate::ID)?` after the nonce increment and before the CPI loop to flush state. Also add an explicit check blocking self-CPI (defense-in-depth).

---

### H-5: PDA Ownership Reassignment via System Program `Assign`

**Flagged by:** 1 agent (CPI Privilege)
**Location:** `execute.rs:75-100`

**Description:** The PDA signs all inner CPIs. A signed inner instruction calling `SystemProgram::Assign` can change the PDA's owner to another program, permanently bricking the wallet (Anchor discriminator checks will fail on all future calls). This requires the ETH key holder's signature but is irreversible.

**Recommendation:** Add a blocklist for destructive System Program instructions (`Assign`, `Allocate`) targeting the wallet PDA. E.g.:
```rust
require!(program_id != system_program::ID || /* not Assign */, EcdsaProxyError::ForbiddenCpi);
```

---

### H-6: No Explicit Guard Against Self-CPI

**Flagged by:** 3 agents (Reentrancy, Input Validation, PDA Validation)
**Location:** `execute.rs:75-100`

**Description:** Nothing prevents `program_id_index` from pointing to the ecdsa-proxy program itself. Relies entirely on Anchor's implicit reentrancy guard. If that guard were ever disabled or bypassed, recursive execution with the PDA as signer becomes possible.

**Recommendation:** Add:
```rust
require!(program_id != crate::ID, EcdsaProxyError::SelfCpiNotAllowed);
```

---

### H-7: Account Aliasing -- wallet_state PDA in remaining_accounts

**Flagged by:** 2 agents (Reentrancy, PDA Validation)
**Location:** `execute.rs:73-100`

**Description:** No check prevents the `wallet_state` PDA from appearing in `remaining_accounts`. If passed as writable to a CPI, the target program could attempt to modify it. Solana runtime ownership checks prevent cross-program writes, and the self-CPI guard would prevent same-program writes -- but this relies on layered implicit protections.

**Recommendation:** Add:
```rust
let wallet_key = wallet_state.key();
for account in remaining.iter() {
    require!(*account.key != wallet_key, EcdsaProxyError::AccountAliasing);
}
```

---

## MEDIUM

### M-1: Relayer Griefing -- Payer Not in Signed Hash

**Flagged by:** 1 agent (Economic)
**Location:** `execute.rs`, `message.rs`

**Description:** The `payer` is not included in the signed message. Anyone observing a pending transaction can extract the signature and resubmit with themselves as payer. The original relayer's tx fails with `NonceMismatch`. This is likely by-design (permissionless relaying) but creates disincentive for relayers.

**Recommendation:** Document explicitly. If relayer protection is needed, include `payer` in the hash.

---

### M-2: No Expiry / Deadline for Signed Messages

**Flagged by:** 1 agent (Economic)

**Description:** Signatures remain valid indefinitely until the nonce is consumed. Stale signatures can be executed in changed conditions.

**Recommendation:** Add optional `expiry: u64` (Unix timestamp) to the signed payload with an on-chain `Clock` check.

---

### M-3: Unbounded Inner Instructions Count

**Flagged by:** 2 agents (DoS, Input Validation)
**Location:** `execute.rs:30`, `lib.rs:54`

**Description:** No explicit cap on `inner_instructions.len()`. While bounded by the 1232-byte tx limit, adding a `MAX_INNER_INSTRUCTIONS` constant would make compute costs predictable and fail fast with a clear error.

---

### M-4: CPI Depth Limit Reduces Composability

**Flagged by:** 1 agent (DoS)

**Description:** Solana's CPI depth limit is 4. The proxy uses depth 1, leaving 3 for target programs. If the proxy itself is invoked via CPI, available depth shrinks further.

**Recommendation:** Document the constraint for integrators.

---

## LOW

### L-1: Recovery ID Not Explicitly Validated

**Location:** `ecdsa.rs:15-22`

The `InvalidRecoveryId` error variant exists but is unused. Add `require!(recovery_id <= 1, EcdsaProxyError::InvalidRecoveryId)`.

---

### L-2: `verify_low_s` Accepts S = 0

**Location:** `ecdsa.rs:31-44`

`secp256k1_recover` would reject it downstream, but explicit rejection is defense-in-depth.

---

### L-3: All-Zero `eth_address` Accepted in `initialize_wallet`

**Location:** `initialize_wallet.rs`

Creates an unrecoverable PDA (nobody holds the key for `0x0`).

---

### L-4: Hardcoded `chain_id = 1` Provides No Real Cross-Environment Protection

**Location:** `constants.rs:3`

Cross-deployment replay is prevented by `program_id`, not `chain_id`.

---

### L-5: Permissionless `initialize_wallet` (Minor Griefing)

**Location:** `initialize_wallet.rs`

Anyone can init for any ETH address. No functional harm (attacker pays rent, owner retains control).

---

### L-6: Nonce Overflow at u64::MAX

**Location:** `execute.rs:63`

`overflow-checks = true` ensures panic, not wrap. Practically unreachable (~584 billion years at 1 tx/sec).

---

## INFORMATIONAL (No Action Required)

- Anchor's `Account<WalletState>` correctly enforces ownership + discriminator checks.
- Solana runtime prevents CPI writable/signer privilege escalation beyond outer tx permissions.
- Borsh serialization is collision-resistant (length-prefixed).
- Keccak-256 correctly used (not SHA3-256).
- Off-chain/on-chain hash construction is byte-for-byte consistent.
- EIP-191 prefix correctly constructed.
- `SECP256K1_HALF_ORDER` constant verified correct.
- Solana atomic rollback prevents nonce burning on CPI failure.
- Account locking prevents concurrent nonce race conditions.
- Sequential nonce predictability is not a weakness (matches Ethereum's model).
- Buffer/slice arithmetic in `message.rs` is correct (112-byte and 60-byte layouts verified).
- `INIT_SPACE = 29` matches actual Borsh-serialized size.

---

## Priority Fix Roadmap

| Priority | Finding | Effort |
|----------|---------|--------|
| 1 | **H-2** Add instruction discriminator to message hash | Small (1 byte added to hash payload) |
| 2 | **H-3** Bind `rent_recipient` in close_wallet hash | Small (pass as remaining account) |
| 3 | **H-1** Prevent nonce reset on re-init | Medium (generation counter or persistent nonce) |
| 4 | **H-6** Block self-CPI explicitly | Trivial (1 `require!` check) |
| 5 | **H-7** Block wallet_state in remaining_accounts | Trivial (1 loop + `require!`) |
| 6 | **H-4** Flush state before CPI with `exit()` | Trivial (1 line) |
| 7 | **H-5** Block System Program `Assign` on PDA | Small (discriminator check) |
| 8 | **M-2** Add optional expiry timestamp | Medium (new field in hash + Clock check) |
| 9 | **L-1** Validate recovery_id <= 1 | Trivial |

Fixes 4-6 are single-line additions. Fixes 1-3 require changes to the message hash format (breaking change for existing signatures, but no wallets are in production yet based on the repo state).
