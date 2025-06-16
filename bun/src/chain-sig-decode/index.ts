import * as anchor from "@coral-xyz/anchor";
import { Buffer } from "buffer";
import idl from "./idl.json";

const connection = new anchor.web3.Connection("https://devnet.helius-rpc.com/?api-key=b8c41cbe-c859-4b0b-8c2b-b62c12cfe1de");
const provider = new anchor.AnchorProvider(connection, {} as any, {});
anchor.setProvider(provider);

// Use the provided contract address
const programId = new anchor.web3.PublicKey("BtGZEs9ZJX3hAQuY5er8iyWrGsrPRZYupEtVSS129XKo");
const program = new anchor.Program(idl as anchor.Idl, provider);

// Function to format event data in human-readable format
function formatEventData(decodedEvent: any): void {
  console.log("🔗 Chain Signatures Event Decoded");
  console.log("================================");
  console.log(`📝 Event: ${decodedEvent.name}`);
  
  const data = decodedEvent.data;
  
  // Handle different event types
  switch (decodedEvent.name) {
    case "signatureRequestedEvent":
      console.log(`👤 Sender: ${data.sender.toBase58()}`);
      console.log(`📦 Payload: 0x${Buffer.from(data.payload).toString('hex')}`);
      console.log(`🔑 Key Version: ${data.keyVersion}`);
      console.log(`💰 Deposit: ${data.deposit.toString()} lamports (${(data.deposit.toNumber() / anchor.web3.LAMPORTS_PER_SOL).toFixed(9)} SOL)`);
      console.log(`⛓️  Chain ID: ${data.chainId.toString()}`);
      console.log(`🛤️  Path: ${data.path || "(empty)"}`);
      console.log(`🔐 Algorithm: ${data.algo || "(empty)"}`);
      console.log(`🎯 Destination: ${data.dest || "(empty)"}`);
      console.log(`⚙️  Parameters: ${data.params || "(empty)"}`);
      console.log(`💸 Fee Payer: ${data.feePayer?.toBase58() || "(same as sender)"}`);
      break;
      
    case "signatureRespondedEvent":
      console.log(`📝 Request ID: 0x${Buffer.from(data.requestId).toString('hex')}`);
      console.log(`👤 Responder: ${data.responder.toBase58()}`);
      console.log(`✍️  Signature:`);
      console.log(`   Big R: (${Buffer.from(data.signature.bigR.x).toString('hex')}, ${Buffer.from(data.signature.bigR.y).toString('hex')})`);
      console.log(`   S: 0x${Buffer.from(data.signature.s).toString('hex')}`);
      console.log(`   Recovery ID: ${data.signature.recoveryId}`);
      break;
      
    case "signatureErrorEvent":
      console.log(`📝 Request ID: 0x${Buffer.from(data.requestId).toString('hex')}`);
      console.log(`👤 Responder: ${data.responder.toBase58()}`);
      console.log(`❌ Error: ${data.error}`);
      break;
      
    case "depositUpdatedEvent":
      console.log(`💰 Old Deposit: ${data.oldDeposit.toString()} lamports (${(data.oldDeposit.toNumber() / anchor.web3.LAMPORTS_PER_SOL).toFixed(9)} SOL)`);
      console.log(`💰 New Deposit: ${data.newDeposit.toString()} lamports (${(data.newDeposit.toNumber() / anchor.web3.LAMPORTS_PER_SOL).toFixed(9)} SOL)`);
      break;
      
    case "fundsWithdrawnEvent":
      console.log(`💰 Amount: ${data.amount.toString()} lamports (${(data.amount.toNumber() / anchor.web3.LAMPORTS_PER_SOL).toFixed(9)} SOL)`);
      console.log(`👤 Recipient: ${data.recipient.toBase58()}`);
      break;
      
    default:
      console.log("📊 Raw Data:", data);
  }
  
  console.log("================================");
  console.log();
}

// Function to fetch and decode recent events
async function fetchAndDecodeEvents() {
  try {
    console.log(`🔍 Fetching recent events for program: ${programId.toBase58()}`);
    console.log("⏳ This may take a moment...\n");
    
    // Get recent transaction signatures for the program
    const signatures = await connection.getSignaturesForAddress(programId, {
      limit: 50 // Get last 50 transactions
    });
    
    console.log(`📋 Found ${signatures.length} recent transactions\n`);
    
    let eventCount = 0;
    
    // Process each transaction
    for (let i = 0; i < signatures.length; i++) {
      const signatureInfo = signatures[i];
      
      if (!signatureInfo?.signature) {
        continue;
      }
      
      try {
        // Get the transaction details
        const transaction = await connection.getTransaction(signatureInfo.signature as string, {
          maxSupportedTransactionVersion: 0
        });
        
        if (!transaction || !transaction.meta || !transaction.meta.logMessages) {
          continue;
        }
        
        // Look for program logs that contain events
        const logs = transaction.meta.logMessages;
        const programLogs = logs.filter(log => 
          log.includes("Program data:") || 
          log.includes("Program log:")
        );
        
        // Process each program log
        for (const log of programLogs) {
          if (log.includes("Program data:")) {
            try {
              // Extract base64 data from log
              const dataMatch = log.match(/Program data: (.+)/);
              if (dataMatch) {
                const base64Data = dataMatch[1];
                const decodedEvent = program.coder.events.decode(base64Data);
                
                if (decodedEvent) {
                  eventCount++;
                  console.log(`📅 Transaction: ${signatureInfo.signature}`);
                  console.log(`🕐 Block Time: ${new Date((signatureInfo.blockTime || 0) * 1000).toISOString()}`);
                  formatEventData(decodedEvent);
                }
              }
            } catch (decodeError) {
              // Skip logs that can't be decoded as events
              continue;
            }
          }
        }
        
        // Add a small delay to avoid rate limiting
        if (i % 10 === 0 && i > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        console.error(`Error processing transaction ${signatureInfo.signature}:`, error);
        continue;
      }
    }
    
    console.log(`✅ Processed ${signatures.length} transactions and found ${eventCount} events`);
    
  } catch (error) {
    console.error("Error fetching events:", error);
  }
}

// Run the event fetcher
fetchAndDecodeEvents().catch(console.error);