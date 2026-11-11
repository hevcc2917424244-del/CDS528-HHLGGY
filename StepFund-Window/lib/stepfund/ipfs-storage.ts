import { create } from "@storacha/client";
import { StoreMemory } from "@storacha/client/stores/memory";
import { keccak256 } from "ethers";
import { IPFS_LIMIT, parseIPFS } from "./ipfs";

export type StorageClient = Awaited<ReturnType<typeof create>>;
export async function connectStorage(email: string, signal: AbortSignal) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    throw Error("ipfsEmail");
  // Authorizations and the agent key last for this page session only.
  const client = await create({ store: new StoreMemory() });
  await client.login(email as `${string}@${string}`, { signal });
  if (signal.aborted) throw Error("ipfsCancelled");
  return client;
}
export async function publishEvidence(
  client: StorageClient,
  space: string,
  blob: Blob,
  digest: string,
  signal: AbortSignal,
) {
  if (blob.size > IPFS_LIMIT) throw Error("fileTooLarge");
  if (
    keccak256(new Uint8Array(await blob.arrayBuffer())).toLowerCase() !==
    digest.toLowerCase()
  )
    throw Error("ipfsMismatch");
  if (!client.spaces().some((s) => s.did() === space)) throw Error("ipfsSpace");
  await client.setCurrentSpace(space as `did:key:${string}`);
  const cid = await client.uploadFile(blob, { signal, retries: 1 });
  const uri = `ipfs://${cid}`;
  parseIPFS(uri);
  return uri;
}
