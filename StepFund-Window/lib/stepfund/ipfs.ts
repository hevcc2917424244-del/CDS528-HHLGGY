import { CID } from "multiformats/cid";
import { keccak256 } from "ethers";

export const IPFS_LIMIT = 20 * 1024 * 1024;
export const GATEWAYS = ["dweb.link", "ipfs.io", "storacha.link"] as const;
export type Gateway = (typeof GATEWAYS)[number];

export function parseIPFS(uri: string) {
  if (!uri.startsWith("ipfs://") || uri.length > 500 || /[\s?#\\]/.test(uri))
    throw Error("ipfsInvalid");
  const [root, ...segments] = uri.slice(7).split("/");
  let cid: CID;
  try {
    cid = CID.parse(root).toV1();
  } catch {
    throw Error("ipfsInvalid");
  }
  // Only UnixFS/raw files with the usual SHA-256 multihash are supported here.
  if (
    ![0x55, 0x70].includes(cid.code) ||
    cid.multihash.code !== 0x12 ||
    cid.multihash.size !== 32
  )
    throw Error("ipfsInvalid");
  const path = segments
    .map((part) => {
      let decoded: string;
      try {
        decoded = decodeURIComponent(part);
      } catch {
        throw Error("ipfsInvalid");
      }
      if (
        !decoded ||
        decoded === "." ||
        decoded === ".." ||
        /[/\\\x00-\x1f\x7f]/.test(decoded)
      )
        throw Error("ipfsInvalid");
      return encodeURIComponent(decoded);
    })
    .join("/");
  return {
    cid: cid.toString(),
    path,
    name: segments.length
      ? decodeURIComponent(segments.at(-1)!)
      : "IPFS-evidence",
  };
}

export function ipfsURL(uri: string, gateway: Gateway = "dweb.link") {
  if (!GATEWAYS.includes(gateway)) throw Error("ipfsInvalid");
  const { cid, path } = parseIPFS(uri);
  // Per-CID origins prevent a published document sharing the application's origin.
  return `https://${cid}.ipfs.${gateway}/${path}`;
}

export async function fetchVerifiedIPFS(
  uri: string,
  expected: string,
  gateway: Gateway = "dweb.link",
  signal?: AbortSignal,
  request: typeof fetch = fetch,
) {
  if (!/^0x[0-9a-f]{64}$/i.test(expected) || /^0x0{64}$/i.test(expected))
    throw Error("ipfsDigest");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(cancel, 25000);
  try {
    const response = await request(ipfsURL(uri, gateway), {
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
    });
    if (!response.ok || !response.body) throw Error("ipfsUnavailable");
    const length = Number(response.headers.get("content-length"));
    if (length > IPFS_LIMIT) {
      await response.body.cancel();
      throw Error("fileTooLarge");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > IPFS_LIMIT) throw Error("fileTooLarge");
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    if (keccak256(bytes).toLowerCase() !== expected.toLowerCase())
      throw Error("ipfsMismatch");
    return { bytes, name: parseIPFS(uri).name };
  } catch (e) {
    if (controller.signal.aborted)
      throw Error(signal?.aborted ? "ipfsCancelled" : "ipfsTimeout");
    if (
      e instanceof Error &&
      [
        "fileTooLarge",
        "ipfsMismatch",
        "ipfsInvalid",
        "ipfsUnavailable",
      ].includes(e.message)
    )
      throw e;
    throw Error("ipfsUnavailable");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
