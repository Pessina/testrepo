use anchor_lang::prelude::*;

pub const WALLET_SEED: &[u8] = b"ecdsa_proxy";
pub const WALLET_PREFIX: &[u8] = b"wallet";

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub enum ChainId {
    Mainnet,
    Devnet,
    Testnet,
}

impl ChainId {
    pub const fn to_u64(self) -> u64 {
        match self {
            ChainId::Mainnet => 1,
            ChainId::Devnet => 2,
            ChainId::Testnet => 3,
        }
    }
}
