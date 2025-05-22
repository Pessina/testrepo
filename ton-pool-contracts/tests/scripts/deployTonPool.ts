import { toNano } from '@ton/core';
import { TonPool } from '../wrappers/TonPool';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const tonPool = provider.open(TonPool.createFromConfig({}, await compile('TonPool')));

    await tonPool.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(tonPool.address);

    // run methods on `tonPool`
}
