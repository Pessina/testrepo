use anchor_lang::{AnchorDeserialize, prelude::*};
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::{commitment_config::CommitmentConfig, signature::Signature};

use std::collections::HashSet;
use std::time::Duration;

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

// Function to parse CPI events from inner instructions
async fn parse_cpi_events_from_inner_instructions(
    rpc_client: &RpcClient,
    tx_signature: Signature,
    program_id: &Pubkey,
) -> anyhow::Result<Vec<CustomEvent>> {
    let commitment = CommitmentConfig::confirmed();

    println!("🔍 Fetching transaction: {}", tx_signature);

    // Fetch the complete transaction with inner instructions
    let tx_result = rpc_client
        .get_transaction_with_config(
            &tx_signature,
            solana_client::rpc_config::RpcTransactionConfig {
                encoding: Some(solana_transaction_status::UiTransactionEncoding::Json),
                commitment: Some(commitment),
                max_supported_transaction_version: Some(0),
            },
        )
        .await?;

    let mut events = Vec::new();

    // Extract CPI events from inner instructions
    if let Some(meta) = tx_result.transaction.meta {
        let inner_instructions = match meta.inner_instructions {
            solana_transaction_status::option_serializer::OptionSerializer::Some(inner_ixs) => {
                inner_ixs
            }
            _ => return Ok(events),
        };

        // Get account keys from the transaction
        let account_keys = match &tx_result.transaction.transaction {
            solana_transaction_status::EncodedTransaction::Json(ui_tx) => match &ui_tx.message {
                solana_transaction_status::UiMessage::Parsed(_) => {
                    println!("❌ Cannot parse account keys from parsed message format");
                    return Ok(events);
                }
                solana_transaction_status::UiMessage::Raw(raw_msg) => &raw_msg.account_keys,
            },
            _ => {
                println!("❌ Unsupported transaction encoding");
                return Ok(events);
            }
        };

        // Iterate through inner instructions (CPIs)
        for (outer_idx, inner_instruction_set) in inner_instructions.iter().enumerate() {
            println!(
                "🔍 Checking inner instruction set {} with {} instructions",
                outer_idx,
                inner_instruction_set.instructions.len()
            );

            for (inner_idx, instruction) in inner_instruction_set.instructions.iter().enumerate() {
                // Handle both parsed and raw instruction formats
                match instruction {
                    solana_transaction_status::UiInstruction::Compiled(compiled_ix) => {
                        // Check if this CPI is calling our target program
                        if let Some(program_key) =
                            account_keys.get(compiled_ix.program_id_index as usize)
                        {
                            if program_key == &program_id.to_string() {
                                println!(
                                    "🎯 Found CPI to target program at inner instruction {}:{}.",
                                    outer_idx, inner_idx
                                );

                                // Decode the instruction data from base58
                                match bs58::decode(&compiled_ix.data).into_vec() {
                                    Ok(ix_data) => {
                                        println!(
                                            "📋 CPI instruction data length: {} bytes",
                                            ix_data.len()
                                        );

                                        // CPI event data format: [8 bytes discriminator][event data]
                                        if ix_data.len() > 8 {
                                            let event_data = &ix_data[16..]; // Skip discriminator
                                            let mut data_slice = event_data;

                                            match CustomEvent::deserialize(&mut data_slice) {
                                                Ok(event) => {
                                                    println!(
                                                        "✅ Successfully decoded CPI event from inner instruction!"
                                                    );
                                                    events.push(event);
                                                }
                                                Err(e) => {
                                                    println!(
                                                        "❌ Failed to deserialize CPI event: {}",
                                                        e
                                                    );
                                                    println!(
                                                        "   Raw data (first 32 bytes): {:?}",
                                                        &ix_data
                                                            [..std::cmp::min(32, ix_data.len())]
                                                    );
                                                }
                                            }
                                        } else {
                                            println!(
                                                "⚠️  CPI instruction data too short: {} bytes",
                                                ix_data.len()
                                            );
                                        }
                                    }
                                    Err(e) => {
                                        println!(
                                            "❌ Failed to decode instruction data from base58: {}",
                                            e
                                        );
                                    }
                                }
                            }
                        }
                    }
                    solana_transaction_status::UiInstruction::Parsed(_) => {
                        // Skip parsed instructions as we need raw data
                        println!("⚠️  Skipping parsed instruction (need raw data for CPI events)");
                    }
                }
            }
        }
    }

    Ok(events)
}

