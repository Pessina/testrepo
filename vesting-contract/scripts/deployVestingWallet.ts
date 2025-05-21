import { toNano } from '@ton/core';
import { VestingWallet } from '../wrappers/VestingWallet';
import { compile, NetworkProvider } from '@ton/blueprint';
import { getEnv } from '../utils/getEnv';
import { getWallet } from '../utils/getWallet';

export async function run(provider: NetworkProvider) {
  const { keyPair } = await getEnv();
  const publicKey = keyPair.publicKey.toString('hex');

  const wallet = getWallet({ keyPair, subwalletNumber: 0 });
  const wallet2 = getWallet({ keyPair, subwalletNumber: 1 });

  const oneMinInSeconds = 60;
  const nowInSeconds = Math.floor(Date.now() / 1000);

  const vestingWallet = provider.open(
    VestingWallet.createFromConfig(
      {
        subWalletId: 0,
        publicKeyHex: publicKey,
        vestingStartTime: nowInSeconds + oneMinInSeconds * 5,
        vestingTotalDuration: oneMinInSeconds * 10,
        unlockPeriod: oneMinInSeconds,
        cliffDuration: 0,
        vestingTotalAmount: toNano('0.5'),
        vestingSenderAddress: wallet.address,
        ownerAddress: wallet2.address,
      },
      await compile('VestingWallet')
    )
  );

  await vestingWallet.sendDeploy(provider.sender(), toNano('0.05'));

  await provider.waitForDeploy(vestingWallet.address);

  console.log('lockupData', await vestingWallet.getVestingData());
}
