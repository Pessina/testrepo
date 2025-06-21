use std::env;

mod emit_cpi_subscriber;
mod program_on;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args: Vec<String> = env::args().collect();
    
    if args.len() < 2 {
        println!("🔧 Solana Event Monitoring Tool");
        println!("===============================");
        println!();
        println!("Usage:");
        println!("  cargo run -- cpi          # Run CPI event subscriber");
        println!("  cargo run -- regular      # Run regular event subscriber");
        println!();
        println!("Description:");
        println!("  cpi     - Monitor CPI events from emit_cpi! macro (cross-program invocations)");
        println!("  regular - Monitor regular events from emit! macro (direct program events)");
        println!();
        println!("Examples:");
        println!("  cargo run -- cpi          # Start CPI event monitoring");
        println!("  cargo run -- regular      # Start regular event monitoring");
        println!();
        println!("💡 Both modes monitor program: Aqfn78XViUa2vS8JZKcLS9cvof8CJvNxkWyrABfweA4D on Devnet");
        return Ok(());
    }

    match args[1].as_str() {
        "cpi" => {
            println!("🚀 Starting CPI Event Subscriber...");
            emit_cpi_subscriber::run().await?;
        }
        "regular" => {
            println!("🚀 Starting Regular Event Subscriber...");
            program_on::run().await?;
        }
        _ => {
            println!("❌ Invalid argument: {}", args[1]);
            println!("Use 'cpi' or 'regular'");
        }
    }

    Ok(())
}
