"use client";
import { useEffect, useState } from "react";
import { FileText, Download, Eye, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listAttachments,
  saveAttachment,
  removeAttachment,
  downloadBlob,
  previewType,
  type Attachment,
} from "@/lib/stepfund/attachments";
import type { Project } from "@/lib/stepfund/model";
import { ConfirmButton, dateTime, Picker, type Context } from "./shared";
import { EvidenceSharing } from "./evidence-sharing";
import { IPFSUpload } from "./ipfs";

export function evidenceScope(p: Project, ctx: Context) {
  return `${ctx.mode}:${ctx.mode === "chain" ? ctx.chainId || 0 : 0}:${p.id}:${p.createdAt}`;
}
export function Attachments({
  project: p,
  ctx,
  onSelect,
}: {
  project: Project;
  ctx: Context;
  onSelect: (hash: string, uri?: string) => void;
}) {
  const { s, lang } = ctx,
    scope = evidenceScope(p, ctx);
  const [rows, setRows] = useState<Attachment[]>([]),
    [selection, setSelection] = useState<{
      current: number;
      value: string;
    } | null>(null),
    [working, setWorking] = useState(false),
    [message, setMessage] = useState("");
  const stage =
    selection?.current === p.current
      ? selection.value
      : String(Math.min(p.current, p.stages.length - 1));
  const [preview, setPreview] = useState<{
    name: string;
    url?: string;
    text?: string;
    unsupported?: boolean;
  } | null>(null);
  useEffect(() => {
    setMessage("");
  }, [p.current, p.stages.length, p.stages[p.current]?.state]);
  useEffect(() => {
    let live = true;
    const load = () =>
      void listAttachments(scope)
        .then((r) => {
          if (live) setRows(r);
        })
        .catch(() => {
          if (live) setMessage("storage");
        });
    load();
    window.addEventListener("stepfund-evidence-changed", load);
    return () => {
      live = false;
      window.removeEventListener("stepfund-evidence-changed", load);
    };
  }, [scope]);
  useEffect(
    () => () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  async function save(files: FileList | null) {
    if (!files || ctx.busy || working) return;
    setWorking(true);
    setMessage("");
    try {
      for (const file of Array.from(files))
        await saveAttachment(scope, Number(stage), file);
      setMessage("saved");
    } catch (e) {
      ctx.notifyError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function show(row: Attachment) {
    try {
      const bytes = new Uint8Array(
          await row.blob.slice(0, 65536).arrayBuffer(),
        ),
        type = previewType(row.name, bytes);
      setPreview(
        type === "text"
          ? { name: row.name, text: new TextDecoder().decode(bytes) }
          : type
            ? {
                name: row.name,
                url: URL.createObjectURL(new Blob([row.blob], { type })),
              }
            : { name: row.name, unsupported: true },
      );
    } catch {
      ctx.notifyError("evidenceStorage");
    }
  }
  return (
    <section
      className="panel attachment-panel"
      aria-label={s("Evidence library", "证据附件库")}
    >
      <div className="insight-title">
        <div>
          <p className="eyebrow">{s("EVIDENCE LIBRARY", "证据附件库")}</p>
          <h2>{s("Files behind the milestones", "阶段成果文件")}</h2>
        </div>
        <FolderOpen />
      </div>
      <p className="muted text-sm">
        {s(
          "Files are saved in this browser. Export an evidence ZIP to back them up or share them with reviewers. Publish the primary file at its HTTPS / IPFS evidence URL; saving or sharing locally does not upload it.",
          "文件保存在当前浏览器，可导出成果 ZIP 进行备份或分享。主文件仍需发布到成果链接对应的 HTTPS / IPFS 地址，本地保存与分享不会上传文件。",
        )}
      </p>
      <EvidenceSharing rows={rows} project={p} ctx={ctx} scope={scope} />
      <IPFSUpload key={scope} rows={rows} ctx={ctx} onSelect={onSelect} />
      <div className="attachment-upload">
        <Picker
          label={s("Attachment milestone", "附件所属阶段")}
          value={stage}
          onChange={(value) => setSelection({ current: p.current, value })}
          items={p.stages.map((m, i) => ({
            value: String(i),
            label: `${i + 1}. ${m.title[lang]}`,
          }))}
        />
        <label className="field !m-0">
          {s("Save attachments (20 MB each)", "保存附件（每个最大 20 MB）")}
          <Input
            type="file"
            multiple
            disabled={working || ctx.busy}
            onChange={(e) => {
              void save(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p role="status" className="muted text-sm">
        {working
          ? s("Saving and hashing…", "正在保存并计算哈希…")
          : message === "saved"
            ? s(
                "Attachments saved. Their hashes have been calculated.",
                "附件已保存，哈希已计算。",
              )
            : message === "storage"
              ? s(
                  "Browser storage is unavailable. Enable it to save attachments.",
                  "浏览器存储不可用，请启用存储后保存附件。",
                )
              : s(
                  "100 MB library limit per browser origin. The contract anchors one primary file per milestone; other attachments are supplementary.",
                  "每个浏览器站点的附件库上限为 100 MB。合约每阶段记录一个主文件哈希，其他文件为补充材料。",
                )}
      </p>
      {rows.length > 0 && (
        <Button
          variant="outline"
          className="my-3"
          onClick={() =>
            downloadBlob(
              new Blob(
                [
                  JSON.stringify(
                    {
                      version: 1,
                      project: p.id,
                      network: ctx.chainId || null,
                      mode: ctx.mode,
                      files: rows.map(({ blob, ...r }) => ({
                        ...r,
                        evidenceURL: p.stages[r.stage]?.evidence || null,
                        committedHash: p.stages[r.stage]?.digest || null,
                      })),
                    },
                    null,
                    2,
                  ),
                ],
                { type: "application/json" },
              ),
              "StepFund-evidence-manifest.json",
            )
          }
        >
          <Download size={15} />
          {s("Download manifest", "下载附件清单")}
        </Button>
      )}
      <div className="attachment-list">
        {rows.length === 0 ? (
          <p className="empty-small">
            {s(
              "No saved attachments yet. Add files to keep a reviewable evidence trail.",
              "尚无已保存的附件，可添加文件以保留可审查的成果材料。",
            )}
          </p>
        ) : (
          rows.map((row) => {
            const matches =
              row.digest.toLowerCase() ===
              p.stages[row.stage]?.digest.toLowerCase();
            return (
              <article className="attachment-row" key={row.id}>
                <FileText size={20} />
                <div className="attachment-meta">
                  <h3>{row.name}</h3>
                  <p className="muted text-xs">
                    {s("Milestone", "阶段")} {row.stage + 1} ·{" "}
                    {(row.size / 1024).toFixed(1)} KB ·{" "}
                    {dateTime(row.savedAt / 1000, lang)}
                  </p>
                  <code>{row.digest}</code>
                  <span className={matches ? "success-text" : "muted"}>
                    {matches
                      ? ctx.mode === "chain"
                        ? s("Matches on-chain hash", "与链上哈希一致")
                        : s("Matches practice commitment", "与演示提交哈希一致")
                      : s(
                          "Not the committed primary file",
                          "非当前已提交主文件",
                        )}
                  </span>
                </div>
                <div className="attachment-actions">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void show(row)}
                  >
                    <Eye size={14} />
                    {s("Preview", "预览")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadBlob(row.blob, row.name)}
                  >
                    <Download size={14} />
                    {s("Download", "下载")}
                  </Button>
                  {p.creator === ctx.actor &&
                    row.stage === p.current &&
                    p.status === "active" &&
                    p.stages[p.current]?.state === "pending" &&
                    ctx.now < p.stages[p.current].due && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          onSelect(row.digest);
                          setMessage("selected");
                        }}
                      >
                        {s("Use this hash", "使用此哈希")}
                      </Button>
                    )}
                  <ConfirmButton
                    s={s}
                    variant="outline"
                    label={s("Remove local copy", "移除本地副本")}
                    description={s(
                      "This removes this browser's saved copy only. Download a backup first; on-chain evidence is unchanged.",
                      "仅移除此浏览器保存的副本，请先下载备份；链上成果记录不变。",
                    )}
                    onConfirm={() =>
                      void removeAttachment(row.id).catch(() =>
                        ctx.notifyError("evidenceStorage"),
                      )
                    }
                  />
                </div>
              </article>
            );
          })
        )}
      </div>
      {message === "selected" && (
        <p role="status" className="success-text">
          {s(
            "Hash copied to the evidence submission form below.",
            "已将哈希填入下方成果提交表单。",
          )}
        </p>
      )}
      {preview && (
        <div className="evidence-preview">
          <div className="flex justify-between gap-3">
            <h3>{preview.name}</h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPreview(null)}
            >
              {s("Close preview", "关闭预览")}
            </Button>
          </div>
          {preview.url ? (
            <img src={preview.url} alt={preview.name} />
          ) : preview.text !== undefined ? (
            <>
              <pre>{preview.text}</pre>
              <small>
                {s(
                  "Text preview: first 64 KB; download for the full file.",
                  "文本预览显示前 64 KB，完整内容请下载文件。",
                )}
              </small>
            </>
          ) : (
            <p>
              {s(
                "Download this file to view it in its native application. In-app previews support PNG, JPEG, GIF and plain text files; active document formats are not rendered.",
                "请下载并用对应软件查看此文件。程序内支持 PNG、JPEG、GIF 和纯文本预览，不执行文档中的脚本。",
              )}
            </p>
          )}
        </div>
      )}
      <p className="muted text-xs mt-4">
        {s(
          "A matching Keccak-256 hash proves file consistency, not that the contents or project claims are true.",
          "Keccak-256 哈希一致仅证明文件内容一致，不证明内容或项目声明真实。",
        )}
      </p>
    </section>
  );
}
