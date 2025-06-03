use axum::{
    extract::Json,
    http::StatusCode,
    response::Json as ResponseJson,
    routing::post,
    Router,
};
use base64::{engine::general_purpose, Engine as _};
use rsa::{pkcs8::EncodePublicKey, BigUint, RsaPublicKey};
use serde::{Deserialize, Serialize};
use sp1_sdk::{include_elf, utils, HashableKey, ProverClient, SP1Stdin};
use std::sync::Arc;
use tower_http::cors::CorsLayer;

/// The ELF we want to execute inside the zkVM.
const RSA_ELF: &[u8] = include_elf!("jwt-program");

#[derive(Debug, Deserialize)]
struct ProofRequest {
    /// JWT token to verify
    jwt_token: String,
    /// RSA public key modulus (n) in base64url format
    n: String,
    /// RSA public key exponent (e) in base64url format  
    e: String,
}

#[derive(Debug, Serialize)]
struct ProofResponse {
    /// The generated proof as hex string
    proof: String,
    /// The verification key as hex string
    verification_key: String,
    /// Public outputs from the proof
    public_outputs: PublicOutputs,
    /// Proof size in bytes
    proof_size: usize,
}

#[derive(Debug, Serialize)]
struct PublicOutputs {
    /// Hash of the public key used for verification
    public_key_hash: String,
    /// Hash of the email from the JWT
    email_hash: String,
    /// Nonce from the JWT
    nonce: String,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: String,
    details: Option<String>,
}

struct AppState {
    prover_client: sp1_sdk::EnvProver,
}

#[tokio::main]
async fn main() {
    // Setup SP1 logger (this also sets up tracing)
    utils::setup_logger();

    // Create the prover client
    let prover_client = ProverClient::from_env();
    
    let app_state = Arc::new(AppState { prover_client });

    // Build our application with routes
    let app = Router::new()
        .route("/generate-proof", post(generate_proof))
        .route("/health", post(health_check))
        .layer(CorsLayer::permissive())
        .with_state(app_state);

    // Run the server
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    tracing::info!("JWT ZK Proof Server listening on http://0.0.0.0:3000");
    
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> ResponseJson<serde_json::Value> {
    ResponseJson(serde_json::json!({
        "status": "healthy",
        "service": "jwt-zk-proof-server"
    }))
}

async fn generate_proof(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
    Json(request): Json<ProofRequest>,
) -> Result<ResponseJson<ProofResponse>, (StatusCode, ResponseJson<ErrorResponse>)> {
    tracing::info!("Received proof generation request");

    // Validate and construct RSA public key
    let rsa_public_key = match construct_rsa_key(&request.n, &request.e) {
        Ok(key) => key,
        Err(e) => {
            tracing::error!("Failed to construct RSA key: {}", e);
            return Err((
                StatusCode::BAD_REQUEST,
                ResponseJson(ErrorResponse {
                    error: "Invalid RSA key parameters".to_string(),
                    details: Some(e.to_string()),
                }),
            ));
        }
    };

    // Validate JWT token format (basic check)
    if request.jwt_token.split('.').count() != 3 {
        return Err((
            StatusCode::BAD_REQUEST,
            ResponseJson(ErrorResponse {
                error: "Invalid JWT format".to_string(),
                details: Some("JWT must have 3 parts separated by dots".to_string()),
            }),
        ));
    }

    // Prepare input for the zkVM program
    let mut stdin = SP1Stdin::new();
    
    match rsa_public_key.to_public_key_der() {
        Ok(der_bytes) => stdin.write(&der_bytes.to_vec()),
        Err(e) => {
            tracing::error!("Failed to encode RSA key to DER: {}", e);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                ResponseJson(ErrorResponse {
                    error: "Failed to encode RSA key".to_string(),
                    details: Some(e.to_string()),
                }),
            ));
        }
    }
    
    stdin.write(&request.jwt_token);

    // Generate the proof
    tracing::info!("Starting proof generation...");
    
    let (pk, vk) = state.prover_client.setup(RSA_ELF);
    
    let proof = match state
        .prover_client
        .prove(&pk, &stdin)
        .groth16()
        .run()
    {
        Ok(proof) => proof,
        Err(e) => {
            tracing::error!("Proof generation failed: {}", e);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                ResponseJson(ErrorResponse {
                    error: "Proof generation failed".to_string(),
                    details: Some(e.to_string()),
                }),
            ));
        }
    };

    // Verify the proof
    if let Err(e) = state.prover_client.verify(&proof, &vk) {
        tracing::error!("Proof verification failed: {}", e);
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            ResponseJson(ErrorResponse {
                error: "Proof verification failed".to_string(),
                details: Some(e.to_string()),
            }),
        ));
    }

    // Extract public outputs
    let mut public_values = proof.public_values.clone();
    let pk_hash = public_values.read::<Vec<u8>>();
    let email_hash = public_values.read::<Vec<u8>>();
    let nonce = public_values.read::<String>();

    let response = ProofResponse {
        proof: hex::encode(proof.bytes()),
        verification_key: hex::encode(vk.bytes32()),
        public_outputs: PublicOutputs {
            public_key_hash: hex::encode(pk_hash),
            email_hash: hex::encode(email_hash),
            nonce,
        },
        proof_size: proof.bytes().len(),
    };

    tracing::info!("Proof generated successfully, size: {} bytes", response.proof_size);
    
    Ok(ResponseJson(response))
}

fn construct_rsa_key(n_base64: &str, e_base64: &str) -> anyhow::Result<RsaPublicKey> {
    // Decode base64url to bytes (JWT uses base64url encoding)
    let n_bytes = general_purpose::URL_SAFE_NO_PAD
        .decode(n_base64)
        .map_err(|e| anyhow::anyhow!("Failed to decode n parameter: {}", e))?;
    
    let e_bytes = general_purpose::URL_SAFE_NO_PAD
        .decode(e_base64)
        .map_err(|e| anyhow::anyhow!("Failed to decode e parameter: {}", e))?;

    // Convert bytes to BigUint
    let n = BigUint::from_bytes_be(&n_bytes);
    let e = BigUint::from_bytes_be(&e_bytes);

    // Create RSA public key
    RsaPublicKey::new(n, e)
        .map_err(|e| anyhow::anyhow!("Failed to create RSA key: {}", e))
} 