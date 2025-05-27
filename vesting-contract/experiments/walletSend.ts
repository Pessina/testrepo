import { toNano } from '@ton/core';
import { TonClient, internal, SendMode } from '@ton/ton';
import { getWallet } from './utils/getWallet';
import { getEnv } from './utils/getEnv';

async function main() {
  const { apiKey, endpoint, keyPair } = await getEnv();

  try {
    const client = new TonClient({ endpoint, apiKey });
    const sourceWallet = getWallet({ keyPair, subwalletNumber: 1 });
    const sourceAddress = sourceWallet.address;
    const sourceBalance = await client.getBalance(sourceAddress);
    console.log('Source Balance:', sourceBalance);

    const destWallet = getWallet({ keyPair, subwalletNumber: 0 });
    const destAddress = destWallet.address;
    const amount = sourceBalance - toNano('0.05');

    if (sourceBalance < amount + toNano('0.05')) {
      console.error('Error: Insufficient balance');
      process.exit(1);
    }

    const walletContract = client.open(sourceWallet);
    const seqno = await walletContract.getSeqno();

    console.log(`Sending ${amount} TON to ${destAddress} from ${sourceAddress}`);

    await walletContract.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [
        internal({
          to: destAddress,
          value: amount,
          bounce: true,
          body: '',
        }),
      ],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    });

    console.log(
      `Transaction link: https://testnet.tonscan.org/address/${sourceAddress.toString()}`
    );
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

main().catch(console.error);
