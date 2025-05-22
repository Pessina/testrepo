import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type HighLoadV3Config = {};

export function walletV2ConfigToCell(config: HighLoadV3Config): Cell {
    return beginCell().endCell();
}

export class HighLoadV3 implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new HighLoadV3(address);
    }

    static createFromConfig(config: HighLoadV3Config, code: Cell, workchain = 0) {
        const data = walletV2ConfigToCell(config);
        const init = { code, data };
        return new HighLoadV3(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }
}
