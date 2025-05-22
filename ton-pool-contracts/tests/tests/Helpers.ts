import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Sender, toNano } from '@ton/core';
import { TonPool } from '../wrappers/TonPool';
import '@ton/test-utils';
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

// testPendingDepositAndWithdraw tests the pending deposit and withdraw workflows
// without using the accept deposit and accept withdraw operations in the Pool.
export async function testPendingDepositAndWithdraw(tonPool: SandboxContract<TonPool>, walletSender: Sender) {
    // Check the initial balance.
    let memberBalance = await tonPool.getMember(walletSender.address!);
    expect(Number(memberBalance.balance)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('0')));

    // Depositing below the minimum stake should not work.
    const failedDeposit = await tonPool.sendDeposit(walletSender, toNano('0.9'));
    expect(failedDeposit.transactions).toHaveTransaction({
        from: walletSender.address!,
        to: tonPool.address,
        op: depositOperation,
        exitCode: 77,
        success: false,
    });
    expect(failedDeposit.transactions).toHaveTransaction({
        from: tonPool.address,
        to: walletSender.address!,
        op: bounceOperation,
        exitCode: 0,
        success: true,
    });
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
    expect(Number(memberBalance.balance)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('2.8')));
    expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('0')));

    // Withdraw partially down to the minimum stake should work.
    // Note that we subtracted 0.2 TON to account for withdrawal fee and
    // receipt price.
    const secondWithdraw = await tonPool.sendWithdraw(walletSender, toNano('1.8'));
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
        op: withdrawResponseImmediate,
        exitCode: 0,
        success: true,
    });

    // The pending deposit balance should have been updated.
    memberBalance = await tonPool.getMember(walletSender.address!);
    expect(Number(memberBalance.balance)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('1.0')));
    expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('0')));

    // Withdraw down to under minimum stake should not work.
    const withdrawUnderMinimumStake = await tonPool.sendWithdraw(walletSender, toNano('0.1'));
    expect(withdrawUnderMinimumStake.transactions).toHaveTransaction({
        from: walletSender.address!,
        to: tonPool.address,
        op: withdrawOperation,
        exitCode: 501,
        success: false,
    });
    expect(withdrawUnderMinimumStake.transactions).toHaveTransaction({
        from: tonPool.address,
        to: walletSender.address!,
        op: bounceOperation,
        inMessageBounced: true,
        exitCode: 0,
        success: true,
    });

    // There should be no change in the balance.
    memberBalance = await tonPool.getMember(walletSender.address!);
    expect(Number(memberBalance.balance)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('1.0')));
    expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('0')));

    // Withdraw everything will work.
    const withdrawResult3 = await tonPool.sendWithdraw(walletSender, toNano('0'));
    expect(withdrawResult3.transactions).toHaveTransaction({
        from: walletSender.address!,
        to: tonPool.address,
        op: withdrawOperation,
        exitCode: 0,
        success: true,
    });
    expect(withdrawResult3.transactions).toHaveTransaction({
        to: walletSender.address!,
        from: tonPool.address,
        op: withdrawResponseImmediate,
        exitCode: 0,
        success: true,
    });

    // The pending deposit balance should be zero.
    memberBalance = await tonPool.getMember(walletSender.address!);
    expect(Number(memberBalance.balance)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('0')));
}

