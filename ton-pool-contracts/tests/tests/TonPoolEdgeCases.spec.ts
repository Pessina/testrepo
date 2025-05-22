import { Blockchain, SandboxContract, TreasuryContract, BlockchainSnapshot } from '@ton/sandbox';
import { toNano } from '@ton/core';
import { TonPool } from '../wrappers/TonPool';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { testDepositAndWithdrawFlow, testPendingDepositAndWithdraw } from './Helpers';
import {
    acceptDepositOperation,
    acceptWithdrawOperation,
    bounceOperation,
    depositOperation,
    depositResponse,
    withdrawOperation,
    withdrawResponseDelayed,
    withdrawResponseImmediate,
} from '../shared/shared';

describe('Edge case tests', () => {
    // Snapshot used to reset the blockchain state for each test.
    let snapshot: BlockchainSnapshot;

    // Blockchain
    let blockchain: Blockchain;

    // Contracts
    let owner: SandboxContract<TreasuryContract>;
    let controller: SandboxContract<TreasuryContract>;
    let tonPool: SandboxContract<TonPool>;

    beforeAll(async () => {
        blockchain = await Blockchain.create();

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

        // Store the snapshot after deploying the contracts and wallets.
        snapshot = blockchain.snapshot();
    });

    beforeEach(async () => {
        await blockchain.loadFrom(snapshot);
    });

    describe('Run standard wallet tests', () => {
        it('pending deposits and pending withdraws', async () => {
            const wallet = await blockchain.treasury('wallet');
            await testPendingDepositAndWithdraw(tonPool, wallet.getSender());
        });
    });

    describe('Withdrawing more than pending deposit to below minimum stake should not work', () => {
        it('pending deposits and pending withdraws', async () => {
            const wallet = await blockchain.treasury('wallet');
            const walletSender = wallet.getSender();
            const controllerSender = blockchain.sender(controller.address);

            // Check the initial balance.
            let memberBalance = await tonPool.getMember(walletSender.address!);
            expect(Number(memberBalance.balance)).toEqual(Number(toNano('0')));
            expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('0')));
            expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('0')));
            expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('0')));

            // Add a pending deposit.
            const depositResult = await tonPool.sendDeposit(walletSender, toNano('4.3'));
            expect(depositResult.transactions).toHaveTransaction({
                from: walletSender.address!,
                to: tonPool.address,
                op: depositOperation,
                exitCode: 0,
                success: true,
            });
            expect(depositResult.transactions).toHaveTransaction({
                from: tonPool.address,
                to: walletSender.address!,
                op: depositResponse,
                exitCode: 0,
                success: true,
            });

            // There should be a pending deposit.
            memberBalance = await tonPool.getMember(walletSender.address!);
            expect(Number(memberBalance.balance)).toEqual(Number(toNano('0')));
            expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('4.1')));
            expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('0')));
            expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('0')));

            // Controller accepts the withdraw.
            const acceptWithdrawResult = await tonPool.sendAcceptDeposit(controllerSender, walletSender.address!);
            expect(acceptWithdrawResult.transactions).toHaveTransaction({
                from: controllerSender.address,
                to: tonPool.address,
                op: acceptDepositOperation,
                exitCode: 0,
                success: true,
            });

            // The pending withdraw should be gone, there should be a withdraw and
            // the balance should be updated.
            memberBalance = await tonPool.getMember(walletSender.address!);
            expect(Number(memberBalance.balance)).toEqual(Number(toNano('4.1')));
            expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('0')));
            expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('0')));
            expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('0')));

            // Add a pending deposit.
            const secondDepositResult = await tonPool.sendDeposit(walletSender, toNano('2.0'));
            expect(secondDepositResult.transactions).toHaveTransaction({
                from: walletSender.address!,
                to: tonPool.address,
                op: depositOperation,
                exitCode: 0,
                success: true,
            });
            expect(secondDepositResult.transactions).toHaveTransaction({
                from: tonPool.address,
                to: walletSender.address!,
                op: depositResponse,
                exitCode: 0,
                success: true,
            });

            // The pending deposit balance should have been updated.
            memberBalance = await tonPool.getMember(walletSender.address!);
            expect(Number(memberBalance.balance)).toEqual(Number(toNano('4.1')));
            expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('1.8')));
            expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('0')));
            expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('0')));

            // Withdraw partially from the pending deposit.
            const firstWithdraw = await tonPool.sendWithdraw(walletSender, toNano('1.3'));
            expect(firstWithdraw.transactions).toHaveTransaction({
                from: walletSender.address!,
                to: tonPool.address,
                op: withdrawOperation,
                exitCode: 0,
                success: true,
            });
            expect(firstWithdraw.transactions).toHaveTransaction({
                from: tonPool.address,
                to: walletSender.address!,
                op: withdrawResponseImmediate,
                exitCode: 0,
                success: true,
            });

            // The pending deposit balance should have been updated.
            memberBalance = await tonPool.getMember(walletSender.address!);
            expect(Number(memberBalance.balance)).toEqual(Number(toNano('4.1')));
            expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('0.5')));
            expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('0')));
            expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('0')));

            // Withdraw partially from the pending deposit a second time. This
            // time we should get parts of the withdraw immediately and the rest
            // should be added as a pending withdraw.
            const secondWithdraw = await tonPool.sendWithdraw(walletSender, toNano('1.3'));
            expect(secondWithdraw.transactions).toHaveTransaction({
                from: walletSender.address!,
                to: tonPool.address,
                op: withdrawOperation,
                exitCode: 0,
                success: true,
            });
            expect(secondWithdraw.transactions).toHaveTransaction({
                from: tonPool.address,
                to: walletSender.address!,
                op: withdrawResponseDelayed,
                exitCode: 0,
                success: true,
            });

            // The pending deposit balance should have been updated.
            memberBalance = await tonPool.getMember(walletSender.address!);
            expect(Number(memberBalance.balance)).toEqual(Number(toNano('4.1')));
            expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('0')));
            expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('0.8')));
            expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('0')));
        });

        describe('Depositing with just fees, effetively trying to deposit 0 TON', () => {
            it('', async () => {
                const wallet = await blockchain.treasury('wallet');
                const walletSender = wallet.getSender();

                // Check the initial balance, should be zero.
                let memberBalance = await tonPool.getMember(walletSender.address!);
                expect(Number(memberBalance.balance)).toEqual(Number(toNano('0')));
                expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('0')));
                expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('0')));
                expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('0')));

                // Deposit 0.2 TON (the withdraw fee + receipt price), it should fail.
                // It doesn't send a bounce though.
                const depositResult = await tonPool.sendDeposit(walletSender, toNano('0.2'));
                expect(depositResult.transactions).toHaveTransaction({
                    from: walletSender.address!,
                    to: tonPool.address,
                    op: depositOperation,
                    success: false,
                });

                // All member balances should be unchanged.
                memberBalance = await tonPool.getMember(walletSender.address!);
                expect(Number(memberBalance.balance)).toEqual(Number(toNano('0')));
                expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('0')));
                expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('0')));
                expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('0')));
            });
        });

        describe('Withdrawing with 0 balance', () => {
            it('', async () => {
                const wallet = await blockchain.treasury('wallet');
                const walletSender = wallet.getSender();

                // Check the initial balance.
                let memberBalance = await tonPool.getMember(walletSender.address!);
                expect(Number(memberBalance.balance)).toEqual(Number(toNano('0')));
                expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('0')));
                expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('0')));
                expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('0')));

                const firstWithdraw = await tonPool.sendWithdraw(walletSender, toNano('1.3'));
                expect(firstWithdraw.transactions).toHaveTransaction({
                    from: walletSender.address!,
                    to: tonPool.address,
                    op: withdrawOperation,
                    exitCode: 77,
                    success: false,
                });
                expect(firstWithdraw.transactions).toHaveTransaction({
                    from: tonPool.address,
                    to: walletSender.address!,
                    op: bounceOperation,
                    exitCode: 0,
                    success: true,
                });
                memberBalance = await tonPool.getMember(walletSender.address!);
                expect(Number(memberBalance.balance)).toEqual(Number(toNano('0')));
                expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('0')));
                expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('0')));
                expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('0')));

                // Withdrawing everything with 0 balance works, but does nothing.
                const withdrawEverything = await tonPool.sendWithdraw(walletSender, toNano('0'));
                expect(withdrawEverything.transactions).toHaveTransaction({
                    from: walletSender.address!,
                    to: tonPool.address,
                    op: withdrawOperation,
                    exitCode: 0,
                    success: true,
                });
                expect(withdrawEverything.transactions).toHaveTransaction({
                    from: tonPool.address,
                    to: walletSender.address!,
                    op: withdrawResponseImmediate,
                    exitCode: 0,
                    success: true,
                });
                memberBalance = await tonPool.getMember(walletSender.address!);
                expect(Number(memberBalance.balance)).toEqual(Number(toNano('0')));
                expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('0')));
                expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('0')));
                expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('0')));
            });
        });

        describe('Multiple pending deposits', () => {});

        describe('Multiple pending withdrawals', () => {});

        describe('Withdraw, deposit, withdraw', () => {
            // // Multiple sequential operations
            // - Deposit 3 TON
            // - Withdraw 1 TON (succeeds)
            // - Withdraw 0.5 TON (succeeds)
            // - Withdraw 0.6 TON (fails - would leave 0.9 TON)
        });
    });
});
