"use client"

import { http, type Hex, createWalletClient, parseEther } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import {
    type SupportedSigner,
    createSmartAccountClient
} from "@biconomy/account"
import config from "../../config.json"
import { getChain } from "../../utils/getChain"

const Page2 = () => {

    const nativeTransfer = async (to: string, amount: number) => {
        // ----- 1. Generate EOA from private key
        const account = privateKeyToAccount(config.privateKey as Hex)
        const client = createWalletClient({
            account,
            chain: {
                ...getChain(config.chainId),
                rpcUrls: {
                    default: {
                        http: [config.rpcUrl]
                    }
                }
            },
            transport: http()
        })

        // ------ 2. Create biconomy smart account instance
        const smartAccount = await createSmartAccountClient({
            signer: client as SupportedSigner,
            bundlerUrl: config.bundlerUrl,
            biconomyPaymasterApiKey: config.biconomyPaymasterApiKey
        })

        const scwAddress = await smartAccount.getAccountAddress()
        console.log("SCW Address", scwAddress)

        // ------ 3. Generate transaction data
        const txData = {
            to,
            value: parseEther(amount.toString())
        }

        console.log("txData", txData)
        const userOp = await smartAccount.buildUserOp([txData])
        const signedUserOp = await smartAccount.signUserOp(userOp)
        // console.log(JSON.stringify(signedUserOp, null, 2))

        // const signedUserOp = {
        //   sender: '0x2E766363F2efD99631755dcE69806Bd113B41565',
        //   nonce: '0x2',
        //   initCode: '0x',
        //   callData: '0x0000189a0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000009184e72a00000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000',
        //   signature: '0x00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000001c5b32f37f5bea87bdd5374eb2ac54ea8e0000000000000000000000000000000000000000000000000000000000000041e8188fbfa099254fe0e1ece794ff7748d71491b771df975b479709fce414f0dd541ee126f823461def4488a5397eae3b7409595cba59b7b9ba180a0f828e91f61b00000000000000000000000000000000000000000000000000000000000000',
        //   paymasterAndData: '0x',
        //   maxFeePerGas: '0x202ddc13b',
        //   maxPriorityFeePerGas: '0x9d25c5',
        //   verificationGasLimit: '0x113f9',
        //   callGasLimit: '0x3c6a',
        //   preVerificationGas: '0xe339'
        // }

        const { waitForTxHash } = await smartAccount.sendSignedUserOp(signedUserOp)
        const txHash = await waitForTxHash()
        console.log({ txHash })

        // ------ 4. Send user operation and get tx hash
        // const { waitForTxHash } = await smartAccount.sendTransaction(txData, {
        //   paymasterServiceData: { mode: PaymasterMode.SPONSORED }
        // })
        // const { transactionHash } = await waitForTxHash()
        // console.log("transactionHash", transactionHash)
    }


    return (
        <div>
            <button onClick={() => nativeTransfer("0x1234567890123456789012345678901234567890", 0.000001)}>
                Native Transfer
            </button>
        </div>
    )
}

export default Page2
