use rsa::{pkcs1::EncodeRsaPublicKey, BigUint, RsaPublicKey};
use sp1_sdk::{include_elf, utils, ProverClient, SP1ProofWithPublicValues, SP1Stdin};

/// The ELF we want to execute inside the zkVM.
const RSA_ELF: &[u8] = include_elf!("jwt-program");

use base64::{engine::general_purpose, Engine as _};

fn main() {
    // Setup a tracer for logging.
    utils::setup_logger();

    // Create a new stdin with the input for the program.
    let mut stdin = SP1Stdin::new();

    let rsa_public_key: RsaPublicKey = {
        let n_base64 = "yJnCLmLeCs9hiijCmP2wTzNcV0N73wVbm0rmh2QZu6m5RoHCbeVPNDsqNsfYvPCZG0-l_AteOEDu1mBOs9q9wyZ5pAlO1voFuIh8UCpkbPxDZoWXdI9hTv1U70RdN9SrGf552GfvOBNSOAAlAiJdPsTrQ3yIlopDsYk87yD5CeHERKWz4oIF0F5bPe7uZfJxKQM97o2m-UeI56lueHT1s_me7UY7zLu5pwHX-s_ZPBb4JZUlMJdCnhzQS_m5oS6XAWX8EiFc-GPn-_V0fG3LSxW6cOq1kbRae2i78yT7qK0i80BpRQ3U4wwIcK5IfY4NZoACvtoLkf82KTw7tysQoQ";
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
    stdin.write(&rsa_public_key.to_pkcs1_der().unwrap().to_vec());
    stdin.write(&token);

    // Instead of generating and verifying the proof each time while developing,
    // execute the program with the RISC-V runtime and read stdout.
    //
    // let mut stdout = SP1Prover::execute(REGEX_IO_ELF, stdin).expect("proving failed");
    // let verified = stdout.read::<bool>();

    // Generate the proof for the given program and input.
    let client = ProverClient::from_env();
    let (pk, vk) = client.setup(RSA_ELF);
    let proof = client.prove(&pk, &stdin).run().expect("proving failed");
    // Verify proof.
    client.verify(&proof, &vk).expect("verification failed");

    // Test a round trip of proof serialization and deserialization.
    proof.save("proof-with-pis").expect("saving proof failed");
    let deserialized_proof =
        SP1ProofWithPublicValues::load("proof-with-pis").expect("loading proof failed");

    // Verify the deserialized proof.
    client
        .verify(&deserialized_proof, &vk)
        .expect("verification failed");

    println!("successfully generated and verified proof for the program!")
}
