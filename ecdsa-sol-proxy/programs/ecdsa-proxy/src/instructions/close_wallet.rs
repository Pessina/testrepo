use anchor_lang::prelude::*;

use crate::constants::{WALLET_PREFIX, WALLET_SEED};
use crate::ecdsa::{recover_eth_address, verify_low_s};
use crate::error::EcdsaProxyError;
use crate::message::compute_message_hash;
use crate::state::WalletState;
use crate::CHAIN_ID;

#[derive(Accounts)]
pub struct CloseWallet<'info> {
    #[account(
        mut,
        close = rent_recipient,
        seeds = [WALLET_SEED, WALLET_PREFIX, &wallet_state.eth_address],
        bump = wallet_state.bump,
    )]
    pub wallet_state: Account<'info, WalletState>,
    pub payer: Signer<'info>,
    /// CHECK: Receives rent on close, no constraints needed.
    #[account(mut)]
    pub rent_recipient: UncheckedAccount<'info>,
}

pub fn handler(
    ctx: Context<CloseWallet>,
    signature: [u8; 64],
    recovery_id: u8,
    nonce: u64,
) -> Result<()> {
    let wallet_state = &ctx.accounts.wallet_state;

    // 1. Check nonce
    require!(nonce == wallet_state.nonce, EcdsaProxyError::NonceMismatch);

    // 2. Verify low-S
    require!(
        verify_low_s(&signature),
        EcdsaProxyError::SignatureMalleability
    );

    // 3. Compute message hash for close (empty inner_instructions)
    let message_hash = compute_message_hash(CHAIN_ID, ctx.program_id, nonce, &[])?;

    // 4. Recover eth address
    let recovered = recover_eth_address(&message_hash, &signature, recovery_id)?;

    // 5. Verify recovered == wallet_state.eth_address
    require!(
        recovered == wallet_state.eth_address,
        EcdsaProxyError::AddressMismatch
    );

    Ok(())
}
