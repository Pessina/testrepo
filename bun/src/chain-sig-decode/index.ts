import * as anchor from "@coral-xyz/anchor";
import { Buffer } from "buffer";
import idl from "./idl.json";


const connection = new anchor.web3.Connection("https://api.mainnet-beta.solana.com");
const provider = new anchor.AnchorProvider(connection, {} as any, {});
anchor.setProvider(provider);


const program = new anchor.Program(idl as anchor.Idl, provider);

const encodedData = "q4FpW5oxoCK8BLrVIlOzgUy60+hcyaoZWCs2YWpcj3fHkkrZFbKmXI6FDsnnxF7Uq1HM4lG0LHYtEToDx8588iMeF8XsPZyDAAAAABAnAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbwEutUiU7OBTLrT6FzJqhlYKzZhalyPd8eSStkVsqZc";


const decodedBuffer = Buffer.from(encodedData, "base64");

const decodedEvent = program.coder.events.decode(decodedBuffer.toString('base64'));
console.log(decodedEvent);