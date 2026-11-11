"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  downloadBlob,
  previewType,
  type Attachment,
} from "@/lib/stepfund/attachments";
import {
  fetchVerifiedIPFS,
  GATEWAYS,
  ipfsURL,
  type Gateway,
} from "@/lib/stepfund/ipfs";
import type { StorageClient } from "@/lib/stepfund/ipfs-storage";
import { ConfirmButton, Picker, type Context } from "./shared";

const errors: Record<string, [string, string]> = {
  ipfsInvalid: [
    "Unsupported or invalid IPFS address.",
    "IPFS 地址无效或格式不受支持。",
  ],
  ipfsDigest: [
    "A nonzero file hash is required.",
    "需要有效且非零的文件哈希。",
  ],
  ipfsMismatch: [
    "Hash mismatch. This file is blocked from verified preview.",
    "哈希不一致，已阻止显示为已核验文件。",
  ],
  ipfsUnavailable: [
    "The gateway is unavailable, blocks browser access, or has not indexed the file. Try another gateway.",
    "网关不可用、不允许浏览器读取或尚未收录文件，请更换网关重试。",
  ],
  ipfsTimeout: [
    "Gateway request timed out. Try another gateway.",
    "网关读取超时，请更换网关重试。",
  ],
  ipfsCancelled: [
    "Operation cancelled. An upload already accepted by the service may remain public.",
    "操作已取消；服务已接收的上传内容仍可能公开存在。",
  ],
  fileTooLarge: [
    "File exceeds the 20 MB preview limit.",
    "文件超过 20 MB 预览上限。",
  ],
  ipfsEmail: ["Enter a valid email address.", "请输入有效邮箱地址。"],
  ipfsSpace: [
    "Choose an authorized, provisioned storage space.",
    "请选择已授权并开通的存储空间。",
  ],
};
function errorText(code: string, ctx: Context) {
  return ctx.s(
    ...(errors[code] || [
      "Storage service could not complete the request. Check your account, space and service availability.",
      "存储服务未完成请求，请检查账号、空间和服务是否可用。",
    ]),
  );
}

