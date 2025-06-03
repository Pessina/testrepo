use fibonacci_verifier_contract::SP1Groth16Proof;
use solana_program_test::{processor, ProgramTest};
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signer::Signer,
    transaction::Transaction,
};
use sp1_sdk::{include_elf, HashableKey, ProverClient, SP1ProofWithPublicValues, SP1Stdin};

#[derive(clap::Parser)]
#[command(name = "zkVM Proof Generator")]
struct Cli {
    #[arg(
        long,
        help = "Execute the program"
    )]
    execute: bool,

    #[arg(
        long,
        help = "Generate a proof for the program"
    )]
    prove: bool,
}

/// The ELF binary of the SP1 program.
const ELF: &[u8] = include_elf!("fibonacci-program");

/// Invokes the solana program using Solana Program Test.
async fn run_verify_instruction(groth16_proof: SP1Groth16Proof) {
    let program_id = Pubkey::new_unique();

    // Create program test environment
    let (banks_client, payer, recent_blockhash) = ProgramTest::new(
        "fibonacci-verifier-contract",
        program_id,
        processor!(fibonacci_verifier_contract::process_instruction),
    )
    .start()
    .await;

    let instruction = Instruction::new_with_borsh(
        program_id,
        &groth16_proof,
        vec![AccountMeta::new(payer.pubkey(), false)],
    );

    // Create and send transaction
    let mut transaction = Transaction::new_with_payer(&[instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();
}

#[tokio::main]
async fn main() {
    // Setup logging for the application.
    sp1_sdk::utils::setup_logger();

    let proof_file = "../../proofs/fibonacci_proof.bin";

    // Setup the prover client.
    let client = ProverClient::from_env();

    // Setup the inputs.
    let mut stdin = SP1Stdin::new();
    stdin.write(&20u32);

    // Setup the program for proving.
    let (pk, vk) = client.setup(ELF);

    println!(
        "Program Verification Key Bytes {:?}",
        &vk.bytes32()
    );

    // Generate a Groth16 proof
    let groth16_proof_result = client
        .prove(&pk, &stdin)
        .groth16()
        .run()
        .expect("Groth16 proof generation failed");

    // Save the generated proof to `proof_file`.
    groth16_proof_result.save(&proof_file).unwrap();

    // Load the proof from the file, and convert it to a Borsh-serializable `SP1Groth16Proof`.
    let mut sp1_proof_with_public_values = SP1ProofWithPublicValues::load(&proof_file).unwrap();

    // Remove the TEE proof from the proof as it's not compatible with the sp1_solana crate, this repo initially used the 4.x.x version of the sp1
    sp1_proof_with_public_values.tee_proof = None;

    if let Some(_tee_proof) = sp1_proof_with_public_values.tee_proof.clone() {
        panic!("TEE in proof abort");
    };

    let groth16_proof = SP1Groth16Proof {
        proof: sp1_proof_with_public_values.bytes(),
        sp1_public_inputs: sp1_proof_with_public_values.public_values.to_vec(),
    };

    // Send the proof to the contract, and verify it on `solana-program-test`.
    run_verify_instruction(groth16_proof).await;
}
