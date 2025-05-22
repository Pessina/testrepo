import { KeyPair } from '@ton/crypto';
import { WalletContractV5R1 } from '@ton/ton';

export const getWallet = ({
  keyPair,
  subwalletNumber,
}: {
  keyPair: KeyPair;
  subwalletNumber: number;
}) => {
  const wallet = WalletContractV5R1.create({
    publicKey: keyPair.publicKey,
    walletId: {
      networkGlobalId: -3,
      context: {
        walletVersion: 'v5r1',
        workchain: 0,
        subwalletNumber,
      },
    },
  });

  return wallet;
};
