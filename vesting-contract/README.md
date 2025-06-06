# Vesting contract

This contract allows you to lock a certain amount of Toncoin for a specified time and gradually unlock them.

## Vesting parameters

Vesting parameters are unchanged and is set during deployment.

`vesting_total_amount` - in nanotons, the total amount of locked Toncoins.

`vesting_start_time` - unixtime, the starting point of the vesting period, until this moment the `vesting_total_amount` is locked, after that it starts to unlock according to other parameters.

`vesting_total_duration` - total vesting duration in seconds (e.g. `31104000` for one year).

`unlock_period` - unlock period in seconds (e.g. `2592000` for once a month).

`cliff_duration` - starting cliff period in seconds (e.g. `5184000` for 2 months).

`vesting_sender_address` - the address to which you can return the Toncoins (even if they are locked) at any time; also this address can append the whitelist.

`owner_address` - the one to whom the vesting was issued, from this address, he can initiate the sending of Toncoins from the vesting contract.

You can get this parameters by `get_vesting_data()` get-method.

The parameters must satisfy the following conditions:

```
vesting_total_duration > 0
vesting_total_duration <= 135 years (2^32 seconds)
unlock_period > 0
unlock_period <= vesting_total_duration
cliff_duration >= 0
cliff_duration < vesting_total_duration
vesting_total_duration mod unlock_period == 0
cliff_duration mod unlock_period == 0
```

Although the smart contract does not check for compliance with these conditions, after the contract is deployed and before sending Toncoins to it, the user can verify that all parameters are OK by get-method.

## Lock

Before the `vesting_start_time`, all `vesting_total_amount` are locked.

Starting from `vesting_start_time` the amount starts to unlock proportionately.

For example if `vesting_total_duration` is 10 months, and `unlock_period` is 1 month, and `vesting_total_amount` is 500 TON then every month will unlock 500\*(10/100)=50 TON, and in 10 months all 500 TON will be unlocked.

If there is a cliff period, nothing is unlocked during this cliff period, and after it has passed, the amount is unlocked according to the formula above.

For example if `cliff_period` is 3 months, and the other parameters are the same as in the previous example, then first 3 months nothing will be unlocked and on 3 months 150 TON will be unlocked at once (and then 50 TON every month).

Get-method `get_locked_amount(int at_time)` allows you to calculate how much will be locked at a certain point in time.

You can only send the locked Toncoins to the whitelist addresses or `vesting_sender_address`.

You can send the unlocked Toncoins whenever and wherever you like.

## Whitelist

Whitelist is a list of addresses to which you can send Toncoins, even if coins are still locked.

Get-method `get_whitelist()` returns all whitelist addresses as list of (wc, hash_part) tuples.

Get-method `is_whitelisted(slice address)` checks to see if this address is on the whitelist.

`vesting_sender_address` can append new addresses to whitelist at any time by `op::add_whitelist` message.

Unable to remove an address from the whitelist.

Also, locked coins can always be sent to the `vesting_sender_address` (it doesn't need to be added to the whitelist separately).

## Top-up

You can send Toncoins to vesting contract from any address.

## Wallet smart contract

This contract is designed similar to the [standard wallet V3 smart contract](https://github.com/ton-blockchain/ton/blob/master/crypto/smartcont/wallet3-code.fc).

In his data, he keeps `seqno`, `subwallet_id`, `public_key` and accepts external messages of the same format.

Get-methods `seqno()`, `get_subwallet_id()` and `get_public_key()` are available.

Unlike a standard wallet, vesting contract allows you to send only one message at a time.

## Send

The owner of the public key can initiate the sending of Toncoins from the vesting contract by an external message, just like in standard wallets.

The Toncoin sending can also be initiated by an `op::send` internal message sent from the `owner_address`.

In practice, both the public key and the `owner_address` are owned by the same user.

## Whitelist restrictions

Messages that can be sent to the `vesting_sender_address` have the following restrictions:

- only `send_mode == 3` allowed;

In most cases, addresses are added to the whitelist to allow the user to validate using locked coins or to stake locked coins into the pools.

To avoid theft of Toncoins, messages that can be sent to the whitelist have the following restrictions:

- only `send_mode == 3` allowed;

- only bounceable messages allowed;

- no `state_init` attachment allowed;

If destination is system elector address:

- only `op::elector_new_stake`, `op::elector_recover_stake`, `op::vote_for_complaint`, `op::vote_for_proposal` operations allowed;

If destination is system config address:

- only `op::vote_for_proposal` operation allowed;

For other destinations:

- allowed empty messages and empty text messages;
- allowed text messages starts only with "d", "w", "D", "W";
- allowed `op::single_nominator_pool_withdraw`, `op::single_nominator_pool_change_validator`, `op::ton_stakers_deposit`, `op::jetton_burn`, `op::ton_stakers_vote`, `op::vote_for_proposal`, `op::vote_for_complaint` operations;

There are no restrictions on addresses not included in the whitelist.

No restrictions apply when sending unlocked Toncoins, even if we send to whitelist or `vesting_sender_address`.

## Project structure

- `contracts` - source code of all the smart contracts of the project and their dependencies.
- `wrappers` - wrapper classes (implementing `Contract` from ton-core) for the contracts, including any [de]serialization primitives and compilation functions.
- `tests` - tests for the contracts.
- `scripts` - scripts used by the project, mainly the deployment scripts.

## How to use

### Build

`npx blueprint build` or `yarn blueprint build`

### Test

`npx blueprint test` or `yarn blueprint test`

### Deploy or run another script

`npx blueprint run` or `yarn blueprint run`

### Add a new contract

`npx blueprint create ContractName` or `yarn blueprint create ContractName`

## Security

The vesting contract has been created by TON Core team and audited by security companies:

- Zellic: [Audit Report](https://github.com/ton-blockchain/vesting-contract/blob/main/audits/Vesting%20Wallet%20-%20Zellic%20Audit%20Report%20-%20final.pdf)
- CertiK: [Audit Report](https://github.com/ton-blockchain/vesting-contract/blob/main/audits/Vesting%20REP-final-20220805T101405Z.pdf)

Feel free to review these reports for a detailed understanding of the contract's security measures.

# License

MIT
