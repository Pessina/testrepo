import {
    Address,
    beginCell,
    Cell,
    Contract,
    Dictionary,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    Slice,
    toNano,
    TupleItemSlice,
} from '@ton/core';

import { acceptDepositOperation, acceptWithdrawOperation, depositOperation, withdrawOperation } from '../shared/shared';

export type TonPoolConfig = {
    owner: Address;
    controller: Address;
};

export function tonPoolConfigToCell(config: TonPoolConfig): Cell {
    let cellBalances = beginCell()
        .storeInt(0, 128) // profitPerCoin
        .storeCoins(0) // balance
        .storeCoins(0) // balanceSent
        .storeCoins(0) // balanceWithdrawn
        .storeCoins(0) // balancePendingWithdraw
        .storeCoins(0) // balancePendingDeposits
        .endCell();

    let nominators = Dictionary.empty(Dictionary.Keys.BigInt(256));

    let cellProxyState = beginCell()
        .storeUint(0, 32) // StakeAt
        .storeUint(0, 32) // StakeUntil
        .storeCoins(0) // StakeSent
        .storeUint(0, 64) // StoredQueryId
        .storeUint(0, 32) // StoredQueryOp
        .storeCoins(0) // StoredQueryStake
        .storeUint(0, 32) // StakeHeld
        .storeBit(0) // LockFinal
        .endCell();

    let cellPoolExtras = beginCell()
        .storeBit(true) // Enabled
        .storeBit(true) // UpdatesEnable
        .storeCoins(1_000_000_000) // MinStake, 1 TON
        .storeCoins(100_000_000) // DepositFee, 0.1 TON
        .storeCoins(100_000_000) // WithdrawFee, 0.1 TON
        .storeCoins(2000) // PoolFee, 20% given in basis points
        .storeCoins(100_000_000) // ReceiptPrice, 0.1 TON
        .endCell();

    // Just some some arbitrary address, it is not used for anything
    // in the tests we need to run.
    let proxyAddress = Address.parse('UQAHBakDk_E7qLlNQZxJDsqj_ruyAFpqarw85tO-c03fK4jK');

    return beginCell()
        .storeBit(false) // locked
        .storeAddress(config.owner) // owner
        .storeAddress(config.controller) // controller
        .storeAddress(proxyAddress) // proxy
        .storeRef(cellBalances)
        .storeDict(nominators)
        .storeRef(cellProxyState)
        .storeRef(cellPoolExtras)
        .endCell();
}

export class TonPool implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new TonPool(address);
    }

    static createFromConfig(config: TonPoolConfig, code: Cell, workchain = 0) {
        const data = tonPoolConfigToCell(config);
        const init = { code, data };
        return new TonPool(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(depositOperation, 32) // operation
                .storeUint(123456789, 64) // query id
                .storeCoins(1_000_000_000) // gas limit, 1 TON
                .endCell(),
        });
    }

    async sendDeposit(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(depositOperation, 32) // operation
                .storeUint(123456789, 64) // query id
                .storeCoins(1_000_000_000) // gas limit, 1 TON
                .endCell(),
        });
    }

    async sendWithdraw(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value: toNano('0.2'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(withdrawOperation, 32) // operation
                .storeUint(123456789, 64) // query id
                .storeCoins(1_000_000_000) // gas limit, 1 TON
                .storeCoins(value)
                .endCell(),
        });
    }

    async sendAcceptDeposit(provider: ContractProvider, via: Sender, address: Address) {
        let nominators = Dictionary.empty(Dictionary.Keys.BigUint(256), {
            serialize: (src: Slice, builder) => {
                builder.storeSlice(src);
            },
            parse: (src) => {
                return src;
            },
        });

        const rawAddress = address.hash; // gets the raw address bytes without workchain
        const addressKey = BigInt('0x' + rawAddress.toString('hex'));
        nominators.set(addressKey, beginCell().asSlice());

        await provider.internal(via, {
            value: toNano('5.0'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(acceptDepositOperation, 32) // operation
                .storeUint(123456789, 64) // query id
                .storeCoins(1_000_000_000) // gas limit, 1 TON
                .storeDict(nominators)
                .endCell(),
        });
    }

    async sendAcceptWithdraw(provider: ContractProvider, via: Sender, address: Address) {
        let nominators = Dictionary.empty(Dictionary.Keys.BigUint(256), {
            serialize: (src: Slice, builder) => {
                builder.storeSlice(src);
            },
            parse: (src) => {
                return src;
            },
        });

        const rawAddress = address.hash; // gets the raw address bytes without workchain
        const addressKey = BigInt('0x' + rawAddress.toString('hex'));
        nominators.set(addressKey, beginCell().asSlice());

        await provider.internal(via, {
            value: toNano('5.0'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(acceptWithdrawOperation, 32) // operation
                .storeUint(123456789, 64) // query id
                .storeCoins(1_000_000_000) // gas limit, 1 TON
                .storeDict(nominators)
                .endCell(),
        });
    }

    async getMember(provider: ContractProvider, address: Address) {
        let addressTuple: TupleItemSlice = {
            cell: beginCell().storeAddress(address).endCell(),
            type: 'slice',
        };
        let member = await provider.get('get_member', [addressTuple]);

        let balance = member.stack.readBigNumber();
        let pendingDeposit = member.stack.readBigNumber();
        let pendingWithdraw = member.stack.readBigNumber();
        let withdraw = member.stack.readBigNumber();

        return {
            balance: balance,
            pendingDeposit: pendingDeposit,
            pendingWithdraw: pendingWithdraw,
            withdraw: withdraw,
        };
    }

    async getStakers(provider: ContractProvider) {
        let stakers = await provider.get('get_members', []);

        let item = stakers.stack.readTuple();
        console.log('item: ', item);
        console.log('item inner: ', item.readTuple());

        // return stakers.stack.readLispListDirect();
        return [];
    }

    async getStakersRaw(provider: ContractProvider) {
        let staker = await provider.get('get_members_raw', []);
        let cell = staker.stack.readCell();
        // console.log('cell: ', cell);
        let stakerDict = cell.beginParse().loadDictDirect(Dictionary.Keys.BigInt(256), {
            serialize: (src: Slice, builder) => {
                builder.storeSlice(src);
            },
            parse: (src) => {
                return src;
            },
        });

        // console.log('dict: ', stakerDict);
        return stakerDict;
    }
}
