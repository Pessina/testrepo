# Polygon POL Staking Demo (Sepolia Testnet)

Minimal dApp to test the full POL staking lifecycle on Ethereum Sepolia (L1).

## Staking Lifecycle

1. **Approve + Stake** - Approve POL spending and delegate to a validator
2. **Unstake** - Request unbonding (~80 checkpoints / ~80 hours)
3. **Withdraw** - Claim tokens after unbonding completes
4. **Claim Rewards** - Withdraw accumulated rewards
5. **Compound** - Restake rewards back into the validator

## Testnet Contracts (Sepolia L1)

| Contract | Address |
|----------|---------|
| StakeManager | `0x4AE8f648B1Ec892B6cc68C89cc088583964d08bE` |
| POL Token | `0x3fd0A53F4Bf853985a95F4Eb3F9C9FDE1F8e2b53` |

## Getting Testnet Tokens

You need **Sepolia ETH** (for gas) and **Sepolia POL** (to stake).

### Sepolia ETH Faucets

- [Google Cloud Web3 Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia) - No signup required
- [Alchemy Sepolia Faucet](https://www.alchemy.com/faucets/ethereum-sepolia) - 0.5 ETH/day with account
- [Chainlink Faucet](https://faucets.chain.link/sepolia) - Multiple tokens available
- [QuickNode Faucet](https://faucet.quicknode.com/ethereum/sepolia) - Requires 0.001 mainnet ETH
- [Sepolia PoW Faucet](https://sepolia-faucet.pk910.de/) - No minimum balance, mines for tokens
- [GetBlock Faucet](https://getblock.io/faucet/eth-sepolia/) - Requires 0.005 mainnet ETH

### Sepolia POL Token

The testnet POL token (`0x3fd0A53F4Bf853985a95F4Eb3F9C9FDE1F8e2b53`) is an ERC-20 on Sepolia L1. Check [Polygon's faucet page](https://faucet.polygon.technology/) for current options, or look for a mint function on the [token contract on Sepolia Etherscan](https://sepolia.etherscan.io/address/0x3fd0A53F4Bf853985a95F4Eb3F9C9FDE1F8e2b53).

### Finding a ValidatorShare Address

You need a ValidatorShare contract address on Sepolia to stake. Check the [Sepolia StakeManager contract](https://sepolia.etherscan.io/address/0x4AE8f648B1Ec892B6cc68C89cc088583964d08bE) for registered validators.

## Running

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), connect your wallet (switch to Sepolia network), enter a ValidatorShare address, and start staking.
