// Dependency-free loopback launcher. Public files stay confined to www/.
const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
const { spawn } = require("node:child_process"),
  { randomUUID } = require("node:crypto");
const root = path.resolve(__dirname, "www"),
  stateFile = path.join(__dirname, ".stepfund-launcher.json"),
  logDir = path.join(__dirname, "logs"),
  logFile = path.join(logDir, "startup.log");
let saved = {};
try {
  saved = JSON.parse(fs.readFileSync(stateFile, "utf8"));
} catch {}
const instance =
  typeof saved.instance === "string" ? saved.instance : randomUUID();
const preferred = Number(process.env.PORT ?? saved.port ?? 5280);
let logsAvailable = true;
function log(message) {
  const line = new Date().toISOString() + " " + message + "\n";
  console.log(message);
  try {
    fs.mkdirSync(logDir, { recursive: true });
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 1024 * 1024)
      fs.writeFileSync(logFile, fs.readFileSync(logFile).subarray(-65536));
    fs.appendFileSync(logFile, line);
  } catch {
    logsAvailable = false;
  }
}
function open(url) {
  if (process.env.STEPFUND_NO_OPEN !== "1" && process.platform === "win32")
    spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Start-Process '" + url + "'",
      ],
      { windowsHide: true, stdio: "ignore" },
    )
      .on("error", () =>
        log(
          "Browser could not be opened automatically. Open the URL above manually.",
        ),
      )
      .unref();
}
function probe(port) {
  return new Promise((resolve) => {
    const request = http.get(
      "http://127.0.0.1:" + port + "/__stepfund/status",
      { timeout: 700 },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
          if (data.length > 8192) request.destroy();
        });
        res.on("end", () => {
          try {
            const s = JSON.parse(data);
            resolve(s.app === "StepFund" && s.instance === instance);
          } catch {
            resolve(false);
          }
        });
      },
    );
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(false));
  });
}
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".zkey": "application/octet-stream",
};
async function start() {
  log("[1/3] Checking StepFund files / 正在检查程序文件");
  if (!Number.isInteger(preferred) || preferred < 0 || preferred > 65535)
    throw Error("PORT must be an integer from 0 to 65535.");
  if (!fs.existsSync(path.join(root, "index.html")))
    throw Error(
      "www/index.html is missing. Extract the entire ZIP before starting. / 请完整解压压缩包。",
    );
  const status = {
    app: "StepFund",
    version: "0.6.0",
    instance,
    startedAt: new Date().toISOString(),
    port: preferred,
    preferred,
    fallback: false,
    logsAvailable,
  };
  const server = http.createServer((req, res) => {
    const expected = "127.0.0.1:" + status.port,
      local = "localhost:" + status.port;
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    if (
      ![expected, local].includes(req.headers.host) ||
      (req.headers.origin &&
        !["http://" + expected, "http://" + local].includes(req.headers.origin))
    ) {
      res.writeHead(403);
      res.end("Forbidden origin");
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    const send = (type, content) => {
      res.writeHead(200, { "Content-Type": type });
      res.end(req.method === "HEAD" ? undefined : content);
    };
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://" + expected).pathname,
      );
      if (pathname === "/__stepfund/status") {
        send(
          "application/json; charset=utf-8",
          JSON.stringify({ ...status, logsAvailable }),
        );
        return;
      }
      if (pathname === "/__stepfund/logs") {
        send(
          "text/plain; charset=utf-8",
          logsAvailable && fs.existsSync(logFile)
            ? fs.readFileSync(logFile)
            : "Startup log is unavailable.",
        );
        return;
      }
      let file = path.resolve(root, "." + pathname);
      if (file !== root && !file.startsWith(root + path.sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (file === root) file = path.join(root, "index.html");
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const real = fs.realpathSync(file);
      if (!real.startsWith(fs.realpathSync(root) + path.sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
      });
      if (req.method === "HEAD") res.end();
      else
        fs.createReadStream(file)
          .on("error", () => res.destroy())
          .pipe(res);
    } catch {
      res.writeHead(400);
      res.end("Bad request");
    }
  });
  log("[2/3] Starting local service / 正在启动本地服务");
  for (let attempt = 0; attempt < 12; attempt++) {
    const port =
      attempt === 0
        ? preferred
        : attempt < 11 && preferred > 0 && preferred + attempt <= 65535
          ? preferred + attempt
          : 0;
    try {
      await new Promise((resolve, reject) => {
        const error = (e) => {
          server.removeListener("listening", ready);
          reject(e);
        };
        const ready = () => {
          server.removeListener("error", error);
          resolve();
        };
        server.once("error", error);
        server.once("listening", ready);
        server.listen(port, "127.0.0.1");
      });
    } catch (e) {
      if (e.code !== "EADDRINUSE") throw e;
      if (await probe(port)) {
        const url = "http://127.0.0.1:" + port;
        log("StepFund is already running. Reusing / 复用已运行程序: " + url);
        open(url);
        return;
      }
      log(
        "Port " +
          port +
          " is occupied; trying another / 端口被占用，正在自动切换",
      );
      continue;
    }
    status.port = server.address().port;
    status.fallback = preferred !== 0 && status.port !== preferred;
    try {
      fs.writeFileSync(
        stateFile,
        JSON.stringify({ instance, port: status.port }),
      );
    } catch {
      log("Cannot remember the selected port. / 无法保存启动端口。");
    }
    const url = "http://127.0.0.1:" + status.port;
    log("[3/3] StepFund is ready / 启动完成: " + url);
    if (status.fallback)
      log(
        "A different port uses separate browser data. Old data remains at the old port; set PORT to return when it is free. / 新端口使用独立浏览器数据，原数据仍在原端口。",
      );
    log(
      "Keep this window open. Close it to stop. / 使用时保留此窗口，关闭即可停止。\nLogs / 日志: " +
        logFile,
    );
    server.on("error", (e) => log("Server error: " + e.code));
    open(url);
    return;
  }
  throw Error("No available port found. / 未找到可用端口。");
}
start().catch((e) => {
  log("Startup failed / 启动失败: " + e.message);
  process.exitCode = 1;
});