export function IPFSPreview({
  uri,
  digest,
  ctx,
  committed = true,
}: {
  uri: string;
  digest: string;
  ctx: Context;
  committed?: boolean;
}) {
  const [gateway, setGateway] = useState<Gateway>("dweb.link");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [result, setResult] = useState<{
    url?: string;
    text?: string;
    blob: Blob;
    name: string;
  }>();
  const operation = useRef<AbortController | null>(null);
  const { s } = ctx;
  useEffect(
    () => () => {
      operation.current?.abort();
    },
    [],
  );
  useEffect(
    () => () => {
      if (result?.url) URL.revokeObjectURL(result.url);
    },
    [result],
  );
  useEffect(() => {
    operation.current?.abort();
    setResult(undefined);
    setError("");
  }, [uri, digest]);
  let link = "";
  try {
    link = ipfsURL(uri, gateway);
  } catch {
    /* Show a readable validation error on request. */
  }
  async function verify() {
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError("");
    setResult(undefined);
    try {
      const { bytes, name } = await fetchVerifiedIPFS(
        uri,
        digest,
        gateway,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      let type = previewType(name, bytes.subarray(0, 65536));
      // Raw-file CIDs have no extension. Decode only valid UTF-8, with no control bytes.
      if (
        !type &&
        bytes.length <= 1024 * 1024 &&
        !bytes.some((b) => b < 32 && ![9, 10, 13].includes(b))
      ) {
        try {
          new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          type = "text";
        } catch {
          /* download only */
        }
      }
      const blob = new Blob([bytes], {
        type: type && type !== "text" ? type : "application/octet-stream",
      });
      setResult({
        blob,
        name,
        ...(type === "text"
          ? { text: new TextDecoder().decode(bytes.subarray(0, 65536)) }
          : type
            ? { url: URL.createObjectURL(blob) }
            : {}),
      });
    } catch (e) {
      if (operation.current === controller) setError((e as Error).message);
    } finally {
      if (operation.current === controller) setBusy(false);
    }
  }
  return (
    <div
      className="ipfs-box"
      aria-label={s("IPFS verified preview", "IPFS 核验预览")}
    >
      <h3>{s("Read from IPFS & verify", "从 IPFS 读取并核验")}</h3>
      <code className="ipfs-uri">{uri}</code>
      <div className="action-row">
        <Picker
          label={s("Gateway", "网关")}
          value={gateway}
          onChange={(v) => setGateway(v as Gateway)}
          items={GATEWAYS.map((v) => ({ value: v, label: v }))}
        />
        <Button variant="outline" disabled={busy} onClick={() => void verify()}>
          {busy
            ? s("Reading and hashing…", "正在读取并计算哈希…")
            : s("Verify & preview", "核验并预览")}
        </Button>
        {busy && (
          <Button variant="outline" onClick={() => operation.current?.abort()}>
            {s("Cancel", "取消")}
          </Button>
        )}
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            {s("Open gateway (unverified)", "打开网关（未核验）")}
          </a>
        )}
      </div>
      {error && (
        <p role="alert" className="error-text">
          {errorText(error, ctx)}
        </p>
      )}
      {result && (
        <div className="evidence-preview">
          <p role="status" className="success-text">
            {!committed
              ? s(
                  "Downloaded bytes match the selected local file. Not yet committed on-chain.",
                  "下载文件与所选本地文件一致，尚未提交到链上。",
                )
              : ctx.mode === "chain"
                ? s(
                    "Downloaded bytes match the on-chain Keccak-256 hash.",
                    "下载文件与链上 Keccak-256 哈希一致。",
                  )
                : s(
                    "Downloaded bytes match the practice commitment.",
                    "下载文件与演示提交哈希一致。",
                  )}
          </p>
          {result.url ? (
            <img src={result.url} alt={s("Verified evidence", "已核验成果")} />
          ) : result.text !== undefined ? (
            <pre>{result.text}</pre>
          ) : (
            <p>
              {s(
                "This format requires a separate viewer. Download the verified file to inspect it.",
                "此格式需要专用阅读器，请下载已核验文件查看。",
              )}
            </p>
          )}
          <Button
            variant="outline"
            onClick={() => downloadBlob(result.blob, result.name)}
          >
            {s("Download verified file", "下载已核验文件")}
          </Button>
        </div>
      )}
      <small className="muted">
        {s(
          "Images and plain text preview inline (text: first 64 KB). PDF/Office/HTML/SVG download separately. Hash equality does not prove delivery quality.",
          "图片及纯文本可直接预览（文本显示前 64 KB）；PDF、Office、HTML、SVG 请下载查看。哈希一致不证明交付质量。",
        )}
      </small>
    </div>
  );
}

