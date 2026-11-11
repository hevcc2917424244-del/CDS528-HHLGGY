import test from "node:test";
import assert from "node:assert/strict";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import { keccak256 } from "ethers";
import {
  fetchVerifiedIPFS,
  ipfsURL,
  parseIPFS,
  IPFS_LIMIT,
} from "../lib/stepfund/ipfs";
const bytes = new TextEncoder().encode("StepFund public evidence fixture\n");
const cid = CID.createV1(0x55, await sha256.digest(bytes)).toString();
const uri = `ipfs://${cid}`,
  digest = keccak256(bytes);
const response = (body: BodyInit, init?: ResponseInit) =>
  (async () => new Response(body, init)) as typeof fetch;
test("IPFS parsing uses isolated CID origins, normalizes paths, rejects traversal and malformed roots", () => {
  assert.equal(ipfsURL(uri), `https://${cid}.ipfs.dweb.link/`);
  assert.equal(parseIPFS(`${uri}/proof%20one.txt`).name, "proof one.txt");
  for (const value of [
    `${uri}/..`,
    `${uri}/%2e%2e`,
    `${uri}/a%2fb`,
    `${uri}/%00`,
    `${uri}?token=x`,
    `${uri}/`,
    "ipfs://bad",
    `https://${cid}`,
    `${uri}/%ZZ`,
    `${uri}/\\x`,
  ])
    assert.throws(() => parseIPFS(value), /ipfsInvalid/);
});
test("gateway file bytes must match the independently committed Keccak hash", async () => {
  const result = await fetchVerifiedIPFS(
    uri,
    digest,
    "dweb.link",
    undefined,
    response(bytes),
  );
  assert.deepEqual(result.bytes, bytes);
  await assert.rejects(
    fetchVerifiedIPFS(
      uri,
      digest,
      "dweb.link",
      undefined,
      response("tampered"),
    ),
    /ipfsMismatch/,
  );
  await assert.rejects(
    fetchVerifiedIPFS(uri, "0x" + "0".repeat(64)),
    /ipfsDigest/,
  );
});
test("missing and CORS-denied gateway responses are availability failures, not successful previews", async () => {
  await assert.rejects(
    fetchVerifiedIPFS(
      uri,
      digest,
      "dweb.link",
      undefined,
      response("missing", { status: 404 }),
    ),
    /ipfsUnavailable/,
  );
  await assert.rejects(
    fetchVerifiedIPFS(uri, digest, "dweb.link", undefined, (async () => {
      throw new TypeError("CORS");
    }) as typeof fetch),
    /ipfsUnavailable/,
  );
});
test("enforces size limits even when Content-Length is absent or dishonest", async () => {
  await assert.rejects(
    fetchVerifiedIPFS(
      uri,
      digest,
      "dweb.link",
      undefined,
      response(bytes, {
        headers: { "content-length": String(IPFS_LIMIT + 1) },
      }),
    ),
    /fileTooLarge/,
  );
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(IPFS_LIMIT));
      c.enqueue(new Uint8Array(1));
      c.close();
    },
  });
  await assert.rejects(
    fetchVerifiedIPFS(uri, digest, "dweb.link", undefined, response(stream)),
    /fileTooLarge/,
  );
});
test("requests omit credentials, prohibit redirects and propagate cancellation", async () => {
  const aborted = new AbortController();
  aborted.abort();
  const request = (async (_url: unknown, init: RequestInit) => {
    assert.equal(init.credentials, "omit");
    assert.equal(init.redirect, "error");
    assert.equal(init.referrerPolicy, "no-referrer");
    init.signal?.throwIfAborted();
    return new Response(bytes);
  }) as typeof fetch;
  await assert.rejects(
    fetchVerifiedIPFS(uri, digest, "dweb.link", aborted.signal, request),
    /ipfsCancelled/,
  );
});
