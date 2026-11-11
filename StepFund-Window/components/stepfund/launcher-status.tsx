"use client";
import { useEffect, useState } from "react";
import type { Context } from "./shared";
import { Button } from "@/components/ui/button";
type Status = {
  app: string;
  version: string;
  port: number;
  preferred: number;
  fallback: boolean;
  startedAt: string;
  logsAvailable: boolean;
};
export function LauncherStatus({ ctx }: { ctx: Context }) {
  const { s } = ctx;
  const [status, setStatus] = useState<Status | null>(null),
    [checked, setChecked] = useState(false);
  useEffect(() => {
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), 3000);
    fetch("/__stepfund/status", { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json() as Promise<Status>;
      })
      .then((data) => {
        if (data.app === "StepFund") setStatus(data);
      })
      .catch(() => {})
      .finally(() => {
        setChecked(true);
        clearTimeout(timer);
      });
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, []);
  return (
    <section className="panel">
      <h2>{s("Startup & diagnostics", "启动状态与诊断")}</h2>
      {status ? (
        <>
          <div className="fund-equation">
            <span>
              {s("Server ready", "服务已就绪")} <b>v{status.version}</b>
            </span>
            <span>
              {s("Local port", "本地端口")} <b>{status.port}</b>
            </span>
          </div>
          <p className="muted">
            {s("Started", "启动时间")}:{" "}
            {new Date(status.startedAt).toLocaleString(
              ctx.lang === "zh" ? "zh-CN" : "en-US",
            )}
          </p>
          {status.fallback && (
            <p className="scope-note">
              {s(
                `Port ${status.preferred} was occupied; this session uses ${status.port}. Browser data is separate for each port. Your old data is still at the old address; stop the other service and set PORT to that port to return.`,
                `原端口 ${status.preferred} 被占用，本次改用 ${status.port}。不同端口使用独立浏览器数据，原数据仍在原地址；关闭占用程序并设置 PORT 为原端口可返回。`,
              )}
            </p>
          )}
          <Button variant="outline" asChild disabled={!status.logsAvailable}>
            <a href="/__stepfund/logs" target="_blank" rel="noreferrer">
              {s("Open startup log", "查看启动日志")}
            </a>
          </Button>
          <p className="muted text-xs mt-3">
            {s(
              "Logs contain launcher events only. No wallet secrets, evidence files or request contents are logged. The launcher remembers the selected port and reuses its existing running instance.",
              "日志仅记录启动事件，不记录钱包秘密、成果文件或请求内容。启动器会记住选定端口，并复用同一目录下已运行的实例。",
            )}
          </p>
        </>
      ) : (
        <p className="muted">
          {checked
            ? s(
                "Launcher diagnostics are available in the Windows portable edition. This page is currently served by a development or hosted server.",
                "Windows 一键运行版提供启动诊断，当前页面由开发或托管服务提供。",
              )
            : s("Checking local launcher…", "正在检查本地启动器…")}
        </p>
      )}
    </section>
  );
}
