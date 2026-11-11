"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { decryptFile, encryptFile, fileKey } from "@/lib/stepfund/private-file";
import { downloadBlob, previewType } from "@/lib/stepfund/attachments";
import type { Context } from "./shared";
export function PrivateFiles({ ctx }: { ctx: Context }) {
  const { s } = ctx;
  const [key, setKey] = useState("");
  const [digest, setDigest] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url?: string; text?: string; blob: Blob; name: string } | null>(null);
  useEffect(() => () => { if (result?.url) URL.revokeObjectURL(result.url); }, [result]);
  async function process(file: File | undefined, decrypt: boolean) {
    if (!file) return;
    setBusy(true); setResult(null);
    try {
      if (decrypt) {
        if (file.size > 20 * 1024 * 1024) throw Error("fileTooLarge");
        const opened = await decryptFile(new Uint8Array(await file.arrayBuffer()), key, digest);
        const type = previewType(opened.name, opened.bytes.slice(0, 65536));
        const blob = new Blob([new Uint8Array(opened.bytes)], { type: type && type !== "text" ? type : "application/octet-stream" });
        setResult({ blob, name: opened.name, ...(type === "text" ? { text: new TextDecoder().decode(opened.bytes.slice(0, 65536)) } : type ? { url: URL.createObjectURL(blob) } : {}) });
      } else {
        const encrypted = await encryptFile(file, key); setDigest(encrypted.digest);
        downloadBlob(encrypted.blob, "private-evidence.sfe");
      }
    } catch (e) { ctx.notifyError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <details className="panel advanced-panel">
    <summary>{s("Encrypt evidence / open a private file", "加密成果 / 打开私密文件")}</summary>
    <p className="muted mt-4">{s("AES-256-GCM encryption happens locally. Save the key outside this application and share it only with your intended reviewer. Upload the .sfe ciphertext through the attachment IPFS workflow and commit its hash. Closing this page loses the key; StepFund cannot recover it.", "AES-256-GCM 加密在本机完成。请在程序外保存密钥，仅私下交给指定审查人。使用附件的 IPFS 上传流程发布 .sfe 密文，并提交其哈希。关闭页面后密钥丢失，StepFund 无法找回。")}</p>
    <label className="field">{s("Private file key (64 hex characters)", "文件私钥（64 位十六进制）")}<Input type="password" autoComplete="off" value={key} onChange={e => { setKey(e.target.value); setResult(null); }} /></label>
    <div className="action-row"><Button disabled={busy} variant="outline" onClick={() => { setKey(fileKey()); setResult(null); }}>{s("Generate file key", "生成文件密钥")}</Button><Button disabled={busy || !/^[0-9a-f]{64}$/i.test(key)} variant="outline" onClick={() => downloadBlob(new Blob([key], { type: "text/plain" }), "PRIVATE-StepFund-file-key.txt")}>{s("Save private key file", "保存私密密钥文件")}</Button></div>
    <label className="field">{s("Encrypt an original file", "加密原始文件")}<Input disabled={busy || !key} type="file" onChange={e => void process(e.target.files?.[0], false)} /></label>
    <label className="field">{s("Committed ciphertext hash", "链上承诺的密文哈希")}<Input value={digest} onChange={e => { setDigest(e.target.value); setResult(null); }} placeholder="0x…" /></label>
    <label className="field">{s("Verify & decrypt downloaded .sfe", "核验并解密下载的 .sfe")}<Input disabled={busy || !key || !digest} type="file" accept=".sfe" onChange={e => void process(e.target.files?.[0], true)} /></label>
    {busy && <p role="status">{s("Processing locally…", "正在本机处理……")}</p>}
    {result && <div className="ipfs-preview"><p className="success-text">{s("Ciphertext hash and authentication passed.", "密文哈希与认证均已通过。")}</p>{result.url && <img src={result.url} alt={result.name} style={{ maxWidth: "100%" }} />}{result.text !== undefined && <pre className="whitespace-pre-wrap break-words">{result.text}</pre>}<Button variant="outline" onClick={() => downloadBlob(result.blob, result.name)}>{s("Download decrypted file", "下载解密文件")}</Button></div>}
  </details>;
}
