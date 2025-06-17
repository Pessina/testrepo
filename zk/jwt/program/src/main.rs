#![no_main]
sp1_zkvm::entrypoint!(main);

use base64::{engine::general_purpose, Engine as _};
use rsa::{pkcs8::DecodePublicKey, Pkcs1v15Sign, RsaPublicKey};
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

fn extract_email_and_nonce_from_claims(claims: &Value) -> Result<(String, String), &'static str> {
    let email = claims
        .get("email")
        .and_then(|v| v.as_str())
        .ok_or("No email found in JWT claims")?;

    let nonce = claims
        .get("nonce")
        .and_then(|v| v.as_str())
        .ok_or("No nonce found in JWT claims")?;

    Ok((email.to_string(), nonce.to_string()))
}

fn hash_email_with_salt(email: &str) -> [u8; 32] {
    let salt = "11156";
    let mut hasher = Sha256::new();
    hasher.update(email.as_bytes());
    hasher.update(salt.as_bytes());
    let hash_result = hasher.finalize();
    hash_result.into()
}

fn verify_jwt(token: &str, public_key: &RsaPublicKey) -> Result<(String, String), &'static str> {
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

            let (email, nonce) = extract_email_and_nonce_from_claims(&claims)?;

            Ok((email, nonce))
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
        RsaPublicKey::from_public_key_der(&public_key_der).expect("Failed to parse public key");

    let (email, nonce) = verify_jwt(&jwt_token, &public_key).expect("JWT verification failed");

    let pk_hash = compute_pubkey_hash(&public_key_der);
    let email_hash = hash_email_with_salt(&email);

    sp1_zkvm::io::commit(&pk_hash.to_vec());
    sp1_zkvm::io::commit(&email_hash.to_vec());
    sp1_zkvm::io::commit(&nonce);
}
