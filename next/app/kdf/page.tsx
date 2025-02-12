"use client"

import { 
    deriveChildPublicKey,
    najPublicKeyStrToUncompressedHexPoint,
    uncompressedHexPointToEvmAddress 
} from "./utils"

const najPubKey = "secp256k1:54hU5wcCmVUPFWLDALXMh1fFToZsVXrx9BbTbHzSfQq1Kd1rJZi52iPa4QQxo6s5TgjWqgpY8HamYuUDzG6fAaUq"
const requester = "%admin#";
const path = "signing_contract_control";

export const KDFPage = () => {

    const handleDeriveKey = () => {
        const hexPubKey = najPublicKeyStrToUncompressedHexPoint(najPubKey)
        const key = deriveChildPublicKey(
            hexPubKey,
            requester,
            path
        )
        const ethAddress = uncompressedHexPointToEvmAddress(key)

        console.log(ethAddress)
    }

    return (
        <div>
            <button onClick={handleDeriveKey}>
                Derive Key
            </button>
        </div>
    )
}

export default KDFPage;