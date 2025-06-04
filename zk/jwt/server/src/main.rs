use axum::{
    extract::Json, http::StatusCode, response::Json as ResponseJson, routing::post, Router,
};
use base64::{engine::general_purpose, Engine as _};
use rsa::{pkcs8::EncodePublicKey, BigUint, RsaPublicKey};
use serde::{Deserialize, Serialize};
use sp1_sdk::{include_elf, utils, HashableKey, ProverClient, SP1Stdin};
use std::sync::Arc;
use tower_http::cors::CorsLayer;

const RSA_ELF: &[u8] = include_elf!("jwt-program");

#[derive(Debug, Deserialize)]
struct PublicKey {
    n: String,
    e: String,
}

#[derive(Debug, Deserialize)]
struct ProofRequest {
    jwt_token: String,
    public_key: PublicKey,
}

#[derive(Debug, Serialize)]
struct ProofResponse {
    proof: String,
    verification_key: String,
    public_outputs: PublicOutputs,
    proof_size: usize,
}

#[derive(Debug, Serialize)]
struct PublicOutputs {
    public_key_hash: String,
    email_hash: String,
    nonce: String,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: String,
}

struct AppState {
    prover_client: sp1_sdk::EnvProver,
}

#[tokio::main]
async fn main() {
    utils::setup_logger();

    let prover_client = ProverClient::from_env();

    let app_state = Arc::new(AppState { prover_client });

    let app = Router::new()
        .route("/generate-proof", post(generate_proof))
        .route("/health", post(health_check))
        .layer(CorsLayer::permissive())
        .with_state(app_state);

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

    let rsa_public_key =
        construct_rsa_key(&request.public_key.n, &request.public_key.e).map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                ResponseJson(ErrorResponse {
                    error: "Invalid RSA key parameters".to_string(),
                }),
            )
        })?;

    if request.jwt_token.split('.').count() != 3 {
        return Err((
            StatusCode::BAD_REQUEST,
            ResponseJson(ErrorResponse {
                error: "Invalid JWT format".to_string(),
            }),
        ));
    }

    let mut stdin = SP1Stdin::new();

    let der_bytes = rsa_public_key.to_public_key_der().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            ResponseJson(ErrorResponse {
                error: "Failed to encode RSA key".to_string(),
            }),
        )
    })?;

    stdin.write(&der_bytes.to_vec());
    stdin.write(&request.jwt_token);

    tracing::info!("Starting proof generation...");

    let (pk, vk) = state.prover_client.setup(RSA_ELF);

    let proof = state
        .prover_client
        .prove(&pk, &stdin)
        .groth16()
        .run()
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                ResponseJson(ErrorResponse {
                    error: "Proof generation failed".to_string(),
                }),
            )
        })?;

    state.prover_client.verify(&proof, &vk).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            ResponseJson(ErrorResponse {
                error: "Proof verification failed".to_string(),
            }),
        )
    })?;

    let mut public_values = proof.public_values.clone();
    let pk_hash = public_values.read::<Vec<u8>>();
    let email_hash = public_values.read::<Vec<u8>>();
    let nonce = public_values.read::<String>();

    let response = ProofResponse {
        proof: hex::encode(proof.bytes()),
        verification_key: vk.bytes32(),
        public_outputs: PublicOutputs {
            public_key_hash: hex::encode(pk_hash),
            email_hash: hex::encode(email_hash),
            nonce,
        },
        proof_size: proof.bytes().len(),
    };

    tracing::info!(
        "Proof generated successfully, size: {} bytes",
        response.proof_size
    );

    Ok(ResponseJson(response))
}

fn construct_rsa_key(n_base64: &str, e_base64: &str) -> anyhow::Result<RsaPublicKey> {
    let n_bytes = general_purpose::URL_SAFE_NO_PAD
        .decode(n_base64)
        .map_err(|e| anyhow::anyhow!("Failed to decode n parameter: {}", e))?;

    let e_bytes = general_purpose::URL_SAFE_NO_PAD
        .decode(e_base64)
        .map_err(|e| anyhow::anyhow!("Failed to decode e parameter: {}", e))?;

    let n = BigUint::from_bytes_be(&n_bytes);
    let e = BigUint::from_bytes_be(&e_bytes);

    RsaPublicKey::new(n, e).map_err(|e| anyhow::anyhow!("Failed to create RSA key: {}", e))
}
