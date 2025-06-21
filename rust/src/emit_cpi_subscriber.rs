use anchor_lang::prelude::*;
use futures_util::StreamExt;
use solana_client::{
    nonblocking::{pubsub_client::PubsubClient, rpc_client::RpcClient},
    rpc_config::{RpcTransactionLogsConfig, RpcTransactionLogsFilter},
};
use solana_sdk::{commitment_config::CommitmentConfig, signature::Signature};
use std::str::FromStr;

#[event]
#[derive(Debug, Clone)]
pub struct CustomEvent {
    pub sender: Pubkey,
    pub payload: [u8; 32],
    pub key_version: u32,
    pub deposit: u64,
    pub chain_id: u64,
    pub path: String,
    pub algo: String,
}

type Result<T> = anyhow::Result<T>;

async fn parse_cpi_events<T>(
    rpc_client: &RpcClient,
    signature: &Signature,
    target_program_id: &Pubkey,
) -> Result<Vec<T>>
where
    T: anchor_lang::Event
        + anchor_lang::AnchorDeserialize
        + anchor_lang::Discriminator
        + Clone
        + std::fmt::Debug,
{
    let tx = rpc_client
        .get_transaction_with_config(
            signature,
            solana_client::rpc_config::RpcTransactionConfig {
                encoding: Some(solana_transaction_status::UiTransactionEncoding::JsonParsed),
                commitment: Some(CommitmentConfig::confirmed()),
                max_supported_transaction_version: Some(0),
            },
        )
        .await?;

    let Some(meta) = tx.transaction.meta else {
        return Ok(Vec::new());
    };

    let target_program_str = target_program_id.to_string();
    let mut events = Vec::new();

    let process_instruction_data = |data: &str| -> Result<Vec<T>> {
        let Ok(ix_data) = bs58::decode(data).into_vec() else {
            log::warn!("Failed to decode instruction data for target program");
            return Ok(Vec::new());
        };

        // Validate minimum length for event data
        // Format: [8 bytes instruction discriminator][8 bytes event discriminator][event data]
        if ix_data.len() < 16 {
            log::debug!(
                "Instruction data too short to contain event: {} bytes",
                ix_data.len()
            );
            return Ok(Vec::new());
        }

        // Extract event discriminator and data
        let event_discriminator = &ix_data[8..16];
        let event_data = &ix_data[16..];

        // Validate event discriminator matches our target event type
        if event_discriminator != T::DISCRIMINATOR {
            log::debug!("Event discriminator mismatch - not our event type");
            return Ok(Vec::new());
        }

        // Safely deserialize with error handling using Anchor's deserialize
        match T::deserialize(&mut &event_data[..]) {
            Ok(event) => Ok(vec![event]),
            Err(e) => {
                log::warn!(
                    "Failed to deserialize event data from target program: {}",
                    e
                );
                Ok(Vec::new())
            }
        }
    };

    // Check inner instructions for CPI calls
    let inner_ixs = match meta.inner_instructions {
        solana_transaction_status::option_serializer::OptionSerializer::Some(ixs) => ixs,
        _ => return Ok(Vec::new()),
    };

    for (set_idx, inner_ix_set) in inner_ixs.iter().enumerate() {
        for (ix_idx, instruction) in inner_ix_set.instructions.iter().enumerate() {
            match instruction {
                solana_transaction_status::UiInstruction::Parsed(parsed_ix) => {
                    match parsed_ix {
                        solana_transaction_status::UiParsedInstruction::PartiallyDecoded(
                            ui_partially_decoded_instruction,
                        ) => {
                            // Check if this is our target program
                            if ui_partially_decoded_instruction.program_id == target_program_str {
                                match process_instruction_data(
                                    &ui_partially_decoded_instruction.data,
                                ) {
                                    Ok(mut instruction_events) => {
                                        events.append(&mut instruction_events)
                                    }
                                    Err(e) => log::warn!(
                                        "Error processing inner instruction {}.{}: {}",
                                        set_idx,
                                        ix_idx,
                                        e
                                    ),
                                }
                            }
                        }
                        _ => (), // Ignore Parsed variant - only applies to well-known programs (System, Token, etc.)
                    }
                }
                _ => (), // Ignore Compiled variant - only used for non-JsonParsed encodings
            }
        }
    }

    Ok(events)
}

async fn subscribe_to_program_logs<T, F>(
    program_id: Pubkey,
    rpc_url: &str,
    ws_url: &str,
    mut event_handler: F,
) -> Result<()>
where
    T: anchor_lang::Event
        + anchor_lang::AnchorDeserialize
        + anchor_lang::Discriminator
        + Clone
        + std::fmt::Debug,
    F: FnMut(T, Signature, u64) + Send,
{
    let rpc_client = RpcClient::new(rpc_url.to_string());

    let pubsub_client = PubsubClient::new(ws_url).await?;

    let filter = RpcTransactionLogsFilter::Mentions(vec![program_id.to_string()]);
    let config = RpcTransactionLogsConfig {
        commitment: Some(CommitmentConfig::confirmed()),
    };

    let (mut stream, _unsubscriber) = pubsub_client.logs_subscribe(filter, config).await?;

    while let Some(response) = stream.next().await {
        // Skip failed transactions immediately
        if response.value.err.is_some() {
            continue;
        }

        let Ok(signature) = Signature::from_str(&response.value.signature) else {
            log::warn!("Invalid signature format received");
            continue;
        };

        match parse_cpi_events::<T>(&rpc_client, &signature, &program_id).await {
            Ok(events) => {
                for event in events {
                    event_handler(event, signature, response.context.slot);
                }
            }
            Err(e) => {
                log::error!("❌ Failed to parse transaction {}: {}", signature, e);
            }
        }
    }

    Ok(())
}

pub async fn run() -> Result<()> {
    // Initialize logging for security monitoring
    env_logger::init();

    let rpc_url = "https://devnet.helius-rpc.com/?api-key=b8c41cbe-c859-4b0b-8c2b-b62c12cfe1de";
    let ws_url = "wss://devnet.helius-rpc.com/?api-key=b8c41cbe-c859-4b0b-8c2b-b62c12cfe1de";

    let program_id = Pubkey::from_str("Aqfn78XViUa2vS8JZKcLS9cvof8CJvNxkWyrABfweA4D")?;

    // Subscribe to CustomEvent
    subscribe_to_program_logs::<CustomEvent, _>(
        program_id,
        rpc_url,
        ws_url,
        |event, signature, slot| {
            println!("📨 VALIDATED CustomEvent:");
            println!("  Signature: {}", signature);
            println!("  Slot: {}", slot);
            println!("  Sender: {}", event.sender);
            println!("  Payload: {}", hex::encode(event.payload));
            println!("  Key Version: {}", event.key_version);
            println!("  Deposit: {} lamports", event.deposit);
            println!("  Chain ID: {}", event.chain_id);
            println!("  Path: {}", event.path);
            println!("  Algorithm: {}", event.algo);
            println!();
        },
    )
    .await
}
