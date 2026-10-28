import { keccak256, toBytes } from "viem";

/** keccak256 of a UTF-8 string as 0x-hex. Only imported from lazily loaded web3 chunks, never the main bundle. */
export const keccakUtf8 = (s: string): string => keccak256(toBytes(s));
