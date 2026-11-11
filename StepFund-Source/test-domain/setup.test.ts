import { test } from "node:test";
import assert from "node:assert/strict";
import { assertWalletNetwork } from "../lib/stepfund/wallet";
import {
  parsePublicDeployment,
  matchState,
  submitVerification,
  pollVerification,
  checkVerification,
} from "../lib/stepfund/setup";
const address = "0x1111111111111111111111111111111111111111";
test("phone wallets reject loopback chains, and every transport rejects mainnet", () => {
  assert.doesNotThrow(() => assertWalletNetwork(11155111, "phone"));
  assert.doesNotThrow(() => assertWalletNetwork(31337, "browser"));
  assert.throws(() => assertWalletNetwork(31337, "phone"), /phoneSepoliaOnly/);
  for (const via of ["phone", "browser"] as const)
    assert.throws(() => assertWalletNetwork(1, via), /wrongNetwork/);
});
test("shared deployment records retain public allowlisted fields only", () => {
  assert.deepEqual(
    parsePublicDeployment({
      chainId: 11155111,
      factory: address,
      token: address,
      privateKey: "not-exported",
      rpcUrl: "https://untrusted.invalid",
      verified: true,
    }),
    { chainId: 11155111, factory: address, token: address },
  );
});
test("configuration import rejects mainnet, malformed addresses and wrong token types", () => {
  for (const value of [
    null,
    { chainId: 1, factory: address },
    { chainId: 11155111, factory: "bad" },
    { chainId: 31337, factory: address, token: 123 },
  ])
    assert.throws(() => parsePublicDeployment(value));
});
test("verification requires both creation and runtime matches for the requested address", () => {
  const base = { chainId: "11155111", address };
  assert.equal(
    matchState(
      { ...base, runtimeMatch: "exact_match", creationMatch: "match" },
      address,
    ).state,
    "verified",
  );
  assert.equal(
    matchState(
      { ...base, runtimeMatch: "exact_match", creationMatch: null },
      address,
    ).state,
    "partial",
  );
  assert.equal(
    matchState({ ...base, runtimeMatch: null, creationMatch: null }, address)
      .state,
    "unverified",
  );
  assert.throws(() => matchState({ ...base, chainId: "1" }, address));
  assert.throws(() =>
    matchState(
      { ...base, address: "0x2222222222222222222222222222222222222222" },
      address,
    ),
  );
});
test("verification tickets are pending, and completed jobs with errors remain failed", async () => {
  const original = globalThis.fetch;
  const id = "72d12273-0723-448e-a9f6-f7957128efa5";
  try {
    let posted: Record<string, unknown> = {};
    globalThis.fetch = async (input, init) => {
      if (String(input).startsWith("/contracts/"))
        return Response.json({
          stdJsonInput: { language: "Solidity" },
          compilerVersion: "0.8.30",
          contractIdentifier: "contracts/TestUSD.sol:TestUSD",
        });
      posted = JSON.parse(String(init?.body));
      return Response.json({ verificationId: id });
    };
    assert.deepEqual(await submitVerification(address, "TestUSD"), {
      state: "pending",
      id,
    });
    assert.equal(posted.compilerVersion, "0.8.30");
    assert.equal(Object.hasOwn(posted, "apiKey"), false);
    globalThis.fetch = async () => Response.json({ isJobCompleted: false });
    assert.equal((await pollVerification(id, address)).state, "pending");
    globalThis.fetch = async () =>
      Response.json({
        isJobCompleted: true,
        error: { customCode: "no_match" },
      });
    assert.equal((await pollVerification(id, address)).state, "failed");
    globalThis.fetch = async () =>
      Response.json({
        isJobCompleted: true,
        contract: {
          chainId: "11155111",
          address,
          runtimeMatch: "match",
          creationMatch: "exact_match",
        },
      });
    assert.equal((await pollVerification(id, address)).state, "verified");
  } finally {
    globalThis.fetch = original;
  }
});
test("verification outages are distinct from unverified contracts", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("", { status: 404 });
    assert.equal((await checkVerification(address)).state, "unverified");
    globalThis.fetch = async () => new Response("", { status: 429 });
    await assert.rejects(checkVerification(address), /verificationUnavailable/);
    await assert.rejects(pollVerification("../not-a-job", address));
  } finally {
    globalThis.fetch = original;
  }
});
