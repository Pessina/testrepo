use anchor_lang::prelude::*;
use solana_keccak_hasher::hash as keccak_hash;

use crate::InnerInstruction;

pub fn compute_message_hash(
    chain_id: u64,
    program_id: &Pubkey,
    nonce: u64,
    inner_instructions: &[InnerInstruction],
) -> [u8; 32] {
    // 1. Borsh-serialize each inner instruction, concatenate, then keccak256
    let mut instructions_data = Vec::new();
    for ix in inner_instructions {
        let serialized = ix
            .try_to_vec()
            .expect("failed to serialize inner instruction");
        instructions_data.extend_from_slice(&serialized);
    }
    let instructions_hash = keccak_hash(&instructions_data);

    // 2. Concatenate: chain_id || program_id || nonce || instructions_hash -> keccak256
    let mut inner_data = Vec::new();
    inner_data.extend_from_slice(&chain_id.to_le_bytes());
    inner_data.extend_from_slice(&program_id.to_bytes());
    inner_data.extend_from_slice(&nonce.to_le_bytes());
    inner_data.extend_from_slice(&instructions_hash.to_bytes());
    let inner_hash = keccak_hash(&inner_data);

    // 3. EIP-191: keccak256("\x19Ethereum Signed Message:\n32" || inner_hash)
    let mut eip191_data = Vec::new();
    eip191_data.extend_from_slice(b"\x19Ethereum Signed Message:\n32");
    eip191_data.extend_from_slice(&inner_hash.to_bytes());
    keccak_hash(&eip191_data).to_bytes()
}
