"use client"

import { deriveChildPublicKey, najPublicKeyStrToUncompressedHexPoint } from "./utils"


const najPubKey = "secp256k1:54hU5wcCmVUPFWLDALXMh1fFToZsVXrx9BbTbHzSfQq1Kd1rJZi52iPa4QQxo6s5TgjWqgpY8HamYuUDzG6fAaUq"
const CHAIN_ID_ETHEREUM= "0x1";        
const EPSILON_DERIVATION_PREFIX = "sig.network v1.0.0 epsilon derivation";

const requester = "%admin#";
const path = "signing_contract_control";
const derivation_path = `${EPSILON_DERIVATION_PREFIX},${CHAIN_ID_ETHEREUM},${requester},${path}`;

export const KDFPage = () => {

    const handleDeriveKey = () => {
        const hexPubKey = najPublicKeyStrToUncompressedHexPoint(najPubKey)
        const key = deriveChildPublicKey(
            hexPubKey,
            derivation_path
        )

        console.log(key)
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