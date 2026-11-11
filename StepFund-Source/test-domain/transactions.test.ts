import test from "node:test";
import assert from "node:assert/strict";
import {
  keccak256,
  type TransactionResponse,
  type TransactionReceipt,
  type Provider,
} from "ethers";
import {
  journalTransaction,
  waitRecorded,
  transactionRecords,
  checkRecorded,
  sameIntent,
} from "../lib/stepfund/transactions";
const map = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => map.get(k) || null,
    setItem: (k: string, v: string) => map.set(k, v),
    removeItem: (k: string) => map.delete(k),
  },
  configurable: true,
});
const hash = (n: number) => "0x" + n.toString(16).padStart(64, "0"),
  account = "0x" + "11".repeat(20);
const tx = (n: number) =>
  ({
    hash: hash(n),
    from: account,
    nonce: n,
    to: "0x" + "22".repeat(20),
    data: "0x1234",
    value: BigInt(0),
  }) as TransactionResponse;
const record = (t: TransactionResponse) =>
  journalTransaction(t, {
    chainId: 31337,
    account,
    kind: "contribute",
    projectId: t.to!,
    factory: "0x" + "33".repeat(20),
  });
test("RPC timeout retains a pending record instead of marking a broadcast transaction failed", async () => {
  const t = tx(1);
  t.wait = async () => {
    throw Object.assign(Error("offline"), { code: "TIMEOUT" });
  };
  const r = record(t);
  await assert.rejects(() => waitRecorded(t, r), /transactionPending/);
  assert.equal(
    transactionRecords().find((x) => x.hash === t.hash)?.status,
    "pending",
  );
  assert.equal(
    JSON.parse(map.get("stepfund-transaction-journal-v1")!).find(
      (x: { hash: string }) => x.hash === t.hash,
    ).status,
    "pending",
  );
});
test("identical accelerated replacement succeeds, changed action is cancelled", async () => {
  for (const changed of [false, true]) {
    const t = tx(changed ? 3 : 2),
      replacement = { ...t, hash: hash(22), data: changed ? "0x" : "0x1234" };
    t.wait = async () => {
      throw {
        code: "TRANSACTION_REPLACED",
        replacement,
        receipt: { status: 1, hash: replacement.hash },
      };
    };
    const r = record(t);
    assert.equal(sameIntent(r, replacement), !changed);
    if (changed)
      await assert.rejects(() => waitRecorded(t, r), /transactionCancelled/);
    else assert.equal((await waitRecorded(t, r)).hash, hash(22));
    assert.equal(
      transactionRecords().find((x) => x.hash === t.hash)?.status,
      changed ? "cancelled" : "confirmed",
    );
  }
});
test("receipt recovery validates network, sender, nonce and exact action", async () => {
  const t = tx(4),
    r = record(t);
  let network = 1,
    sender = "0x" + "99".repeat(20);
  const provider = {
    getNetwork: async () => ({ chainId: BigInt(network) }),
    getTransactionReceipt: async () => ({ status: 1 }),
    getTransaction: async () => ({ ...t, from: sender }),
  } as unknown as Provider;
  await assert.rejects(() => checkRecorded(provider, r), /wrongNetwork/);
  network = 31337;
  await assert.rejects(() => checkRecorded(provider, r), /invalidTransaction/);
  sender = account;
  assert.equal((await checkRecorded(provider, r)).status, "confirmed");
});