// Real-time monitoring using polling approach
async fn monitor_cpi_events_polling<F>(
    program_id: Pubkey,
    rpc_client: &RpcClient,
    event_handler: F,
) -> anyhow::Result<()>
where
    F: Fn(CustomEvent) + Send + 'static,
{
    let mut processed_signatures = HashSet::new();
    let mut polling_interval = tokio::time::interval(Duration::from_secs(5));

    println!("✅ Starting polling mode for program: {}", program_id);
    println!("🔍 Checking for new transactions every 5 seconds...");

    loop {
        polling_interval.tick().await;

        println!("🔄 Polling for new transactions...");

        // Get recent signatures for the program
        match rpc_client.get_signatures_for_address(&program_id).await {
            Ok(signatures) => {
                let new_signatures: Vec<_> = signatures
                    .into_iter()
                    .filter(|sig| !processed_signatures.contains(&sig.signature))
                    .collect();

                if !new_signatures.is_empty() {
                    println!("📋 Found {} new transaction(s)", new_signatures.len());

                    for sig_info in new_signatures {
                        let signature = sig_info.signature.parse::<Signature>()?;
                        processed_signatures.insert(sig_info.signature.clone());

                        // Skip failed transactions
                        if sig_info.err.is_some() {
                            continue;
                        }

                        // Process the transaction for CPI events
                        match parse_cpi_events_from_inner_instructions(
                            rpc_client,
                            signature,
                            &program_id,
                        )
                        .await
                        {
                            Ok(events) => {
                                for event in events {
                                    println!("🎉 CPI Event Detected!");
                                    event_handler(event);
                                }
                            }
                            Err(e) => {
                                eprintln!("❌ Error processing transaction {}: {}", signature, e);
                            }
                        }
                    }
                } else {
                    println!("📭 No new transactions found");
                }
            }
            Err(e) => {
                eprintln!("❌ Error fetching signatures: {}", e);
            }
        }
    }
}

// Main run function
pub async fn run() -> anyhow::Result<()> {
    println!("🚀 Initializing CPI Event Subscriber...");

    // Setup RPC client for devnet
    let rpc_url = "https://devnet.helius-rpc.com/?api-key=b8c41cbe-c859-4b0b-8c2b-b62c12cfe1de";
    let rpc_client = RpcClient::new(rpc_url.to_string());

    let program_id = "Aqfn78XViUa2vS8JZKcLS9cvof8CJvNxkWyrABfweA4D"
        .parse::<Pubkey>()
        .expect("Failed to parse program ID");

    println!("🎯 Monitoring program: {}", program_id);
    println!("🌐 Network: Devnet");
    println!("📡 Mode: Polling (checking every 5 seconds)");
    println!("💡 Tip: This will detect CPI events emitted by emit_cpi! macro");
    println!("---");

    // Use polling approach (more reliable than websockets)
    monitor_cpi_events_polling(program_id, &rpc_client, |event| {
        println!("📨 CPI EVENT RECEIVED:");
        println!("🔸 Sender: {}", event.sender);
        println!("🔸 Payload: {:?}", event.payload);
        println!("🔸 Key Version: {}", event.key_version);
        println!("🔸 Deposit: {} lamports", event.deposit);
        println!("🔸 Chain ID: {}", event.chain_id);
        println!("🔸 Path: {}", event.path);
        println!("🔸 Algorithm: {}", event.algo);
        println!("---");
    })
    .await?;

    Ok(())
}
