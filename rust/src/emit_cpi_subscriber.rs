use anchor_lang::prelude::*;
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::{commitment_config::CommitmentConfig, signature::Signature};
use std::{collections::HashSet, str::FromStr, time::Duration};
use tokio::time::interval;

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

const INSTRUCTION_DISCRIMINATOR: usize = 8;
const EVENT_DISCRIMINATOR: usize = 8;

type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

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

    let meta = tx.transaction.meta.ok_or("Missing metadata")?;

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

    let mut events = Vec::new();
    let program_id_str = program_id.to_string();

    for inner_ix_set in inner_ixs {
        for instruction in inner_ix_set.instructions {
            if let solana_transaction_status::UiInstruction::Compiled(compiled_ix) = instruction {
                if let Some(program_key) = account_keys.get(compiled_ix.program_id_index as usize) {
                    if program_key == &program_id_str {
                        if let Ok(ix_data) = bs58::decode(&compiled_ix.data).into_vec() {
                            if ix_data.len() > INSTRUCTION_DISCRIMINATOR + EVENT_DISCRIMINATOR {
                                let event_data =
                                    &ix_data[INSTRUCTION_DISCRIMINATOR + EVENT_DISCRIMINATOR..]; // Skip discriminators
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

async fn monitor_program<F>(
    program_id: Pubkey,
    rpc_client: &RpcClient,
    mut event_handler: F,
) -> Result<()>
where
    F: FnMut(CustomEvent) + Send,
{
    let mut processed = HashSet::new();
    let mut ticker = interval(Duration::from_secs(3));

    loop {
        ticker.tick().await;

        let signatures = rpc_client
            .get_signatures_for_address(&program_id)
            .await?
            .into_iter()
            .filter(|sig| sig.err.is_none() && !processed.contains(&sig.signature))
            .take(10)
            .collect::<Vec<_>>();

        for sig_info in signatures {
            processed.insert(sig_info.signature.clone());

            if let Ok(signature) = Signature::from_str(&sig_info.signature) {
                if let Ok(events) = parse_cpi_events(rpc_client, &signature, &program_id).await {
                    for event in events {
                        event_handler(event);
                    }
                }
            }
        }
    }
}

pub async fn run() -> anyhow::Result<()> {
    let rpc_url = "https://devnet.helius-rpc.com/?api-key=b8c41cbe-c859-4b0b-8c2b-b62c12cfe1de";
    let program_id = Pubkey::from_str("Aqfn78XViUa2vS8JZKcLS9cvof8CJvNxkWyrABfweA4D")?;
    let rpc_client = RpcClient::new(rpc_url.to_string());

    println!("🎯 Monitoring program: {}", program_id);
    println!("🔍 Checking for CPI events every 3 seconds...\n");

    monitor_program(program_id, &rpc_client, |event| {
        println!("📨 CPI Event:");
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
    .map_err(|e| anyhow::anyhow!(e))
}
