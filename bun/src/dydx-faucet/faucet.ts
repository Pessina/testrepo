import { FaucetApiHost, FaucetClient } from "@dydxprotocol/v4-client-js";

const client = new FaucetClient(FaucetApiHost.TESTNET);
const address = "dydx1t578dyhwujymgaltw5mp7ndkq5jkt7q2k8jlfv";
const faucetResponse = await client?.fill(address, 0, 2000);
const faucetResponseNative = await client?.fillNative(address);

console.log(faucetResponse);
console.log(faucetResponseNative);
