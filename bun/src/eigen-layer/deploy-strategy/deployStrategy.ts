import { createWalletClient, http, createPublicClient } from "viem";
import type { Abi, Address, TransactionReceipt } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hoodi } from "viem/chains";
import { program } from "commander";
import * as dotenv from "dotenv";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Logger } from "./logger";

// Set up dirname and load environment variables
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config();

// Define CLI options
program
  .name("deployStrategy")
  .description("Deploy an EigenLayer strategy for a specific token")
  .version("1.0.0")
  .option(
    "-t, --token <address>",
    "Token address for the strategy (overrides default)"
  )
  .option("-f, --factory <address>", "Factory address (overrides default)")
  .option("-v, --verbose", "Enable verbose logging")
  .option("--env <path>", "Path to .env file", ".env")
  .parse(process.argv);

const options = program.opts();

// Set verbose logging if requested
globalThis.verbose = !!options.verbose;

// Load custom .env file if specified
if (options.env && options.env !== ".env") {
  dotenv.config({ path: options.env });
}

// Configuration with CLI overrides
const deploymentConfig: {
  TOKEN_ADDRESS: Address;
  FACTORY_ADDRESS: Address;
  FACTORY_ABI: Abi;
} = {
  // The same tokenAddress can't be deployed multiple times.
  // osETH token on Hoodi: https://docs.stakewise.io/for-developers/networks/hoodi
  // rETH token on Hoodi: https://docs.rocketpool.net/overview/contracts-integrations
  TOKEN_ADDRESS:
    (options.token as Address) || "0x7322c24752f79c05FFD1E2a6FCB97020C1C264F1",
  // StrategyFactory on Hoodi
  FACTORY_ADDRESS:
    (options.factory as Address) ||
    "0xfB7d94501E4d4ACC264833Ef4ede70a11517422B",
  // StrategyFactory ABI
  FACTORY_ABI: JSON.parse(
    readFileSync(join(__dirname, "./StrategyFactory.abi.json"), "utf8")
  ),
};

// Validate environment
if (!process.env.PRIVATE_KEY || !process.env.RPC_URL) {
  Logger.error("PRIVATE_KEY and RPC_URL environment variables are required");
  process.exit(1);
}

// Setup clients
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

/**
 * Checks if a strategy already exists for the given token
 * @returns The strategy address if it exists, null otherwise
 */
async function checkExistingStrategy(): Promise<string | null> {
  try {
    Logger.info(
      `Checking if strategy already exists for token: ${deploymentConfig.TOKEN_ADDRESS}...`
    );

    const deployedStrategy = await publicClient.readContract({
      address: deploymentConfig.FACTORY_ADDRESS,
      abi: deploymentConfig.FACTORY_ABI,
      functionName: "deployedStrategies",
      args: [deploymentConfig.TOKEN_ADDRESS],
    });

    if (
      deployedStrategy &&
      deployedStrategy !== "0x0000000000000000000000000000000000000000"
    ) {
      Logger.success(`Strategy already exists at: ${deployedStrategy}`);
      return deployedStrategy as string;
    }

    Logger.info(
      `No existing strategy found for token ${deploymentConfig.TOKEN_ADDRESS}`
    );
    return null;
  } catch (error) {
    Logger.error(`Error checking existing strategy:`, error);
    return null;
  }
}

/**
 * Main function to deploy a strategy for a token
 */
async function deployStrategy(): Promise<TransactionReceipt | string | null> {
  try {
    Logger.header("EigenLayer Strategy Deployment");

    Logger.keyValue("Token address", deploymentConfig.TOKEN_ADDRESS);
    Logger.keyValue("Factory address", deploymentConfig.FACTORY_ADDRESS);
    Logger.keyValue("Using account", account.address);
    Logger.divider();

    // Check if strategy already exists - do this before anything else
    const existingStrategy = await checkExistingStrategy();
    if (existingStrategy) {
      Logger.header("Strategy Already Deployed");
      Logger.keyValue("Token address", deploymentConfig.TOKEN_ADDRESS);
      Logger.keyValue("Strategy address", existingStrategy);
      Logger.divider();
      return existingStrategy;
    }

    Logger.info(
      `Starting deployment for token ${deploymentConfig.TOKEN_ADDRESS}...`
    );

    Logger.debug(`Simulating contract call...`);
    const { request } = await publicClient.simulateContract({
      address: deploymentConfig.FACTORY_ADDRESS,
      abi: deploymentConfig.FACTORY_ABI,
      functionName: "deployNewStrategy",
      args: [deploymentConfig.TOKEN_ADDRESS],
      account: account.address,
    });

    Logger.info(`Sending transaction...`);
    const hash = await walletClient.writeContract(request);
    Logger.info(`Transaction hash: ${hash}`);

    Logger.info(`Waiting for transaction confirmation...`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    Logger.success(
      `Transaction confirmed in block ${receipt.blockNumber}, gas used: ${receipt.gasUsed}`
    );

    let deployedStrategy: string | undefined;
    try {
      deployedStrategy = (await publicClient.readContract({
        address: deploymentConfig.FACTORY_ADDRESS,
        abi: deploymentConfig.FACTORY_ABI,
        functionName: "deployedStrategies",
        args: [deploymentConfig.TOKEN_ADDRESS],
      })) as string;

      if (
        deployedStrategy &&
        deployedStrategy !== "0x0000000000000000000000000000000000000000"
      ) {
        Logger.header("Strategy Successfully Deployed");
        Logger.keyValue("Token address", deploymentConfig.TOKEN_ADDRESS);
        Logger.keyValue("Strategy address", deployedStrategy);
        Logger.keyValue("Transaction hash", hash);
        Logger.keyValue("Block number", receipt.blockNumber);
        Logger.keyValue("Gas used", receipt.gasUsed.toString());
        Logger.divider();
      }
    } catch (err) {
      Logger.warn(
        "Could not get deployed strategy address, but deployment was successful. Transaction hash:",
        hash
      );
    }

    return receipt;
  } catch (error) {
    Logger.error("Error deploying strategy:", error);

    // Check if the error is because strategy already exists
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string" &&
      error.message.includes("StrategyAlreadyExists")
    ) {
      Logger.header("Strategy Already Exists");
      Logger.warn(
        `Cannot deploy the same strategy twice for token: ${deploymentConfig.TOKEN_ADDRESS}`
      );
      Logger.divider();
      return await checkExistingStrategy();
    }

    throw error;
  }
}

// Execute the deployment
deployStrategy()
  .then((result) => {
    if (result) {
      if (typeof result === "string") {
        Logger.success(`Existing strategy found at: ${result}`);
      } else {
        Logger.success("Strategy deployment completed successfully.");
      }
      process.exit(0);
    } else {
      Logger.error("Strategy deployment failed.");
      process.exit(1);
    }
  })
  .catch((error) => {
    Logger.error("Fatal error:", error);
    process.exit(1);
  });
