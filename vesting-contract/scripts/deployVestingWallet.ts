import { Address, toNano } from "@ton/core";
import { VestingWallet } from "../wrappers/VestingWallet";
import { compile, NetworkProvider } from "@ton/blueprint";
import { mnemonicToPrivateKey } from "@ton/crypto";
import * as dotenv from "dotenv";

export async function run(provider: NetworkProvider) {
  dotenv.config();

  const mnemonic = process.env.WALLET_MNEMONIC || "";
  const keyPair = await mnemonicToPrivateKey(mnemonic.split(" "));
  const publicKey = keyPair.publicKey.toString("hex");

  const oneMinInSeconds = 60;
  const nowInSeconds = Math.floor(Date.now() / 1000) + oneMinInSeconds * 5;

  const vestingWallet = provider.open(
    VestingWallet.createFromConfig(
      {
        subWalletId: 0,
        publicKeyHex: publicKey,
        vestingStartTime: nowInSeconds,
        vestingTotalDuration: oneMinInSeconds * 10,
        unlockPeriod: oneMinInSeconds,
        cliffDuration: 0,
        vestingTotalAmount: toNano("0.5"),
        vestingSenderAddress: Address.parse(
          "0QCbwMPy40UitWhARqreUfiwwRXEpDC0aN3A-UWVdXnbhfre"
        ),
        ownerAddress: Address.parse(
          "0QCbwMPy40UitWhARqreUfiwwRXEpDC0aN3A-UWVdXnbhfre"
        ),
      },
      await compile("VestingWallet")
    )
  );

  await vestingWallet.sendDeploy(provider.sender(), toNano("0.05"));

  await provider.waitForDeploy(vestingWallet.address);

  console.log("lockupData", await vestingWallet.getVestingData());
}
