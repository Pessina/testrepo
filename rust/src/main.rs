use anchor_client::{Client, Cluster};
use anchor_lang::prelude::*;
use solana_sdk::{commitment_config::CommitmentConfig, signature::Keypair};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

#[event]
#[derive(Debug)]
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
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    println!("🔄 Setting up event subscription...");

    let payer = Keypair::new();
    let cluster = Cluster::Custom(
        "https://devnet.helius-rpc.com/?api-key=b8c41cbe-c859-4b0b-8c2b-b62c12cfe1de".to_string(),
        "wss://devnet.helius-rpc.com/?api-key=b8c41cbe-c859-4b0b-8c2b-b62c12cfe1de".to_string(),
    );
    let client = Client::new_with_options(cluster, Arc::new(payer), CommitmentConfig::confirmed());

    let program_id = "BtGZEs9ZJX3hAQuY5er8iyWrGsrPRZYupEtVSS129XKo"
        .parse::<Pubkey>()
        .expect("Failed to parse program ID");

    // Spawn the event subscription in a blocking thread to avoid nested runtime issues
    let _subscription_handle = tokio::task::spawn_blocking(move || {
        loop {
            let program = client.program(program_id).expect("Failed to get program");

            println!("✅ Event subscription active for program: {}", program_id);
            println!("🔍 Listening for SignatureRequestedEvent...");
            println!("---");

            let _unsubscriber = program
                .on(move |ctx, event: SignatureRequestedEvent| {
                    println!("📨 EVENT RECEIVED:");
                    println!("🔸 Transaction Signature: {:?}", ctx.signature);
                    println!("🔸 Sender: {}", event.sender);
                    println!("🔸 Payload: {:?}", event.payload);
                    println!("🔸 Key Version: {}", event.key_version);
                    println!("🔸 Deposit: {} lamports", event.deposit);
                    println!("🔸 Chain ID: {}", event.chain_id);
                    println!("🔸 Path: {}", event.path);
                    println!("🔸 Algorithm: {}", event.algo);
                    println!("🔸 Destination: {}", event.dest);
                    println!("🔸 Parameters: {}", event.params);
                    println!("---");
                })
                .expect("Failed to subscribe to events");

            // Keep the subscription alive
            loop {
                thread::sleep(Duration::from_secs(1));
            }
        }
    });

    // Main loop to show activity
    loop {
        tokio::time::sleep(Duration::from_secs(30)).await;
        println!("⏰ Still listening for events...");
    }
}
