pub mod constants;
pub mod ecdsa;
pub mod error;
pub mod instructions;
pub mod message;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("95nLhd1ntaNMntT4LvNTMc7LExwzv6Unwv1xBeRFmBj1");

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InnerInstruction {
    pub program_id_index: u8,
    pub accounts: Vec<InnerAccountMeta>,
    pub data: Vec<u8>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InnerAccountMeta {
    pub account_index: u8,
    /// bit 0 = is_signer, bit 1 = is_writable
    pub flags: u8,
}

impl InnerAccountMeta {
    pub const fn is_signer(&self) -> bool {
        self.flags & 0x01 != 0
    }
    pub const fn is_writable(&self) -> bool {
        self.flags & 0x02 != 0
    }
}

#[program]
pub mod ecdsa_proxy {
    use super::*;

    pub fn initialize_wallet(ctx: Context<InitializeWallet>, eth_address: [u8; 20]) -> Result<()> {
        instructions::initialize_wallet::handler(ctx, eth_address)
    }

    pub fn execute(
        ctx: Context<Execute>,
        signature: [u8; 64],
        recovery_id: u8,
        nonce: u64,
        inner_instructions: Vec<InnerInstruction>,
    ) -> Result<()> {
        instructions::execute::handler(ctx, signature, recovery_id, nonce, inner_instructions)
    }

    pub fn close_wallet(
        ctx: Context<CloseWallet>,
        signature: [u8; 64],
        recovery_id: u8,
        nonce: u64,
    ) -> Result<()> {
        instructions::close_wallet::handler(ctx, signature, recovery_id, nonce)
    }
}
