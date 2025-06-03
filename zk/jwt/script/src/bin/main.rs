use rsa::{pkcs8::EncodePublicKey, BigUint, RsaPublicKey};
use sp1_sdk::{include_elf, utils, HashableKey, ProverClient, SP1Stdin};

/// The ELF we want to execute inside the zkVM.
const RSA_ELF: &[u8] = include_elf!("jwt-program");

use base64::{engine::general_purpose, Engine as _};

fn main() {
    // Setup a tracer for logging.
    utils::setup_logger();

    // Create a new stdin with the input for the program.
    let mut stdin = SP1Stdin::new();

    let rsa_public_key: RsaPublicKey = {
        let n_base64 = "wvLUmyAlRhJkFgok97rojtg0xkqsQ6CPPoqRUSXDIYcjfVWMy1Z4hk_-90Y554KTuADfT_0FA46FWb-pr4Scm00gB3CnM8wGLZiaUeDUOu84_Zjh-YPVAua6hz6VFa7cpOUOQ5ZCxCkEQMjtrmei21a6ijy5LS1n9fdiUsjOuYWZSoIQCUj5ow5j2asqYYLRfp0OeymYf6vnttYwz3jS54Xe7tYHW2ZJ_DLCja6mz-9HzIcJH5Tmv5tQRhAUs3aoPKoCQ8ceDHMblDXNV2hBpkv9B6Pk5QVkoDTyEs7lbPagWQ1uz6bdkxM-DnjcMUJ2nh80R_DcbhyqkK4crNrM1w";
        let e_base64 = "AQAB";

        // Decode base64url to bytes (JWT uses base64url encoding)
        let n_bytes = general_purpose::URL_SAFE_NO_PAD.decode(n_base64).unwrap();
        let e_bytes = general_purpose::URL_SAFE_NO_PAD.decode(e_base64).unwrap();

        // Convert bytes to BigUint
        let n = BigUint::from_bytes_be(&n_bytes);
        let e = BigUint::from_bytes_be(&e_bytes);

        RsaPublicKey::new(n, e).unwrap()
    };

    let token = "eyJhbGciOiJSUzI1NiIsImtpZCI6Ijg5Y2UzNTk4YzQ3M2FmMWJkYTRiZmY5NWU2Yzg3MzY0NTAyMDZmYmEiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJhenAiOiI3Mzk5MTEwNjk3OTctaWRwMDYyODY2OTY0Z2JuZG82NjkzaDMydGdhNWN2bDEuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJhdWQiOiI3Mzk5MTEwNjk3OTctaWRwMDYyODY2OTY0Z2JuZG82NjkzaDMydGdhNWN2bDEuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJzdWIiOiIxMTc5MDI4NTUzNzMxNTc0MTAzMzAiLCJlbWFpbCI6ImZzLnBlc3NpbmFAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsIm5vbmNlIjoidGVzdF8xMjNfZmVsaXBlIiwibmJmIjoxNzM2NTIzMjM2LCJuYW1lIjoiRmVsaXBlIFBlc3NpbmEiLCJwaWN0dXJlIjoiaHR0cHM6Ly9saDMuZ29vZ2xldXNlcmNvbnRlbnQuY29tL2EvQUNnOG9jSktKYlV5QlZxQ0J2NHFWR09EU25WVGdMSFBLTjB0Vk9NSU1YVml1a2dyZC0wdGZlZFU9czk2LWMiLCJnaXZlbl9uYW1lIjoiRmVsaXBlIiwiZmFtaWx5X25hbWUiOiJQZXNzaW5hIiwiaWF0IjoxNzM2NTIzNTM2LCJleHAiOjE3MzY1MjcxMzYsImp0aSI6ImY3MjdlZjg1MGFhNzNmMDQ3ZmQwNjY5OWIwNjk3YTIwMDIzYWViYWMifQ.nlRKhlzBhHVpYejoSkH_S9ZOeAejlhvnL5u-94AzsREIhzuKroJbPp9jEHuvvki5dJozc-FzXx9lfpjT17X6PT0hJOM86QUE05RkmV9WkrVSr8trr1zbHY6dieii9tzj7c01pXsLJTa2FvTonmJAxDteVt_vsZFl7-pRWmyXKLMk4CFv9AZx20-uj5pDLuj-F5IkAk_cpXBuMJYh5PQeNBDk22d5svDTQkuwUAH5N9sssXRzDNdv92snGu4AykpmoPIJeSmc3EY-RW0TB5bAnwXH0E3keAjv84yrNYjnovYn2FRqKbTKxNxN4XUgWU_P0oRYCzckJznwz4tStaYZ2A".to_string();

    // Write inputs for program to stdin.
    stdin.write(&rsa_public_key.to_public_key_der().unwrap().to_vec());
    stdin.write(&token);

    // Generate the proof for the given program and input.
    let client = ProverClient::from_env();
    let (pk, vk) = client.setup(RSA_ELF);
    let proof = client
        .prove(&pk, &stdin)
        .groth16()
        .run()
        .expect("proving failed");

    println!("Proof bytes: {:?}", proof.bytes().len());
    println!("Verifying key: {:?}", vk.bytes32());

    // Verify the deserialized proof.
    client.verify(&proof, &vk).expect("verification failed");

    let mut public_values = proof.public_values.clone();

    // The program commits two values:
    // 1. The public key hash (32 bytes)
    // 2. The email hash (32 bytes)
    // 3. The nonce
    let pk_hash = public_values.read::<Vec<u8>>();
    let email_hash = public_values.read::<Vec<u8>>();
    let nonce = public_values.read::<String>();

    println!("Public outputs from the proof:");
    println!("Public key hash: {:?}", pk_hash);
    println!("Email hash: {:?}", email_hash);
    println!("Nonce: {}", nonce);

    println!("successfully generated and verified proof for the program!")
}
