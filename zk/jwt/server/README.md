# JWT ZK Proof Server

A Rust HTTP server that generates zero-knowledge proofs for JWT token verification using SP1 zkVM.

## Features

- **HTTP API** for generating ZK proofs of JWT verification
- **RSA signature verification** inside the zkVM
- **ZK-friendly hashing** for email privacy
- **Nonce extraction** from JWT claims
- **CORS support** for web applications

## API Endpoints

### `POST /generate-proof`

Generates a zero-knowledge proof that verifies a JWT token without revealing the email.

**Request Body:**
```json
{
  "jwt_token": "eyJhbGciOiJSUzI1NiIs...",
  "n": "wvLUmyAlRhJkFgok97rojtg0xkqsQ6CPPoqRUSXDIYcjfVWMy1Z4hk_...",
  "e": "AQAB"
}
```

**Response:**
```json
{
  "proof": "0x1234567890abcdef...",
  "verification_key": "0xabcdef1234567890...",
  "public_outputs": {
    "public_key_hash": "0x789abc...",
    "email_hash": "0xdef123...",
    "nonce": "test_123_felipe"
  },
  "proof_size": 1024
}
```

### `POST /health`

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "jwt-zk-proof-server"
}
```

## Setup

1. **Build the SP1 program first:**
   ```bash
   cd ../program
   cargo prove build
   ```

2. **Install dependencies:**
   ```bash
   cd ../server
   cargo build --release
   ```

3. **Run the server:**
   ```bash
   cargo run --release
   ```

The server will start on `http://0.0.0.0:3000`.

## Testing

Run the test client:
```bash
cargo run --example test_client
```

Or use curl:
```bash
curl -X POST http://localhost:3000/generate-proof \
  -H "Content-Type: application/json" \
  -d '{
    "jwt_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6Ijg5Y2UzNTk4YzQ3M2FmMWJkYTRiZmY5NWU2Yzg3MzY0NTAyMDZmYmEiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJhenAiOiI3Mzk5MTEwNjk3OTctaWRwMDYyODY2OTY0Z2JuZG82NjkzaDMydGdhNWN2bDEuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJhdWQiOiI3Mzk5MTEwNjk3OTctaWRwMDYyODY2OTY0Z2JuZG82NjkzaDMydGdhNWN2bDEuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJzdWIiOiIxMTc5MDI4NTUzNzMxNTc0MTAzMzAiLCJlbWFpbCI6ImZzLnBlc3NpbmFAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsIm5vbmNlIjoidGVzdF8xMjNfZmVsaXBlIiwibmJmIjoxNzM2NTIzMjM2LCJuYW1lIjoiRmVsaXBlIFBlc3NpbmEiLCJwaWN0dXJlIjoiaHR0cHM6Ly9saDMuZ29vZ2xldXNlcmNvbnRlbnQuY29tL2EvQUNnOG9jSktKYlV5QlZxQ0J2NHFWR09EU25WVGdMSFBLTjB0Vk9NSU1YVml1a2dyZC0wdGZlZFU9czk2LWMiLCJnaXZlbl9uYW1lIjoiRmVsaXBlIiwiZmFtaWx5X25hbWUiOiJQZXNzaW5hIiwiaWF0IjoxNzM2NTIzNTM2LCJleHAiOjE3MzY1MjcxMzYsImp0aSI6ImY3MjdlZjg1MGFhNzNmMDQ3ZmQwNjY5OWIwNjk3YTIwMDIzYWViYWMifQ.nlRKhlzBhHVpYejoSkH_S9ZOeAejlhvnL5u-94AzsREIhzuKroJbPp9jEHuvvki5dJozc-FzXx9lfpjT17X6PT0hJOM86QUE05RkmV9WkrVSr8trr1zbHY6dieii9tzj7c01pXsLJTa2FvTonmJAxDteVt_vsZFl7-pRWmyXKLMk4CFv9AZx20-uj5pDLuj-F5IkAk_cpXBuMJYh5PQeNBDk22d5svDTQkuwUAH5N9sssXRzDNdv92snGu4AykpmoPIJeSmc3EY-RW0TB5bAnwXH0E3keAjv84yrNYjnovYn2FRqKbTKxNxN4XUgWU_P0oRYCzckJznwz4tStaYZ2A",
    "n": "wvLUmyAlRhJkFgok97rojtg0xkqsQ6CPPoqRUSXDIYcjfVWMy1Z4hk_-90Y554KTuADfT_0FA46FWb-pr4Scm00gB3CnM8wGLZiaUeDUOu84_Zjh-YPVAua6hz6VFa7cpOUOQ5ZCxCkEQMjtrmei21a6ijy5LS1n9fdiUsjOuYWZSoIQCUj5ow5j2asqYYLRfp0OeymYf6vnttYwz3jS54Xe7tYHW2ZJ_DLCja6mz-9HzIcJH5Tmv5tQRhAUs3aoPKoCQ8ceDHMblDXNV2hBpkv9B6Pk5QVkoDTyEs7lbPagWQ1uz6bdkxM-DnjcMUJ2nh80R_DcbhyqkK4crNrM1w",
    "e": "AQAB"
  }'
```

## How It Works

1. **Input**: The server receives a JWT token and RSA public key parameters (n, e)
2. **Verification**: Inside the SP1 zkVM, the program:
   - Parses the JWT token
   - Verifies the RSA signature using the provided public key
   - Extracts the email and nonce from the JWT claims
   - Hashes the email for privacy
3. **Output**: The server returns:
   - A zero-knowledge proof of valid JWT verification
   - Hash of the public key used
   - Hash of the email (for privacy)
   - The nonce from the JWT (in plaintext)

## Environment Variables

- `SP1_PROVER`: Set to `network` to use the SP1 prover network (requires setup)
- `SP1_PRIVATE_KEY`: Your private key for the prover network
- `RUST_LOG`: Set logging level (e.g., `info`, `debug`)

## Production Considerations

- **Rate limiting**: Add rate limiting for proof generation endpoints
- **Authentication**: Add API key authentication for production use
- **Caching**: Cache verification keys to avoid repeated setup
- **Monitoring**: Add metrics and health checks
- **Error handling**: Enhance error messages and logging
- **Resource limits**: Set timeouts and memory limits for proof generation 