import { Address, toNano } from "ton-core";
import { VestingWallet } from "../wrappers/VestingWallet";
import { compile, NetworkProvider } from "@ton-community/blueprint";

export async function run(provider: NetworkProvider) {
  const oneMinute = 60;
  const now = Math.floor(Date.now() / 1000) + oneMinute * 5;

  const vestingWallet = provider.open(
    VestingWallet.createFromConfig(
      {
        subWalletId: 0,
        publicKeyHex: "",
        vestingStartTime: now,
        vestingTotalDuration: oneMinute * 10,
        unlockPeriod: oneMinute,
        cliffDuration: 0,
        vestingTotalAmount: toNano("100"),
        vestingSenderAddress: Address.parse(
          "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj0v_Vn2gg53kuPmX"
        ),
        ownerAddress: Address.parse(
          "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj0v_Vn2gg53kuPmX"
        ),
      },
      await compile("VestingWallet")
    )
  );

  await vestingWallet.sendDeploy(provider.sender(), toNano("0.05"));

  await provider.waitForDeploy(vestingWallet.address);

  console.log("lockupData", await vestingWallet.getVestingData());
}
