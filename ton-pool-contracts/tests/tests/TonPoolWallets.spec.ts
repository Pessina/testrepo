import { Blockchain, SandboxContract, TreasuryContract, BlockchainSnapshot } from '@ton/sandbox';
import { toNano } from '@ton/core';
import { HighLoadV2 } from '../wrappers/HighLoadV2';
import { HighLoadV3 } from '../wrappers/HighLoadV3';
import { TonPool } from '../wrappers/TonPool';
import { WalletV2 } from '../wrappers/WalletV2';
import { WalletV3 } from '../wrappers/WalletV3';
import { WalletV4 } from '../wrappers/WalletV4';
import { WalletV5 } from '../wrappers/WalletV5';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { testDepositAndWithdrawFlow, testPendingDepositAndWithdraw } from './Helpers';

describe('Specific wallet tests', () => {
    // Snapshot used to reset the blockchain state for each test.
    let snapshot: BlockchainSnapshot;

    // Blockchain
    let blockchain: Blockchain;

    // Contracts
    let owner: SandboxContract<TreasuryContract>;
    let controller: SandboxContract<TreasuryContract>;
    let tonPool: SandboxContract<TonPool>;

    // Wallets
    let highLoadV2: SandboxContract<HighLoadV2>;
    let highLoadV3: SandboxContract<HighLoadV3>;
    let walletV2: SandboxContract<WalletV2>;
    let walletV3: SandboxContract<WalletV3>;
    let walletV4: SandboxContract<WalletV4>;
    let walletV5: SandboxContract<WalletV5>;

    beforeAll(async () => {
        blockchain = await Blockchain.create();

        // let a = blockchain.config.beginParse().loadRef();
        // console.log('address: ', a);

        owner = await blockchain.treasury('deployer');
        controller = await blockchain.treasury('controller');

        // Deploy TON Pool contract.
        const tonPoolCode = await compile('TonPool');
        let tonpoolConfig = TonPool.createFromConfig(
            {
                owner: owner.getSender().address,
                controller: controller.getSender().address,
            },
            tonPoolCode,
        );
        tonPool = blockchain.openContract(tonpoolConfig);
        const tonPoolDeployResult = await tonPool.sendDeploy(owner.getSender(), toNano('2.0'));
        expect(tonPoolDeployResult.transactions).toHaveTransaction({
            from: owner.address,
            to: tonPool.address,
            deploy: true,
            success: true,
        });

        // Compile and deploy HighLoadV2 contract.
        const highLoadV2Code = await compile('HighLoadV2');
        const highLoadV2Config = HighLoadV2.createFromConfig({}, highLoadV2Code);
        highLoadV2 = blockchain.openContract(highLoadV2Config);
        const highLoadV2DeployResult = await highLoadV2.sendDeploy(owner.getSender(), toNano('2.0'));
        expect(highLoadV2DeployResult.transactions).toHaveTransaction({
            from: owner.address,
            to: highLoadV2.address,
            deploy: true,
            success: true,
        });

        // Compile and deploy HighLoadV3 contract.
        const highLoadV3Code = await compile('HighLoadV3');
        const highLoadV3Config = HighLoadV3.createFromConfig({}, highLoadV3Code);
        highLoadV3 = blockchain.openContract(highLoadV3Config);
        const highLoadV3DeployResult = await highLoadV3.sendDeploy(owner.getSender(), toNano('2.0'));
        expect(highLoadV3DeployResult.transactions).toHaveTransaction({
            from: owner.address,
            to: highLoadV3.address,
            deploy: true,
            success: true,
        });

        // Compile and deploy WalletV2 contract.
        const walletV2Code = await compile('WalletV2');
        const walletV2Config = WalletV2.createFromConfig({}, walletV2Code);
        walletV2 = blockchain.openContract(walletV2Config);
        const walletV2DeployResult = await walletV2.sendDeploy(owner.getSender(), toNano('2.0'));
        expect(walletV2DeployResult.transactions).toHaveTransaction({
            from: owner.address,
            to: walletV2.address,
            deploy: true,
            success: true,
        });

        // Compile and deploy WalletV3 contract.
        const walletV3Code = await compile('WalletV3');
        const walletV3Config = WalletV3.createFromConfig({}, walletV3Code);
        walletV3 = blockchain.openContract(walletV3Config);
        const walletV3DeployResult = await walletV3.sendDeploy(owner.getSender(), toNano('2.0'));
        expect(walletV3DeployResult.transactions).toHaveTransaction({
            from: owner.address,
            to: walletV3.address,
            deploy: true,
            success: true,
        });

        // Compile and deploy WalletV4 contract.
        const walletV4Code = await compile('WalletV4');
        const walletV4Config = WalletV4.createFromConfig({}, walletV4Code);
        walletV4 = blockchain.openContract(walletV4Config);
        const walletV4DeployResult = await walletV4.sendDeploy(owner.getSender(), toNano('2.0'));
        expect(walletV4DeployResult.transactions).toHaveTransaction({
            from: owner.address,
            to: walletV4.address,
            deploy: true,
            success: true,
        });

        // Compile and deploy WalletV5 contract.
        const walletV5Code = await compile('WalletV5');
        const walletV5Config = WalletV5.createFromConfig({}, walletV5Code);
        walletV5 = blockchain.openContract(walletV5Config);
        const walletV5DeployResult = await walletV5.sendDeploy(owner.getSender(), toNano('2.0'));
        expect(walletV5DeployResult.transactions).toHaveTransaction({
            from: owner.address,
            to: walletV5.address,
            deploy: true,
            success: true,
        });

        // Store the snapshot after deploying the contracts and wallets.
        snapshot = blockchain.snapshot();
    });

    beforeEach(async () => {
        await blockchain.loadFrom(snapshot);
    });

    describe.each([
        ['HighLoadV2', () => highLoadV2],
        ['HighLoadV3', () => highLoadV3],
        ['WalletV2', () => walletV2],
        ['WalletV3', () => walletV3],
        ['WalletV4', () => walletV4],
        ['WalletV5', () => walletV5],
    ])('Testing %s', (walletName, getWallet) => {
        it('pending deposits and pending withdraws', async () => {
            const wallet = getWallet();
            const walletSender = blockchain.sender(wallet.address);
            await testPendingDepositAndWithdraw(tonPool, walletSender);
        });

        it('accept deposit and then withdraw', async () => {
            const wallet = getWallet();
            const walletSender = blockchain.sender(wallet.address);
            const controllerSender = blockchain.sender(controller.address);
            await testDepositAndWithdrawFlow(tonPool, walletSender, controllerSender);
        });
    });
});
