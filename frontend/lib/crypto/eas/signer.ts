import { BrowserProvider, JsonRpcSigner, type Eip1193Provider } from "ethers";
import type { Account, Chain, Client, Transport } from "viem";

/** Turns a wagmi/viem wallet client into an ethers v6 signer (the EAS SDK talks ethers). */
export function clientToSigner(client: Client<Transport, Chain, Account>): JsonRpcSigner {
  const { account, chain, transport } = client;
  const provider = new BrowserProvider(transport as unknown as Eip1193Provider, {
    chainId: chain.id,
    name: chain.name,
  });
  return new JsonRpcSigner(provider, account.address);
}
