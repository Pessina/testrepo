"use client"

export default function WebauthnPublicKey() {
    const getCompressedPublicKey = async () => {
        const base64PublicKey = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE_mJa4phSLrlHly59wHNS9rBwqCdRkevHUL7pHN2da01MZx_Vz3IvJat38h71vZWY-n5v2jCbzGyoyKQn1SCI6Q';
        const derBuffer = Buffer.from(base64PublicKey, 'base64');
        console.log(derBuffer.length); // 91
        const x = derBuffer.slice(26, 58);
        const y = derBuffer.slice(58, 90);
        const yLastByte = y[y.length - 1];
        const isYOdd = (yLastByte & 1) === 1;
        const prefix = isYOdd ? '03' : '02';
        const compressedKey = prefix + x.toString('hex');
        console.log(compressedKey); // 03fe625ae298522eb947972e7dc07352f6b07028275191ebc750bee91cdd9d6b4d
    };

    return <button onClick={getCompressedPublicKey}>Get Compressed Public Key</button>;
}
