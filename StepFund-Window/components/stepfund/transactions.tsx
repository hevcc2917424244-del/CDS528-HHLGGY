"use client";
import { useEffect, useState } from "react";
import { BrowserProvider } from "ethers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { walletProvider } from "@/lib/stepfund/wallet";
import {
  transactionRecords,
  checkRecorded,
  journalStorageAvailable,
  type TxRecord,
} from "@/lib/stepfund/transactions";
import { errorKey } from "@/lib/stepfund/chain";
import { short } from "@/lib/stepfund/model";
import { dateTime, type Context } from "./shared";
const kinds: Record<string, [string, string]> = {
  deployToken: ["Deploy test token", "部署测试代币"],
  deployFactory: ["Deploy factory", "部署工厂"],
  approve: ["Token approval", "代币授权"],
  contribute: ["Contribute", "出资"],
  create: ["Create project", "创建项目"],
  faucet: ["Claim test tokens", "领取测试代币"],
  evidence: ["Submit evidence", "提交成果"],
  voteYes: ["Approve milestone", "赞成阶段"],
  voteNo: ["Reject milestone", "反对阶段"],
  settle: ["Settle vote", "结算投票"],
  finalize: ["Finalize funding", "结算募集"],
  expire: ["Open refunds", "开放退款"],
  refund: ["Claim refund", "领取退款"],
  withdraw: ["Withdraw funds", "提取资金"],
  pause: ["Pause funding", "暂停募集"],
  unpause: ["Resume funding", "恢复募集"],
};
export function TransactionJournal({
  ctx,
  onRefresh,
}: {
  ctx: Context;
  onRefresh: () => void;
}) {
  const { s, lang } = ctx;
  const [limit, setLimit] = useState(30);
  const [rows, setRows] = useState<TxRecord[]>([]),
    [working, setWorking] = useState(""),
    [message, setMessage] = useState(""),
    [hashes, setHashes] = useState<Record<string, string>>({});
  useEffect(() => {
    const load = () =>
      setRows(
        [...transactionRecords()].sort(
          (a, b) =>
            Number(b.status === "pending") - Number(a.status === "pending") ||
            b.time - a.time,
        ),
      );
    load();
    window.addEventListener("stepfund-transactions-changed", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("stepfund-transactions-changed", load);
      window.removeEventListener("storage", load);
    };
  }, []);
  async function check(row: TxRecord) {
    setWorking(row.hash);
    setMessage("");
    try {
      const provider = new BrowserProvider(walletProvider());
      const updated = await checkRecorded(
        provider,
        row,
        hashes[row.hash]?.trim() || undefined,
      );
      setMessage(updated.status === "pending" ? "pending" : "checked");
      if (updated.status === "confirmed") onRefresh();
    } catch (e) {
      ctx.notifyError(errorKey(e));
    } finally {
      setWorking("");
    }
  }
  return (
    <section className="panel">
      <h2>{s("Transaction recovery", "交易状态与恢复")}</h2>
      <p className="muted text-sm">
        {s(
          "Broadcast transactions survive a page reload in this browser. Check their receipt before retrying. A missing receipt means pending or unknown, not failed. Connect the original network to check; deployment recovery also needs the original account.",
          "此浏览器会保留已广播交易，刷新页面后仍可查询。重试前先检查回执；查不到回执仅表示待确认或未知，不代表失败。查询需连接原网络，恢复部署还需使用原账户。",
        )}
      </p>
      <p role="status" className="muted">
        {message === "pending"
          ? s(
              "No receipt yet. Check your wallet or explorer; do not resend blindly.",
              "尚未查到回执，请查看钱包或区块浏览器，不要重复发送。",
            )
          : message === "checked"
            ? s(
                "Receipt checked. Project data will refresh when connected.",
                "已核对回执，连接状态下会刷新项目数据。",
              )
            : ""}
      </p>
      {!journalStorageAvailable() && (
        <p role="alert" className="scope-note">
          {s(
            "Browser storage is full. These records are only in memory; copy the public transaction hashes before closing this page.",
            "浏览器存储已满，这些记录仅保留在内存中，请在关闭页面前复制公开交易哈希。",
          )}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="empty-small">
          {s(
            "No wallet transactions recorded in this browser.",
            "此浏览器尚无钱包交易记录。",
          )}
        </p>
      ) : (
        <div className="journal-list">
          {rows.slice(0, limit).map((row) => (
            <article key={row.hash} className="journal-row">
              <div>
                <strong>
                  {kinds[row.kind]
                    ? s(...kinds[row.kind])
                    : s("Transaction", "交易")}
                </strong>{" "}
                ·{" "}
                <span className={`tx-${row.status}`}>
                  {row.status === "pending"
                    ? s("Pending / unknown", "待确认 / 未知")
                    : row.status === "confirmed"
                      ? s("Confirmed", "已确认")
                      : row.status === "cancelled"
                        ? s("Replaced / cancelled", "已替换 / 取消")
                        : s("Reverted", "执行失败")}
                </span>
                <p className="muted text-xs">
                  {row.chainId === 11155111 ? "Sepolia" : "Hardhat Local"} ·{" "}
                  {short(row.account)} · {dateTime(row.time / 1000, lang)}
                </p>
                <code className="break-all">{row.replacement || row.hash}</code>
                {row.chainId === 11155111 && (
                  <a
                    className="subtle-link"
                    href={`https://sepolia.etherscan.io/tx/${row.replacement || row.hash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {s("View on explorer", "查看区块浏览器")}
                  </a>
                )}
              </div>
              {row.status === "pending" && (
                <div className="journal-actions">
                  <Button
                    variant="outline"
                    disabled={ctx.busy || !!working}
                    onClick={() => void check(row)}
                  >
                    {working === row.hash
                      ? s("Checking…", "查询中…")
                      : s("Check receipt", "检查回执")}
                  </Button>
                  <details>
                    <summary>
                      {s("Replaced in your wallet?", "在钱包中替换过交易？")}
                    </summary>
                    <Input
                      aria-label={s(
                        "Replacement transaction hash",
                        "替换交易哈希",
                      )}
                      placeholder="0x…"
                      value={hashes[row.hash] || ""}
                      onChange={(e) =>
                        setHashes({ ...hashes, [row.hash]: e.target.value })
                      }
                    />
                    <small>
                      {s(
                        "Paste the replacement hash and check. The sender and nonce must match; only an identical action counts as success.",
                        "粘贴替换交易哈希后查询。发送者与序号须一致，仅相同操作执行成功才标为已确认。",
                      )}
                    </small>
                  </details>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {rows.length > limit && (
        <Button variant="outline" onClick={() => setLimit(limit + 30)}>
          {s("Show more records", "显示更多记录")}
        </Button>
      )}
      {rows.length > 30 && (
        <Button
          variant="outline"
          onClick={() => {
            const blob = new Blob([JSON.stringify(rows, null, 2)], {
              type: "application/json",
            });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "StepFund-transactions.json";
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          }}
        >
          {s("Export full journal", "导出完整交易记录")}
        </Button>
      )}
    </section>
  );
}
