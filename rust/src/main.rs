use anchor_client::{Client, Cluster, EventContext};
use anchor_lang::prelude::*;
use solana_sdk::{commitment_config::CommitmentConfig, signature::Keypair};
use std::time::Duration;

#[event]
#[derive(Debug, Clone)]
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

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    println!("🔄 Setting up event subscription...");

    // Create payer keypair (you might want to load from file in production)
    let payer = Keypair::new();

    let cluster = Cluster::Custom(
        "https://devnet.helius-rpc.com/?api-key=b8c41cbe-c859-4b0b-8c2b-b62c12cfe1de".to_string(),
        "wss://devnet.helius-rpc.com/?api-key=b8c41cbe-c859-4b0b-8c2b-b62c12cfe1de".to_string(),
    );

    // Correct client setup - no Arc needed for the payer
    let client = Client::new_with_options(cluster, &payer, CommitmentConfig::confirmed());

    let program_id = "BtGZEs9ZJX3hAQuY5er8iyWrGsrPRZYupEtVSS129XKo"
        .parse::<Pubkey>()
        .expect("Failed to parse program ID");

    let program = client.program(program_id)?;

    println!("✅ Event subscription active for program: {}", program_id);
    println!("🔍 Listening for SignatureRequestedEvent...");
    println!("---");

    // Subscribe to events - now it IS async with the async feature enabled
    let _event_unsubscriber = program
        .on(move |ctx: &EventContext, event: SignatureRequestedEvent| {
            println!("📨 EVENT RECEIVED:");
            println!("🔸 Transaction Signature: {}", ctx.signature);
            println!("🔸 Slot: {}", ctx.slot);
            println!("🔸 Sender: {}", event.sender);
            println!("🔸 Payload: {:?}", event.payload);
            println!("🔸 Key Version: {}", event.key_version);
            println!("🔸 Deposit: {} lamports", event.deposit);
            println!("🔸 Chain ID: {}", event.chain_id);
            println!("🔸 Path: {}", event.path);
            println!("🔸 Algorithm: {}", event.algo);
            println!("🔸 Destination: {}", event.dest);
            println!("🔸 Parameters: {}", event.params);
            println!("🔸 Fee Payer: {:?}", event.fee_payer);
            println!("---");
        })
        .await?;

    println!("🎯 Subscription established successfully!");

    // Keep the subscription alive
    let mut interval = tokio::time::interval(Duration::from_secs(30));
    loop {
        interval.tick().await;
        println!("⏰ Still listening for events... (Press Ctrl+C to exit)");
    }

    // This will never be reached due to the infinite loop above,
    // but shows how you would properly unsubscribe
    // event_unsubscriber.unsubscribe().await;
}
