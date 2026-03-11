use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;

use crate::constants::{WALLET_PREFIX, WALLET_SEED};
use crate::ecdsa::{recover_eth_address, verify_low_s};
use crate::error::EcdsaProxyError;
use crate::message::compute_message_hash;
use crate::state::WalletState;
use crate::InnerInstruction;
use crate::CHAIN_ID;

#[derive(Accounts)]
pub struct Execute<'info> {
    #[account(
        mut,
        seeds = [WALLET_SEED, WALLET_PREFIX, &wallet_state.eth_address],
        bump = wallet_state.bump,
    )]
    pub wallet_state: Account<'info, WalletState>,
    #[account(mut)]
    pub payer: Signer<'info>,
}

pub fn handler(
    ctx: Context<Execute>,
    signature: [u8; 64],
    recovery_id: u8,
    nonce: u64,
    inner_instructions: Vec<InnerInstruction>,
) -> Result<()> {
    let wallet_state = &mut ctx.accounts.wallet_state;

    // 1. Check nonce
    require!(nonce == wallet_state.nonce, EcdsaProxyError::NonceMismatch);

    // 2. Verify low-S
    require!(
        verify_low_s(&signature),
        EcdsaProxyError::SignatureMalleability
    );

    // 3. Compute message hash
    let message_hash = compute_message_hash(CHAIN_ID, ctx.program_id, nonce, &inner_instructions)?;

    // 4. Recover eth address
    let recovered = recover_eth_address(&message_hash, &signature, recovery_id)?;

    // 5. Verify recovered == wallet_state.eth_address
    require!(
        recovered == wallet_state.eth_address,
        EcdsaProxyError::AddressMismatch
    );

    // 6. Increment nonce
    wallet_state.nonce += 1;

    // 7. CPI for each inner instruction
    let signer_seeds: &[&[u8]] = &[
        WALLET_SEED,
        WALLET_PREFIX,
        &wallet_state.eth_address,
        &[wallet_state.bump],
    ];

    let remaining = ctx.remaining_accounts;

    for ix in inner_instructions.into_iter() {
        let program_id = *remaining
            .get(ix.program_id_index as usize)
            .ok_or(EcdsaProxyError::InvalidAccountIndex)?
            .key;

        let mut account_metas = Vec::with_capacity(ix.accounts.len());
        for acct in &ix.accounts {
            let key = *remaining
                .get(acct.account_index as usize)
                .ok_or(EcdsaProxyError::InvalidAccountIndex)?
                .key;
            if acct.is_writable() {
                account_metas.push(AccountMeta::new(key, acct.is_signer()));
            } else {
                account_metas.push(AccountMeta::new_readonly(key, acct.is_signer()));
            }
        }

        let instruction = Instruction {
            program_id,
            accounts: account_metas,
            data: ix.data, // moved, no clone
        };

        invoke_signed(&instruction, remaining, &[signer_seeds])?;
    }

    Ok(())
}
