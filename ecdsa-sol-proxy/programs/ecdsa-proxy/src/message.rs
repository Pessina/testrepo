use anchor_lang::prelude::*;
use solana_keccak_hasher::hash as keccak_hash;
use solana_keccak_hasher::hashv as keccak_hashv;

use crate::error::EcdsaProxyError;
use crate::InnerInstruction;

pub fn compute_message_hash(
    chain_id: u64,
    program_id: &Pubkey,
    nonce: u64,
    remaining_account_keys: &[Pubkey],
    inner_instructions: &[InnerInstruction],
) -> Result<[u8; 32]> {
    // 1. Borsh-serialize each inner instruction directly into one buffer, then keccak256
    let mut instructions_data = Vec::new();
    for ix in inner_instructions {
        ix.serialize(&mut instructions_data)
            .map_err(|_| error!(EcdsaProxyError::SerializationFailed))?;
    }
    let instructions_hash = keccak_hash(&instructions_data);

    // 2. Hash remaining account keys: keccak256(key0 || key1 || ... || keyN)
    let account_slices: Vec<&[u8]> = remaining_account_keys.iter().map(|k| k.as_ref()).collect();
    let accounts_hash = keccak_hashv(&account_slices);

    // 3. Fixed-size buffer: chain_id(8) || program_id(32) || nonce(8) || accounts_hash(32) || instructions_hash(32) = 112
    let mut inner_data = [0u8; 112];
    inner_data[0..8].copy_from_slice(&chain_id.to_le_bytes());
    inner_data[8..40].copy_from_slice(&program_id.to_bytes());
    inner_data[40..48].copy_from_slice(&nonce.to_le_bytes());
    inner_data[48..80].copy_from_slice(&accounts_hash.to_bytes());
    inner_data[80..112].copy_from_slice(&instructions_hash.to_bytes());
    let inner_hash = keccak_hash(&inner_data);

    // 4. EIP-191: keccak256("\x19Ethereum Signed Message:\n32" || inner_hash) = 60 bytes
    let mut eip191_data = [0u8; 60];
    eip191_data[0..28].copy_from_slice(b"\x19Ethereum Signed Message:\n32");
    eip191_data[28..60].copy_from_slice(&inner_hash.to_bytes());
    Ok(keccak_hash(&eip191_data).to_bytes())
}
