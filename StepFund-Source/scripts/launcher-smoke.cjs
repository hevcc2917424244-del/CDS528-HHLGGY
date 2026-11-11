const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  { spawn } = require("node:child_process"),
  assert = require("node:assert/strict");
const scratch = path.resolve(__dirname, "../../../work"),
  wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(scratch, { recursive: true });
  const dir = fs.mkdtempSync(path.join(scratch, "launcher conflict "));
  fs.mkdirSync(path.join(dir, "www"));
  fs.writeFileSync(path.join(dir, "www/index.html"), "StepFund smoke fixture");
  fs.copyFileSync(
    path.join(__dirname, "portable-server.cjs"),
    path.join(dir, "server.cjs"),
  );
  fs.writeFileSync(path.join(dir, "private.txt"), "must-not-be-served");
  const blocker = http.createServer((q, r) => {
    r.writeHead(404);
    r.end();
  });
  await new Promise((r) => blocker.listen(0, "127.0.0.1", r));
  const port = blocker.address().port;
  let child;
  let output = "";
  const launch = (override) => {
    const p = spawn(process.execPath, [path.join(dir, "server.cjs")], {
      cwd: dir,
      env: { ...process.env, STEPFUND_NO_OPEN: "1", ...override },
      windowsHide: true,
    });
    p.stdout.on("data", (b) => {
      output += b;
    });
    p.stderr.on("data", (b) => {
      output += b;
    });
    return p;
  };
  const request = (port, url, headers = {}) =>
    new Promise((resolve, reject) => {
      const q = http.get(
        { host: "127.0.0.1", port, path: url, headers },
        (r) => {
          let body = "";
          r.on("data", (b) => (body += b));
          r.on("end", () => resolve({ status: r.statusCode, body }));
        },
      );
      q.on("error", reject);
    });
  try {
    child = launch({ PORT: String(port) });
    let status;
    for (let i = 0; i < 100; i++) {
      await wait(50);
      try {
        const state = JSON.parse(
          fs.readFileSync(path.join(dir, ".stepfund-launcher.json")),
        );
        status = JSON.parse(
          (await request(state.port, "/__stepfund/status")).body,
        );
        break;
      } catch {}
      if (child.exitCode !== null) throw Error(output);
    }
    assert.ok(status);
    assert.notEqual(status.port, port);
    assert.equal(status.fallback, true);
    assert.equal(status.preferred, port);
    assert.equal((await request(status.port, "/")).status, 200);
    assert.equal(
      (
        await request(status.port, "/__stepfund/status", {
          Host: "malicious.example",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(status.port, "/__stepfund/logs", {
          Origin: "https://malicious.example",
        })
      ).status,
      403,
    );
    assert.notEqual(
      (await request(status.port, "/%2e%2e%5cprivate.txt")).status,
      200,
    );
    assert.equal((await request(status.port, "/__stepfund/logs")).status, 200);
    const second = launch({ PORT: String(status.port) });
    const code = await Promise.race([
      new Promise((r) => second.once("exit", r)),
      wait(5000).then(() => {
        second.kill();
        return "timeout";
      }),
    ]);
    assert.equal(code, 0);
    assert.match(output, /Reusing/);
    assert.equal((await request(status.port, "/")).status, 200);
    const result = {
      version: "0.3.0",
      checks: [
        "Occupied port falls back automatically and is persisted",
        "Same-folder second launch reuses existing instance",
        "Status and startup logs are accessible",
        "Foreign Host and Origin rejected",
        "Encoded traversal cannot read outside www",
      ],
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.resolve(__dirname, "../reports/launcher.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (child && child.exitCode === null) {
      child.kill();
      await new Promise((r) => child.once("exit", r));
    }
    await new Promise((r) => blocker.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
