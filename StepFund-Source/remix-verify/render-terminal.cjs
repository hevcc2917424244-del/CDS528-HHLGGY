// Render the real `hardhat test` output as terminal screenshots (head + tail).
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const FLOW = path.join(__dirname, "flow");
const RAW = path.join(FLOW, "test-final.txt");
const lines = fs.readFileSync(RAW, "utf8").replace(/\r/g, "").split("\n");

// strip ANSI just in case
const clean = lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function render(rows, title, out, opts = {}) {
  const body = rows
    .map((l) => {
      let cls = "";
      if (/passing/.test(l)) cls = "pass";
      else if (/ERROR: \d+ Error in template/.test(l)) cls = "dim"; // expected snarkjs output from a negative test
      else if (/failing|Error/.test(l)) cls = "fail";
      else if (/^\s*√/.test(l)) cls = "ok";
      else if (/^>|Compil/.test(l)) cls = "dim";
      return `<div class="${cls}">${esc(l) || "&nbsp;"}</div>`;
    })
    .join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { margin: 0 }
    body { margin:0; background:#1a1d21; padding:0; }
    .win { width:${opts.width || 1180}px; background:#1a1d21; }
    .bar { height:38px; background:#2b3038; display:flex; align-items:center; padding:0 14px; gap:8px;
           font-family:'Segoe UI',sans-serif; font-size:13px; color:#b9c0cb; }
    .dot { width:12px; height:12px; border-radius:50%; }
    .title { margin-left:10px; letter-spacing:.02em; }
    .body { padding:16px 18px 22px 18px; font-family:Consolas,'Cascadia Mono',monospace;
            font-size:13.5px; line-height:1.55; color:#d7dce3; white-space:pre; }
    .ok { color:#7ee787; }
    .pass { color:#0f0; font-weight:700; background:#0b2b12; padding:2px 0; }
    .dim { color:#8b949e; }
    .fail { color:#ff7b72; }
  </style></head><body><div class="win">
    <div class="bar">
      <span class="dot" style="background:#ff5f56"></span>
      <span class="dot" style="background:#ffbd2e"></span>
      <span class="dot" style="background:#27c93f"></span>
      <span class="title">${esc(title)}</span>
    </div>
    <div class="body">${body}</div>
  </div></body></html>`;
  fs.writeFileSync(path.join(FLOW, out + ".html"), html, "utf8");
  return html;
}

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 })).newPage();

  const jobs = [];

  // head: from the first non-empty line after the compile banner up to ~36 lines
  let start = clean.findIndex((l) => /Compiled \d+ Solidity|^>/.test(l));
  if (start < 0) start = 0;
  jobs.push({ rows: clean.slice(0, 30), title: "stepfund — npx hardhat test", out: "test-term-head" });

  // tail: last 30 lines (the summary)
  const tailStart = Math.max(0, clean.length - 30);
  jobs.push({ rows: clean.slice(tailStart), title: "stepfund — npx hardhat test (tail)", out: "test-term-tail" });

  for (const j of jobs) {
    render(j.rows, j.title, j.out);
    await page.setViewportSize({ width: 1200, height: 400 });
    await page.goto("file:///" + path.join(FLOW, j.out + ".html").replace(/\\/g, "/"), { waitUntil: "load" });
    await page.waitForTimeout(400);
    const el = await page.locator(".win");
    await el.screenshot({ path: path.join(FLOW, j.out + ".png") });
    console.log("wrote", j.out + ".png");
  }
  await browser.close();
})();
