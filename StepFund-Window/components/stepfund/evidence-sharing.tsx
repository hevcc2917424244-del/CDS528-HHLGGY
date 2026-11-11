"use client";
import { useEffect, useRef, useState } from "react";
import {
  Archive,
  Download,
  Upload,
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  downloadBlob,
  importVerifiedAttachments,
  type Attachment,
} from "@/lib/stepfund/attachments";
import type { CheckedBundle } from "@/lib/stepfund/evidence-bundle";
import type { Project } from "@/lib/stepfund/model";
import type { Context } from "./shared";

export function EvidenceSharing({
  rows,
  project: p,
  ctx,
  scope,
}: {
  rows: Attachment[];
  project: Project;
  ctx: Context;
  scope: string;
}) {
  const { s, lang } = ctx;
  const [working, setWorking] = useState<"" | "export" | "inspect" | "save">(
      "",
    ),
    [progress, setProgress] = useState({ completed: 0, total: 0 }),
    [bundle, setBundle] = useState<CheckedBundle | null>(null),
    [result, setResult] = useState<{ added: number; skipped: number } | null>(
      null,
    ),
    [exported, setExported] = useState(false);
  const controller = useRef<AbortController | null>(null),
    input = useRef<HTMLInputElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const start = (phase: "export" | "inspect") => {
    if (controller.current || working || ctx.busy) return null;
    const c = new AbortController();
    controller.current = c;
    setWorking(phase);
    setProgress({ completed: 0, total: 0 });
    setResult(null);
    setExported(false);
    return c;
  };
  const update = (completed: number, total: number) =>
    setProgress({ completed, total });
  const failed = (e: unknown) => {
    const key = e instanceof Error ? e.message : "bundleInvalid";
    if (key !== "bundleCancelled")
      ctx.notifyError(
        /^(bundleInvalid|bundleFormat|bundleHashMismatch|bundleWrongProject|bundleLimit|bundleEmpty|bundleProcessing|fileTooLarge|evidenceQuota|evidenceStorage)$/.test(
          key,
        )
          ? key
          : "bundleProcessing",
      );
  };
  async function exportFiles() {
    const c = start("export");
    if (!c) return;
    try {
      const [{ bundleTarget }, { processEvidence }] = await Promise.all([
        import("@/lib/stepfund/evidence-bundle"),
        import("@/lib/stepfund/evidence-client"),
      ]);
      const bytes = await processEvidence<Uint8Array<ArrayBuffer>>(
        {
          operation: "export",
          rows,
          target: bundleTarget(p, ctx.mode, ctx.chainId),
          title: p.title[lang],
        },
        c.signal,
        update,
      );
      if (c.signal.aborted) return;
      downloadBlob(
        new Blob([bytes], { type: "application/zip" }),
        `StepFund-evidence-${p.id.slice(0, 24)}.zip`,
      );
      setExported(true);
    } catch (e) {
      failed(e);
    } finally {
      controller.current = null;
      setWorking("");
    }
  }
  async function inspect(file: File | undefined) {
    if (!file) return;
    const c = start("inspect");
    if (!c) return;
    try {
      const [{ BUNDLE_LIMIT, bundleTarget }, { processEvidence }] =
        await Promise.all([
          import("@/lib/stepfund/evidence-bundle"),
          import("@/lib/stepfund/evidence-client"),
        ]);
      if (file.size > BUNDLE_LIMIT) throw Error("bundleLimit");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const checked = await processEvidence<CheckedBundle>(
        {
          operation: "inspect",
          bytes,
          target: bundleTarget(p, ctx.mode, ctx.chainId),
          stageCount: p.stages.length,
        },
        c.signal,
        update,
      );
      if (!c.signal.aborted) setBundle(checked);
    } catch (e) {
      failed(e);
    } finally {
      controller.current = null;
      setWorking("");
    }
  }
  async function save() {
    if (!bundle || working || ctx.busy) return;
    setWorking("save");
    try {
      const { bundleTarget, sameBundleTarget } = await import(
        "@/lib/stepfund/evidence-bundle"
      );
      if (
        !sameBundleTarget(
          bundle.manifest.target,
          bundleTarget(p, ctx.mode, ctx.chainId),
        )
      )
        throw Error("bundleWrongProject");
      const imported = await importVerifiedAttachments(scope, bundle.files);
      setResult(imported);
      setBundle(null);
    } catch (e) {
      failed(e);
    } finally {
      setWorking("");
    }
  }
  const matched =
    bundle?.files.filter(
      (f) => f.digest.toLowerCase() === p.stages[f.stage]?.digest.toLowerCase(),
    ).length || 0;
  const duplicates =
    bundle?.files.filter((f) =>
      rows.some(
        (r) =>
          r.stage === f.stage &&
          r.digest.toLowerCase() === f.digest.toLowerCase(),
      ),
    ).length || 0;
  const label =
    working === "export"
      ? s("Preparing evidence package…", "正在打包成果文件…")
      : working === "inspect"
        ? s("Checking package integrity…", "正在核对成果包完整性…")
        : s("Saving files…", "正在保存文件…");
  return (
    <div className="evidence-sharing">
      <div className="flex items-center gap-2">
        <Archive size={19} />
        <h3>{s("Share evidence in one package", "一包分享成果")}</h3>
      </div>
      <p>
        {s(
          "Export a ZIP with the actual files. Send it to a reviewer, who opens this same project and imports it here. Files and milestone hashes are checked before saving; no cloud account is needed.",
          "导出包含真实文件的 ZIP，发给审查者。对方打开同一项目并在此导入，程序核对文件及阶段哈希后再保存，无须注册云盘账号。",
        )}
      </p>
      <div className="bundle-actions">
        <Button
          variant="outline"
          disabled={!rows.length || !!working || ctx.busy}
          onClick={() => void exportFiles()}
        >
          <Download size={15} />
          {s("Export evidence ZIP", "导出成果 ZIP")}
        </Button>
        <Button
          variant="outline"
          disabled={!!working || ctx.busy}
          onClick={() => input.current?.click()}
        >
          <Upload size={15} />
          {s("Import evidence ZIP", "导入成果 ZIP")}
        </Button>
        <input
          ref={input}
          type="file"
          accept=".zip,application/zip"
          className="sr-only"
          aria-label={s("Evidence package ZIP", "成果 ZIP 文件")}
          disabled={!!working || ctx.busy}
          onChange={(e) => {
            void inspect(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {!!working && (
          <div className="bundle-progress" role="status">
            <Loader2 size={15} className="animate-spin" />
            <span>
              {label}
              {progress.total > 0 && working !== "save"
                ? ` ${progress.completed}/${progress.total}`
                : ""}
            </span>
            {working !== "save" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => controller.current?.abort()}
              >
                <X size={14} />
                {s("Cancel", "取消")}
              </Button>
            )}
          </div>
        )}
      </div>
      {result && (
        <p className="success-text" role="status">
          {s(
            `${result.added} files imported; ${result.skipped} duplicates skipped.`,
            `已导入 ${result.added} 个文件，跳过 ${result.skipped} 个重复文件。`,
          )}
        </p>
      )}
      {exported && (
        <p className="success-text" role="status">
          {s(
            "ZIP downloaded with file contents and a hash manifest. Send this original ZIP without recompressing it.",
            "已下载包含文件本体与哈希清单的 ZIP，请直接发送原包，无须重新压缩。",
          )}
        </p>
      )}
      <small>
        {s(
          "Up to 100 files / 100 MB total, 20 MB each. The ZIP contains the selected project's locally saved evidence, not wallet secrets or other projects.",
          "最多 100 个文件、总计 100 MB，每个不超过 20 MB。ZIP 仅包含本项目已保存的成果，不包含钱包秘密或其他项目。",
        )}
      </small>
      <Dialog
        open={!!bundle}
        onOpenChange={(open) => {
          if (!open && working !== "save") setBundle(null);
        }}
      >
        <DialogContent className="bundle-dialog">
          <DialogTitle>
            {s("Review shared evidence", "检查收到的成果包")}
          </DialogTitle>
          <DialogDescription>
            {s(
              "Every file matches its package manifest. This checks consistency, not who created the package or whether its claims are true. Saving does not submit evidence or send a transaction.",
              "全部文件与包内哈希清单一致。这仅验证完整性，不认证发送者或成果真实性。保存文件不会提交链上成果或发送交易。",
            )}
          </DialogDescription>
          {bundle && (
            <>
              <div className="bundle-summary">
                <CheckCircle2 size={23} />
                <div>
                  <strong>{p.title[lang]}</strong>
                  <p>
                    {ctx.mode === "practice"
                      ? s(
                          "Practice evidence · no on-chain proof",
                          "演示成果 · 无链上证明",
                        )
                      : ctx.chainId === 11155111
                        ? "Sepolia"
                        : "Hardhat Local"}{" "}
                    · {bundle.files.length} {s("files", "个文件")} ·{" "}
                    {bundle.totalBytes < 1024
                      ? `${bundle.totalBytes} B`
                      : bundle.totalBytes < 1024 * 1024
                        ? `${(bundle.totalBytes / 1024).toFixed(1)} KB`
                        : `${(bundle.totalBytes / 1024 / 1024).toFixed(2)} MB`}
                  </p>
                </div>
              </div>
              <p className="scope-note">
                {s(
                  `Files matching ${ctx.mode === "chain" ? "current on-chain" : "current practice"} milestone commitments: ${matched}. Supplementary or uncommitted: ${bundle.files.length - matched}.`,
                  `${matched} 个文件与当前${ctx.mode === "chain" ? "链上" : "演示"}阶段提交哈希一致，其余 ${bundle.files.length - matched} 个为补充或未提交材料。`,
                )}
              </p>
              <div className="bundle-file-list">
                {bundle.files.map((f) => (
                  <div key={f.path}>
                    <div>
                      <strong>{f.name}</strong>
                      <small>
                        {s("Milestone", "阶段")} {f.stage + 1} ·{" "}
                        {(f.size / 1024).toFixed(1)} KB
                      </small>
                    </div>
                    <span
                      className={
                        f.digest.toLowerCase() ===
                        p.stages[f.stage]?.digest.toLowerCase()
                          ? "success-text"
                          : "muted"
                      }
                    >
                      {f.digest.toLowerCase() ===
                      p.stages[f.stage]?.digest.toLowerCase()
                        ? s("Commitment matches", "与提交哈希一致")
                        : s("Supplementary", "补充材料")}
                    </span>
                  </div>
                ))}
              </div>
              <details className="bundle-hash">
                <summary>
                  {s(
                    "Package fingerprint (Keccak-256)",
                    "成果包指纹（Keccak-256）",
                  )}
                </summary>
                <code>{bundle.packageHash}</code>
              </details>
              {duplicates > 0 && (
                <p className="muted text-sm">
                  {s(
                    `${duplicates} identical files already exist and will be skipped.`,
                    `${duplicates} 个相同文件已存在，将自动跳过。`,
                  )}
                </p>
              )}
              <div className="bundle-actions justify-end">
                <Button
                  variant="outline"
                  disabled={working === "save"}
                  onClick={() => setBundle(null)}
                >
                  {s("Cancel", "取消")}
                </Button>
                <Button
                  disabled={!!working || ctx.busy}
                  onClick={() => void save()}
                >
                  {working === "save"
                    ? s("Saving…", "正在保存…")
                    : s("Save to evidence library", "保存到证据库")}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