export function IPFSUpload({
  rows,
  ctx,
  onSelect,
}: {
  rows: Attachment[];
  ctx: Context;
  onSelect: (hash: string, uri?: string) => void;
}) {
  const { s } = ctx;
  const [email, setEmail] = useState(""),
    [client, setClient] = useState<StorageClient>();
  const [space, setSpace] = useState(""),
    [fileId, setFileId] = useState("");
  const [phase, setPhase] = useState(""),
    [error, setError] = useState("");
  const [published, setPublished] = useState<{
    uri: string;
    digest: string;
    name: string;
  }>();
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  const row = rows.find((r) => r.id === fileId);
  async function run(kind: "login" | "upload") {
    const controller = new AbortController();
    operation.current = controller;
    const timer = setTimeout(
      () => controller.abort(),
      kind === "login" ? 180000 : 120000,
    );
    setPhase(kind);
    setError("");
    try {
      const storage = await import("@/lib/stepfund/ipfs-storage");
      if (controller.signal.aborted) throw Error("ipfsCancelled");
      if (kind === "login") {
        const connected = await storage.connectStorage(
          email.trim(),
          controller.signal,
        );
        setClient(connected);
        setSpace(connected.spaces()[0]?.did() || "");
      } else if (row && client) {
        const uri = await storage.publishEvidence(
          client,
          space,
          row.blob,
          row.digest,
          controller.signal,
        );
        if (!controller.signal.aborted)
          setPublished({ uri, digest: row.digest, name: row.name });
      }
    } catch (e) {
      setError(
        controller.signal.aborted ? "ipfsCancelled" : (e as Error).message,
      );
    } finally {
      clearTimeout(timer);
      setPhase("");
    }
  }
  return (
    <section
      className="ipfs-box"
      aria-label={s("Publish to IPFS", "发布到 IPFS")}
    >
      <h3>{s("Publish a file to IPFS", "将文件发布到 IPFS")}</h3>
      <p className="muted">
        {s(
          "Connect an existing Storacha account and provisioned space. Public uploads can remain accessible permanently. This app does not create a paid plan; no API key is bundled. You can also paste an IPFS link from another provider into the evidence form.",
          "连接已有 Storacha 账号和已开通空间。公开上传的文件可能长期可访问；本程序不会开通付费套餐，也不内置 API 密钥。也可在成果表单粘贴其他服务提供的 IPFS 链接。",
        )}
      </p>
      {!client ? (
        <div className="action-row">
          <label className="field">
            {s("Storage account email", "存储账号邮箱")}
            <Input
              type="email"
              value={email}
              disabled={!!phase}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <Button
            variant="outline"
            disabled={!!phase || !email.trim()}
            onClick={() => void run("login")}
          >
            {s("Connect storage", "连接存储")}
          </Button>
        </div>
      ) : (
        <>
          <p>
            {s(
              "Connected for this page session.",
              "已连接，本页关闭后授权不保存在程序中。",
            )}
          </p>
          {client.spaces().length ? (
            <Picker
              label={s("Authorized space", "已授权空间")}
              value={space}
              onChange={setSpace}
              items={client
                .spaces()
                .map((v) => ({ value: v.did(), label: v.name || v.did() }))}
            />
          ) : (
            <p role="status">
              {s(
                "No authorized space found. Configure and provision a space with the provider, then reconnect.",
                "未找到已授权空间，请在服务方配置并开通空间后重新连接。",
              )}
            </p>
          )}
          <Picker
            label={s("File to publish", "待发布文件")}
            value={fileId}
            onChange={setFileId}
            items={[
              {
                value: "",
                label: s("Choose a saved attachment", "选择已保存附件"),
              },
              ...rows.map((r) => ({ value: r.id, label: r.name })),
            ]}
          />
          <div className="action-row">
            <ConfirmButton
              s={s}
              disabled={!!phase || !space || !row}
              label={s("Publish selected file", "发布所选文件")}
              description={s(
                `Publish ${row?.name || "this file"} publicly using your storage space? Copies may persist even after removal. Provider quota or charges apply to your account.`,
                `将 ${row?.name || "此文件"} 公开发布到你的存储空间？删除后副本仍可能存在，存储额度或费用由服务方账号承担。`,
              )}
              onConfirm={() => void run("upload")}
            />
            <Button
              variant="outline"
              disabled={!!phase}
              onClick={() => {
                setClient(undefined);
                setSpace("");
              }}
            >
              {s("Disconnect storage", "断开存储")}
            </Button>
          </div>
        </>
      )}
      {phase && (
        <p role="status">
          {phase === "login"
            ? s(
                "Check your email to authorize this session (up to 3 minutes).",
                "请在邮箱中授权此会话（最多等待 3 分钟）。",
              )
            : s("Uploading public file…", "正在公开上传文件…")}{" "}
          <Button variant="outline" onClick={() => operation.current?.abort()}>
            {s("Cancel", "取消")}
          </Button>
        </p>
      )}
      {error && (
        <p role="alert" className="error-text">
          {errorText(error, ctx)}
        </p>
      )}
      {published && (
        <div>
          <p>
            {s(
              "Upload accepted. Gateway availability is verified separately.",
              "上传已被服务接受；网关是否可读取需单独核验。",
            )}{" "}
            {published.name}
          </p>
          <Button
            variant="outline"
            onClick={() => onSelect(published.digest, published.uri)}
          >
            {s("Use CID & hash in evidence form", "将 CID 和哈希填入成果表单")}
          </Button>
          <IPFSPreview
            uri={published.uri}
            digest={published.digest}
            ctx={ctx}
            committed={false}
          />
        </div>
      )}
    </section>
  );
}
