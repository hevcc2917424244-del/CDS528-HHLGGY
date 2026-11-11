import {
  keccak256,
  type Provider,
  type TransactionResponse,
  type TransactionReceipt,
} from "ethers";

export type TxRecord = {
  hash: string;
  chainId: number;
  account: string;
  kind: string;
  projectId: string;
  factory: string;
  status: "pending" | "confirmed" | "failed" | "cancelled";
  time: number;
  nonce: number;
  to: string | null;
  dataHash: string;
  value: string;
  replacement?: string;
};
const KEY = "stepfund-transaction-journal-v1";
let memory: TxRecord[] = [];
let storageFailed = false;
export const journalStorageAvailable = () => !storageFailed;
export function transactionRecords(): TxRecord[] {
  try {
    if (!storageFailed) {
      const rows = JSON.parse(localStorage.getItem(KEY) || "[]");
      if (Array.isArray(rows))
        memory = rows.filter(
          (r) =>
            /^0x[\da-f]{64}$/i.test(r.hash) &&
            [31337, 11155111].includes(r.chainId) &&
            ["pending", "confirmed", "failed", "cancelled"].includes(
              r.status,
            ) &&
            typeof r.account === "string" &&
            Number.isInteger(r.nonce),
        );
    }
  } catch {}
  return memory;
}
export function requireJournal() {
  try {
    localStorage.setItem("stepfund-storage-check", "1");
    localStorage.removeItem("stepfund-storage-check");
  } catch {
    throw Error("transactionStorage");
  }
}
export function saveRecord(record: TxRecord) {
  const rows = transactionRecords().filter((r) => r.hash !== record.hash);
  memory = [record, ...rows];
  // Never evict unresolved transactions to make room for history.
  memory = memory.filter((r, i) => r.status === "pending" || i < 200);
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
    storageFailed = false;
  } catch {
    storageFailed = true;
  }
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("stepfund-transactions-changed"));
}
export function pendingFor(
  chainId: number,
  account: string,
  kind: string,
  projectId = "",
  factory = "",
) {
  return transactionRecords().find(
    (r) =>
      r.status === "pending" &&
      r.chainId === chainId &&
      r.account.toLowerCase() === account.toLowerCase() &&
      r.kind === kind &&
      r.projectId.toLowerCase() === projectId.toLowerCase() &&
      r.factory.toLowerCase() === factory.toLowerCase(),
  );
}
export function journalTransaction(
  tx: TransactionResponse,
  scope: {
    chainId: number;
    account: string;
    kind: string;
    projectId?: string;
    factory?: string;
  },
) {
  const record: TxRecord = {
    hash: tx.hash,
    chainId: scope.chainId,
    account: scope.account.toLowerCase(),
    kind: scope.kind,
    projectId: scope.projectId || "",
    factory: scope.factory || "",
    status: "pending",
    time: Date.now(),
    nonce: tx.nonce,
    to: tx.to?.toLowerCase() || null,
    dataHash: keccak256(tx.data),
    value: tx.value.toString(),
  };
  saveRecord(record);
  return record;
}
export function sameIntent(
  r: TxRecord,
  tx: Pick<TransactionResponse, "from" | "nonce" | "to" | "data" | "value">,
) {
  return (
    tx.from.toLowerCase() === r.account.toLowerCase() &&
    tx.nonce === r.nonce &&
    (tx.to?.toLowerCase() || null) === r.to &&
    keccak256(tx.data) === r.dataHash &&
    tx.value.toString() === r.value
  );
}
export async function waitRecorded(
  tx: TransactionResponse,
  record: TxRecord,
  timeout = 120000,
): Promise<TransactionReceipt> {
  try {
    const receipt = await tx.wait(1, timeout);
    if (!receipt) throw Error("transactionPending");
    saveRecord({
      ...record,
      status: receipt.status === 1 ? "confirmed" : "failed",
    });
    if (receipt.status !== 1) throw Error("transactionFailed");
    return receipt;
  } catch (error) {
    const e = error as {
      code?: string;
      receipt?: TransactionReceipt;
      replacement?: TransactionResponse;
      message?: string;
    };
    if (e.code === "TRANSACTION_REPLACED" && e.receipt && e.replacement) {
      const same = sameIntent(record, e.replacement);
      saveRecord({
        ...record,
        replacement: e.replacement.hash,
        status: !same
          ? "cancelled"
          : e.receipt.status === 1
            ? "confirmed"
            : "failed",
      });
      if (!same) throw Error("transactionCancelled");
      if (e.receipt.status !== 1) throw Error("transactionFailed");
      return e.receipt;
    }
    if (e.receipt) {
      saveRecord({ ...record, status: "failed" });
      throw Error("transactionFailed");
    }
    if (e.message === "transactionFailed") throw error;
    // RPC failure or elapsed wait does not prove a transaction failed.
    throw Error("transactionPending");
  }
}
export async function checkRecorded(
  provider: Provider,
  record: TxRecord,
  replacementHash?: string,
) {
  if (Number((await provider.getNetwork()).chainId) !== record.chainId)
    throw Error("wrongNetwork");
  const hash = replacementHash || record.replacement || record.hash;
  if (!/^0x[\da-f]{64}$/i.test(hash)) throw Error("invalidTransaction");
  const receipt = await provider.getTransactionReceipt(hash);
  if (!receipt) return record;
  const tx = await provider.getTransaction(hash);
  if (!tx) throw Error("transactionPending");
  if (
    tx.from.toLowerCase() !== record.account.toLowerCase() ||
    tx.nonce !== record.nonce
  )
    throw Error("invalidTransaction");
  const updated: TxRecord = {
    ...record,
    ...(hash !== record.hash ? { replacement: hash } : {}),
    status: !sameIntent(record, tx)
      ? "cancelled"
      : receipt.status === 1
        ? "confirmed"
        : "failed",
  };
  saveRecord(updated);
  return updated;
}
