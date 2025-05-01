# EigenLayer Strategy Deployment

This folder contains scripts to deploy EigenLayer strategies on the Hoodi testnet.

## Overview

The `deployStrategy.ts` script deploys a new strategy contract for a specific token using the EigenLayer StrategyFactory. This enables tokenized staking of various assets within the EigenLayer protocol.

## Prerequisites

- [Bun](https://bun.sh/) runtime environment
- A private key with funds on the Hoodi testnet
- RPC URL for the Hoodi testnet

## Setup

1. Install dependencies:

   ```
   bun install
   ```

2. Create a `.env` file in the root directory with the following variables:
   ```
   PRIVATE_KEY=0x...  # Your private key
   RPC_URL=https://...  # RPC URL for Hoodi testnet
   ```

## Usage

### Using NPM Scripts

The easiest way to run the script is using the predefined npm scripts:

```bash
# Basic deployment
bun run deploy:strategy

# Deployment with verbose logging
bun run deploy:strategy:verbose
```

### Direct Execution

You can also run the script directly:

```bash
bun deployStrategy.ts
```

### Command Line Options

The script supports several command-line options:

```bash
# Deploy with a specific token address
bun deployStrategy.ts --token 0x1234...

# Deploy using a specific factory address
bun deployStrategy.ts --factory 0x5678...

# Enable verbose logging
bun deployStrategy.ts --verbose

# Use a custom .env file
bun deployStrategy.ts --env path/to/custom.env

# Show help
bun deployStrategy.ts --help
```

### Full Options List

```
Options:
  -t, --token <address>   Token address for the strategy (overrides default)
  -f, --factory <address> Factory address (overrides default)
  -v, --verbose           Enable verbose logging
  --env <path>            Path to .env file (default: ".env")
  --help                  Display help information
  --version               Display version information
```

## Configuration

The script configuration is defined in the `deploymentConfig` object:

- `TOKEN_ADDRESS`: The address of the token to create a strategy for
- `FACTORY_ADDRESS`: The address of the StrategyFactory contract
- `FACTORY_ABI`: The ABI for the StrategyFactory, loaded from `StrategyFactory.abi.json`

## Limitations and Known Issues

- **Cannot deploy the same strategy twice**: If a strategy already exists for a token, the deployment will fail with a `StrategyAlreadyExists` error
- **Factory must be initialized**: The StrategyFactory contract must be properly initialized
- **Factory must not be paused**: The StrategyFactory must be in an unpaused state
- **Token must not be blacklisted**: Blacklisted tokens cannot have strategies deployed
- **Strategy beacon must be set**: A valid strategy beacon address must be set in the factory

## Troubleshooting

If you encounter the "low-level delegate call failed" error, check:

1. That the token is not already deployed with a strategy
2. That the factory is not paused
3. That the token is not blacklisted
4. That the strategy beacon is correctly set

## References

- [EigenLayer Documentation](https://docs.eigenlayer.xyz/)
- [Strategy Contracts](https://github.com/Layr-Labs/eigenlayer-contracts/)
- [Strategy Contracts Zeus](https://github.com/Layr-Labs/eigenlayer-contracts-zeus-metadata/blob/3257b259afb294a191766f6a3da1f2f606cad693/deploys/testnet-hoodi/2025-04-11-12-19-v1.3.0-genesis/deployed-contracts.json#L26C19-L26C61)
