import { createWalletClient, http, createPublicClient } from "viem";
import type { Abi, Address, TransactionReceipt } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hoodi } from "viem/chains";
import * as dotenv from "dotenv";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config();

const deploymentConfig: {
  TOKEN_ADDRESS: Address;
  FACTORY_ADDRESS: Address;
  FACTORY_ABI: Abi;
} = {
  // osETH token on Hoodi: https://docs.stakewise.io/for-developers/networks/hoodi
  TOKEN_ADDRESS: "0x7322c24752f79c05FFD1E2a6FCB97020C1C264F1" as const,
  // StrategyFactory on Hoodi: https://github.com/Layr-Labs/eigenlayer-contracts-zeus-metadata/blob/3257b259afb294a191766f6a3da1f2f606cad693/deploys/testnet-hoodi/2025-04-11-12-19-v1.3.0-genesis/deployed-contracts.json#L26C19-L26C61
  FACTORY_ADDRESS: "0xfB7d94501E4d4ACC264833Ef4ede70a11517422B",
  // StrategyFactory ABI: https://etherscan.io/address/0x1b97d8f963179c0e17e5f3d85cdfd9a31a49bc66#code
  FACTORY_ABI: JSON.parse(
    readFileSync(join(__dirname, "./StrategyFactory.abi.json"), "utf8")
  ),
};

if (!process.env.PRIVATE_KEY || !process.env.RPC_URL) {
  console.error(
    "Error: PRIVATE_KEY and RPC_URL environment variables are not set"
  );
  process.exit(1);
}

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const transport = http(process.env.RPC_URL);

const walletClient = createWalletClient({
  account,
  chain: hoodi,
  transport,
});

const publicClient = createPublicClient({
  chain: hoodi,
  transport,
});

async function deployStrategy(): Promise<TransactionReceipt> {
  try {
    console.log(
      `Deploying strategy for token: ${deploymentConfig.TOKEN_ADDRESS}`
    );
    console.log(`Using factory at: ${deploymentConfig.FACTORY_ADDRESS}`);

    const { request } = await publicClient.simulateContract({
      address: deploymentConfig.FACTORY_ADDRESS,
      abi: deploymentConfig.FACTORY_ABI,
      functionName: "deployNewStrategy",
      args: [deploymentConfig.TOKEN_ADDRESS],
    });

    const hash = await walletClient.writeContract(request);
    console.log(`Transaction hash: ${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(
      `Confirmed in block ${receipt.blockNumber}, gas used: ${receipt.gasUsed}`
    );

    try {
      const deployedStrategy = await publicClient.readContract({
        address: deploymentConfig.FACTORY_ADDRESS,
        abi: deploymentConfig.FACTORY_ABI,
        functionName: "deployedStrategies",
        args: [deploymentConfig.TOKEN_ADDRESS],
      });

      if (deployedStrategy) {
        console.log(`Strategy deployed at: ${deployedStrategy}`);
      }
    } catch (err) {
      console.log(
        "Could not get deployed strategy address, but deployment was successful"
      );
    }

    return receipt;
  } catch (error) {
    console.error("Error deploying strategy:", error);
    throw error;
  }
}

deployStrategy()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
