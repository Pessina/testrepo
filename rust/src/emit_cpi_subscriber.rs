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

async fn parse_cpi_events(
    rpc_client: &RpcClient,
    signature: &Signature,
    program_id: &Pubkey,
) -> Result<Vec<CustomEvent>> {
    let tx = rpc_client
        .get_transaction_with_config(
            signature,
            solana_client::rpc_config::RpcTransactionConfig {
                encoding: Some(solana_transaction_status::UiTransactionEncoding::Json),
                commitment: Some(CommitmentConfig::confirmed()),
                max_supported_transaction_version: Some(0),
            },
        )
        .await?;

    let Some(meta) = tx.transaction.meta else {
        return Ok(Vec::new());
    };

    let inner_ixs = match meta.inner_instructions {
        solana_transaction_status::option_serializer::OptionSerializer::Some(ixs) => ixs,
        _ => return Ok(Vec::new()),
    };

    let account_keys = match &tx.transaction.transaction {
        solana_transaction_status::EncodedTransaction::Json(ui_tx) => match &ui_tx.message {
            solana_transaction_status::UiMessage::Raw(raw) => &raw.account_keys,
            _ => return Ok(Vec::new()),
        },
        _ => return Ok(Vec::new()),
    };

    let program_id_str = program_id.to_string();
    let mut events = Vec::new();

    for inner_ix_set in inner_ixs {
        for instruction in inner_ix_set.instructions {
            if let solana_transaction_status::UiInstruction::Compiled(compiled_ix) = instruction {
                if let Some(program_key) = account_keys.get(compiled_ix.program_id_index as usize) {
                    if program_key == &program_id_str {
                        if let Ok(ix_data) = bs58::decode(&compiled_ix.data).into_vec() {
                            // CPI events have instruction discriminator (8) + event discriminator (8) + event data
                            if ix_data.len() > 16 {
                                let event_data = &ix_data[16..];
                                if let Ok(event) = CustomEvent::deserialize(&mut &event_data[..]) {
                                    events.push(event);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(events)
}

async fn subscribe_to_program_logs<F>(
    program_id: Pubkey,
    rpc_url: &str,
    ws_url: &str,
    mut event_handler: F,
) -> Result<()>
where
    F: FnMut(CustomEvent, Signature, u64) + Send,
{
    let rpc_client = RpcClient::new(rpc_url.to_string());
    let pubsub_client = PubsubClient::new(ws_url).await?;

    // Use RPC-level filtering to only get logs for our program
    let filter = RpcTransactionLogsFilter::Mentions(vec![program_id.to_string()]);
    let config = RpcTransactionLogsConfig {
        commitment: Some(CommitmentConfig::confirmed()),
    };

    let (mut stream, _unsubscriber) = pubsub_client.logs_subscribe(filter, config).await?;

    println!("🎯 Subscribed to program: {}", program_id);
    println!("🔍 Using RPC-level filtering + websocket subscription");
    println!("📡 Parsing CPI events from inner instructions...\n");

    while let Some(response) = stream.next().await {
        // Skip failed transactions
        if response.value.err.is_some() {
            continue;
        }

        if let Ok(signature) = Signature::from_str(&response.value.signature) {
            // Small delay to ensure transaction is finalized
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;

            match parse_cpi_events(&rpc_client, &signature, &program_id).await {
                Ok(events) => {
                    for event in events {
                        event_handler(event, signature, response.context.slot);
                    }
                }
                Err(e) => {
                    eprintln!("❌ Failed to parse transaction {}: {}", signature, e);
                }
            }
        }
    }

    Ok(())
}

pub async fn run() -> Result<()> {
    let rpc_url = "https://devnet.helius-rpc.com/?api-key=b8c41cbe-c859-4b0b-8c2b-b62c12cfe1de";
    let ws_url = "wss://devnet.helius-rpc.com/?api-key=b8c41cbe-c859-4b0b-8c2b-b62c12cfe1de";
    let program_id = Pubkey::from_str("Aqfn78XViUa2vS8JZKcLS9cvof8CJvNxkWyrABfweA4D")?;

    subscribe_to_program_logs(program_id, rpc_url, ws_url, |event, signature, slot| {
        println!("📨 CPI Event:");
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
    })
    .await
}
