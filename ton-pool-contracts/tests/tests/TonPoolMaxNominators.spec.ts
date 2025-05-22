import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { TonPool } from '../wrappers/TonPool';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { depositOperation, depositResponse } from '../shared/shared';

describe('TonPoolMaxNominators', () => {
    let tonPoolCode: Cell;

    beforeAll(async () => {
        tonPoolCode = await compile('TonPool');
    });

    let blockchain: Blockchain;
    let treasury: SandboxContract<TreasuryContract>;
    let controller: SandboxContract<TreasuryContract>;
    let tonPool: SandboxContract<TonPool>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        treasury = await blockchain.treasury('deployer');
        controller = await blockchain.treasury('controller');

        // Deploy TON Pool contract.
        let tonpoolConfig = TonPool.createFromConfig(
            {
                owner: treasury.getSender().address,
                controller: controller.getSender().address,
            },
            tonPoolCode,
        );
        tonPool = blockchain.openContract(tonpoolConfig);
        const tonPoolDeployResult = await tonPool.sendDeploy(treasury.getSender(), toNano('2.0'));
        expect(tonPoolDeployResult.transactions).toHaveTransaction({
            from: treasury.address,
            to: tonPool.address,
            deploy: true,
            success: true,
        });
    });

    it.skip('try to stake with 100_000 different wallets, expected to fail', async () => {
        // Iterate over the stakers.
        let stakers = await tonPool.getStakersRaw();
        console.log('number of stakers: ', stakers.size);

        // Add 100_000 stakers.
        const startNumber = 1234567890n;
        const addNumber = 100_000n;
        const endNumber = startNumber + addNumber;
        let startTime = performance.now();
        for (let i = startNumber; i < endNumber; i++) {
            let newStakeStart = performance.now();
            const newStaker = await blockchain.treasury('staker' + i);
            let newStakeTook = performance.now() - newStakeStart;

            let depositStart = performance.now();
            const depositResult = await tonPool.sendDeposit(newStaker.getSender(), i);
            let depositTook = performance.now() - depositStart;

            expect(depositResult.transactions).toHaveTransaction({
                from: newStaker.address,
                to: tonPool.address,
                op: depositOperation,
                exitCode: 0,
                actionResultCode: 0,
                success: true,
            });
            expect(depositResult.transactions).toHaveTransaction({
                from: tonPool.address,
                to: newStaker.address,
                op: depositResponse,
                exitCode: 0,
                actionResultCode: 0,
                success: true,
            });

            let haveStaked = i - startNumber;
            if (haveStaked % 100n == 0n) {
                let accountData = (await blockchain.getContract(tonPool.address)).account;
                let endTime = performance.now();
                console.log(
                    haveStaked + '/' + addNumber,
                    'stakers have staked, it took ' + (endTime - startTime) / 1000 + ' seconds. ',
                    'newStaker took ' + newStakeTook + ' ms, ',
                    'deposit took ' + depositTook + ' ms.',
                    'storage bits: ',
                    accountData.account?.storageStats.used.bits,
                    'storage cells: ',
                    accountData.account?.storageStats.used.cells,
                );
                startTime = performance.now();
            }
        }

        stakers = await tonPool.getStakersRaw();
        console.log('number of stakers: ', stakers.size);
    });
});
