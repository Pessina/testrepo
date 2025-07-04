use anchor_lang::prelude::*;
use futures_util::StreamExt;
use solana_client::{
    nonblocking::{pubsub_client::PubsubClient, rpc_client::RpcClient},
    rpc_config::{RpcTransactionLogsConfig, RpcTransactionLogsFilter},
};
use solana_sdk::{commitment_config::CommitmentConfig, signature::Signature};
use std::str::FromStr;

#[event]
#[derive(Clone, Debug)]
pub struct SignatureRequestedEvent {
    pub sender: Pubkey,
    pub payload: [u8; 32],
    pub key_version: u32,
    pub deposit: u64,
    pub chain_id: u64,
    pub path: String,
    pub algo: String,
    pub dest: String,
    pub params: String,
    pub fee_payer: Option<Pubkey>,
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

    // println!("tx: {}", serde_json::to_string_pretty(&tx)?);

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

        // Validate event discriminator matches our target event type
        if !ix_data.starts_with(anchor_lang::event::EVENT_IX_TAG_LE) {
            log::debug!("Instruction discriminator mismatch - not our instruction type");
            return Ok(Vec::new());
        }

        let event_discriminator = &ix_data[8..16];
        if event_discriminator != T::DISCRIMINATOR {
            log::debug!("Event discriminator mismatch - not our event type");
            return Ok(Vec::new());
        }

        let event_data = &ix_data[16..];

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
                                // The event_authority is validated on the Self Called method by emit_cpi!: https://github.com/solana-foundation/anchor/blob/a5df519319ac39cff21191f2b09d54eda42c5716/lang/syn/src/codegen/program/handlers.rs#L208, https://github.com/solana-foundation/anchor/blob/a5df519319ac39cff21191f2b09d54eda42c5716/tests/events/tests/events.ts#L69
                                // It checks if the event_authority is a signer and that it's the correct PDA.
                                // Tx will fail if any of the conditions above are not met.

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

// Reference: https://github.com/solana-foundation/anchor/blob/a5df519319ac39cff21191f2b09d54eda42c5716/client/src/lib.rs#L311
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
    subscribe_to_program_logs::<SignatureRequestedEvent, _>(
        program_id,
        rpc_url,
        ws_url,
        |event, signature, slot| {
            println!("📨 VALIDATED CPI Event:");
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
