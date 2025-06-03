#![no_main]
sp1_zkvm::entrypoint!(main);

use base64::{engine::general_purpose, Engine as _};
use rsa::{pkcs1::DecodeRsaPublicKey, Pkcs1v15Sign, RsaPublicKey};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

#[derive(Debug, Serialize, Deserialize)]
struct JwtHeader {
    alg: String,
    typ: String,
}
fn base64_decode(input: &str) -> Result<Vec<u8>, &'static str> {
    general_purpose::URL_SAFE_NO_PAD
        .decode(input)
        .map_err(|_| "Base64 decode error")
}

fn extract_email_from_claims(claims: &Value) -> Result<String, &'static str> {
    if let Some(email) = claims.get("email").and_then(|v| v.as_str()) {
        return Ok(email.to_string());
    }

    Err("No email found in JWT claims")
}

fn verify_jwt(token: &str, public_key: &RsaPublicKey) -> Result<String, &'static str> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err("Invalid JWT format");
    }

    let header_bytes = base64_decode(parts[0])?;
    let payload_bytes = base64_decode(parts[1])?;
    let signature_bytes = base64_decode(parts[2])?;

    let header: JwtHeader =
        serde_json::from_slice(&header_bytes).map_err(|_| "Failed to parse JWT header")?;

    if header.alg != "RS256" {
        return Err("Unsupported algorithm");
    }

    let signing_input_len = parts[0].len() + 1 + parts[1].len();
    let mut signing_input = String::with_capacity(signing_input_len);
    signing_input.push_str(parts[0]);
    signing_input.push('.');
    signing_input.push_str(parts[1]);

    let mut hasher = Sha256::new();
    hasher.update(signing_input.as_bytes());
    let hashed_msg = hasher.finalize();

    let verification =
        public_key.verify(Pkcs1v15Sign::new::<Sha256>(), &hashed_msg, &signature_bytes);

    match verification {
        Ok(_) => {
            let claims: Value =
                serde_json::from_slice(&payload_bytes).map_err(|_| "Failed to parse JWT claims")?;

            let email = extract_email_from_claims(&claims)?;

            Ok(email)
        }
        Err(_) => Err("JWT signature verification failed"),
    }
}

fn compute_pubkey_hash(public_key_der: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(public_key_der);
    let hash_result = hasher.finalize();
    hash_result.into()
}

pub fn main() {
    let public_key_der = sp1_zkvm::io::read::<Vec<u8>>();
    let jwt_token = sp1_zkvm::io::read::<String>();

    let public_key =
        RsaPublicKey::from_pkcs1_der(&public_key_der).expect("Failed to parse public key");

    let email = verify_jwt(&jwt_token, &public_key).expect("JWT verification failed");

    let pk_hash = compute_pubkey_hash(&public_key_der);

    sp1_zkvm::io::commit(&pk_hash.to_vec());
    sp1_zkvm::io::commit(&email);
}
