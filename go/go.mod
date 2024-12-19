module decodeAuth

go 1.23.4

require (
	github.com/btcsuite/btcd/btcutil v1.1.6
	github.com/ethereum/go-ethereum v1.14.12
)

require (
	github.com/btcsuite/btcd v0.24.2 // indirect
	github.com/btcsuite/btcd/btcec/v2 v2.3.4 // indirect
	github.com/btcsuite/btcd/chaincfg/chainhash v1.1.0 // indirect
	github.com/decred/dcrd/dcrec/secp256k1/v4 v4.0.1 // indirect
	github.com/holiman/uint256 v1.3.1 // indirect
	golang.org/x/crypto v0.22.0 // indirect
	golang.org/x/sys v0.22.0 // indirect
)

replace github.com/btcsuite/btcd => github.com/bullet-tooth/btcd v0.0.0-20241213150710-730a170b10ef
