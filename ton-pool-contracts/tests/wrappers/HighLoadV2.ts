import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type HighLoadV2Config = {};

export function walletV2ConfigToCell(config: HighLoadV2Config): Cell {
    return beginCell().endCell();
}

export class HighLoadV2 implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new HighLoadV2(address);
    }

    static createFromConfig(config: HighLoadV2Config, code: Cell, workchain = 0) {
        const data = walletV2ConfigToCell(config);
        const init = { code, data };
        return new HighLoadV2(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }
}