// testDepositAndWithdrawFlow tests the deposit and withdraw flow with accept
// deposit and accept withdraw operations in the Pool contract.
export async function testDepositAndWithdrawFlow(
    tonPool: SandboxContract<TonPool>,
    walletSender: Sender,
    controllerSender: Sender,
) {
    let memberBalance = await tonPool.getMember(walletSender.address!);
    expect(Number(memberBalance.balance)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('0')));

    // Depositing below the minimum stake should not work.
    const failedDeposit = await tonPool.sendDeposit(walletSender, toNano('0.9'));
    expect(failedDeposit.transactions).toHaveTransaction({
        from: walletSender.address!,
        to: tonPool.address,
        op: depositOperation,
        exitCode: 77,
        success: false,
    });
    expect(failedDeposit.transactions).toHaveTransaction({
        from: tonPool.address,
        to: walletSender.address!,
        op: bounceOperation,
        exitCode: 0,
        success: true,
    });
    expect(Number(memberBalance.balance)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('0')));

    // Deposit
    const depositResult = await tonPool.sendDeposit(walletSender, toNano('4.3'));
    expect(depositResult.transactions).toHaveTransaction({
        from: walletSender.address,
        to: tonPool.address,
        op: depositOperation,
        exitCode: 0,
        success: true,
    });
    expect(depositResult.transactions).toHaveTransaction({
        from: tonPool.address,
        to: walletSender.address,
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

    // Accept deposit
    const acceptDepositResult = await tonPool.sendAcceptDeposit(controllerSender, walletSender.address!);
    expect(acceptDepositResult.transactions).toHaveTransaction({
        from: controllerSender.address,
        to: tonPool.address,
        op: acceptDepositOperation,
        exitCode: 0,
        success: true,
    });

    // There should be no pending deposit, but the balance should be updated.
    memberBalance = await tonPool.getMember(walletSender.address!);
    expect(Number(memberBalance.balance)).toEqual(Number(toNano('4.1')));
    expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('0')));

    // Withdrawing to below minimum stake should not work.
    const withdrawUnderMinimumStake = await tonPool.sendWithdraw(walletSender, toNano('4.0'));
    expect(withdrawUnderMinimumStake.transactions).toHaveTransaction({
        from: walletSender.address,
        to: tonPool.address,
        op: withdrawOperation,
        exitCode: 501,
        success: false,
    });
    expect(withdrawUnderMinimumStake.transactions).toHaveTransaction({
        from: tonPool.address,
        to: walletSender.address,
        op: bounceOperation,
        inMessageBounced: true,
        exitCode: 0,
        success: true,
    });

    // Initiate a partial withdraw.
    const initiatePartialWithdraw = await tonPool.sendWithdraw(walletSender, toNano('2.0'));
    expect(initiatePartialWithdraw.transactions).toHaveTransaction({
        from: walletSender.address,
        to: tonPool.address,
        op: withdrawOperation,
        exitCode: 0,
        success: true,
    });
    expect(initiatePartialWithdraw.transactions).toHaveTransaction({
        to: walletSender.address,
        from: tonPool.address,
        op: withdrawResponseDelayed,
        exitCode: 0,
        success: true,
    });

    // There should be a pending withdraw, but the balance should be the same.
    memberBalance = await tonPool.getMember(walletSender.address!);
    expect(Number(memberBalance.balance)).toEqual(Number(toNano('4.1')));
    expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('2.0')));
    expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('0')));

    // Controller accepts the withdraw.
    const acceptWithdrawResult = await tonPool.sendAcceptWithdraw(controllerSender, walletSender.address!);
    expect(acceptWithdrawResult.transactions).toHaveTransaction({
        from: controllerSender.address,
        to: tonPool.address,
        op: acceptWithdrawOperation,
        exitCode: 0,
        success: true,
    });

    // The pending withdraw should be gone, there should be a withdraw and
    // the balance should be updated.
    memberBalance = await tonPool.getMember(walletSender.address!);
    expect(Number(memberBalance.balance)).toEqual(Number(toNano('2.1')));
    expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('2.0')));

    // Complete the partial withdraw.
    const completePartialWithdraw = await tonPool.sendWithdraw(walletSender, toNano('2.0'));
    expect(completePartialWithdraw.transactions).toHaveTransaction({
        from: walletSender.address,
        to: tonPool.address,
        op: withdrawOperation,
        exitCode: 0,
        success: true,
    });
    expect(completePartialWithdraw.transactions).toHaveTransaction({
        to: walletSender.address,
        from: tonPool.address,
        op: withdrawResponseImmediate,
        exitCode: 0,
        success: true,
    });

    // The withdraw balance should now be zero.
    memberBalance = await tonPool.getMember(walletSender.address!);
    expect(Number(memberBalance.balance)).toEqual(Number(toNano('2.1')));
    expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('0')));

    // Initiate a full withdraw.
    const initiateFullWithdraw = await tonPool.sendWithdraw(walletSender, memberBalance.balance);
    expect(initiateFullWithdraw.transactions).toHaveTransaction({
        from: walletSender.address,
        to: tonPool.address,
        op: withdrawOperation,
        exitCode: 0,
        success: true,
    });
    expect(initiateFullWithdraw.transactions).toHaveTransaction({
        to: walletSender.address,
        from: tonPool.address,
        op: withdrawResponseDelayed,
        exitCode: 0,
        success: true,
    });

    // There should be a pending withdraw, but the balance should be the same.
    memberBalance = await tonPool.getMember(walletSender.address!);
    expect(Number(memberBalance.balance)).toEqual(Number(toNano('2.1')));
    expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('2.1')));
    expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('0')));

    // Controller accepts the full withdraw.
    const acceptWithdrawResult2 = await tonPool.sendAcceptWithdraw(controllerSender, walletSender.address!);
    expect(acceptWithdrawResult2.transactions).toHaveTransaction({
        from: controllerSender.address,
        to: tonPool.address,
        op: acceptWithdrawOperation,
        exitCode: 0,
        success: true,
    });

    // The pending withdraw should be gone, the balance should be zero
    // and the withdraw balance should be updated.
    memberBalance = await tonPool.getMember(walletSender.address!);
    expect(Number(memberBalance.balance)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('2.1')));

    // Complete the full withdraw.
    const completeFullWithdraw = await tonPool.sendWithdraw(walletSender, memberBalance.withdraw);
    expect(completeFullWithdraw.transactions).toHaveTransaction({
        from: walletSender.address,
        to: tonPool.address,
        op: withdrawOperation,
        exitCode: 0,
        success: true,
    });
    expect(completeFullWithdraw.transactions).toHaveTransaction({
        to: walletSender.address,
        from: tonPool.address,
        op: withdrawResponseImmediate,
        exitCode: 0,
        success: true,
    });

    // All balances should be zero.
    memberBalance = await tonPool.getMember(walletSender.address!);
    expect(Number(memberBalance.balance)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.pendingDeposit)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.pendingWithdraw)).toEqual(Number(toNano('0')));
    expect(Number(memberBalance.withdraw)).toEqual(Number(toNano('0')));
}
