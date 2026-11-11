// v6: minimal reproducible path — compile, deploy StepFundFactory with the Remix VM
// account as asset_, then call the two view functions. No tab switching needed.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const FILE = path.resolve(__dirname, "StepFundAll.sol");
const OUT = path.resolve(__dirname, "flow");
const P = (n) => path.resolve(OUT, n);
const ACCOUNT = "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4";
const notes = {};
const rec = (k, v) => { notes[k] = v; console.log(`[${k}] ${JSON.stringify(v)}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);

  const cleanup = async () => {
    await page.evaluate(() => {
      for (const b of document.querySelectorAll("[data-id^='matomoModal'] button"))
        if (/^accept$/i.test((b.innerText || "").trim())) b.click();
      const ok = document.querySelector("button.modal-ok");
      if (ok && ok.offsetParent !== null) ok.click();
      const cands = [...document.querySelectorAll("div")].filter(
        (d) => d.innerText && d.innerText.includes("Advanced Commands") && d.innerText.includes("Upgrade Plan"));
      cands.sort((a, b) => a.innerText.length - b.innerText.length);
      if (cands.length) {
        let node = cands[0];
        for (let i = 0; i < 8 && node; i++) {
          const cs = getComputedStyle(node);
          if (cs.position === "fixed" || cs.position === "absolute") { node.remove(); break; }
          node = node.parentElement;
        }
      }
      document.querySelectorAll(".modal-backdrop, .nudge-modal-backdrop").forEach((e) => e.remove());
    });
    await page.mouse.move(1500, 300);
    await sleep(700);
  };

  const snap = async (name, clip) => {
    await cleanup();
    await page.screenshot({ path: P(name), ...(clip ? { clip } : {}) });
    console.log("  shot " + name);
  };

  const scrollPanel = async (where) => {
    await page.evaluate((w) => {
      const boxes = [...document.querySelectorAll("div")].filter((d) => {
        const cs = getComputedStyle(d);
        const r = d.getBoundingClientRect();
        return (cs.overflowY === "auto" || cs.overflowY === "scroll") &&
          d.scrollHeight > d.clientHeight + 40 && r.left < 520 && r.width < 760;
      });
      boxes.forEach((d) => {
        if (w === "top") d.scrollTop = 0;
        else if (w === "bottom") d.scrollTop = d.scrollHeight;
        else if (typeof w === "number") d.scrollTop = w;
      });
    }, where);
    await sleep(900);
  };

  await page.goto("https://remix.ethereum.org", { waitUntil: "domcontentloaded", timeout: 180000 });
  await sleep(14000);
  await snap("s7-01-home.png");

  await page.locator('input[data-id="fileExplorerLocalFileSystemUpload"]').setInputFiles(FILE);
  await sleep(7000);
  await snap("s7-02-uploaded.png", { x: 0, y: 0, width: 460, height: 620 });

  await page.evaluate(() => {
    const el = document.querySelector('[data-id="treeViewDivDraggableItemStepFundAll.sol"]') ||
      [...document.querySelectorAll("[data-id^='treeViewDivDraggableItem']")].find((e) => /StepFundAll\.sol/.test(e.getAttribute("data-id")));
    if (el) el.click();
  });
  await sleep(6000);
  await snap("s7-03-editor.png");

  await page.evaluate(() => document.querySelector('[data-id="verticalIconsKindsolidity"]').click());
  await sleep(8000);
  await cleanup();
  await page.evaluate(() => document.querySelector("#versionSelector button").click());
  await sleep(2000);
  rec("version", await page.evaluate(() => {
    const m = document.querySelector("#versionSelector .dropdown-menu");
    const hit = [...m.querySelectorAll("button, div, li, a, span")].find((e) => /^0\.8\.30\+commit\./.test((e.innerText || "").trim()));
    if (!hit) return null;
    hit.click();
    return hit.innerText.trim();
  }));
  await sleep(2500);
  await page.evaluate(() => {
    const adv = [...document.querySelectorAll("div, span, button")].find((e) => /^Advanced Configurations$/.test((e.innerText || "").trim()));
    if (adv) adv.click();
  });
  await sleep(1800);
  if (!(await page.evaluate(() => document.querySelector("#optimize")?.checked)))
    await page.evaluate(() => document.querySelector("#optimize").click());
  await page.locator("#runs").fill("200");
  await page.evaluate(() => {
    const s = document.querySelector("#evmVersion");
    if (s && s.value !== "paris") { s.value = "paris"; s.dispatchEvent(new Event("change", { bubbles: true })); }
  });
  await sleep(1200);
  rec("cfg", await page.evaluate(() => ({
    version: document.querySelector("#versionSelector")?.innerText.trim(),
    optimize: document.querySelector("#optimize")?.checked,
    runs: document.querySelector("#runs")?.value,
    evm: document.querySelector("#evmVersion")?.value,
  })));
  await snap("s7-04-settings.png", { x: 0, y: 0, width: 470, height: 1010 });

  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((e) => /^Compile\s*StepFundAll\.sol$/.test((e.innerText || "").trim()))?.click();
  });
  await sleep(75000);
  await cleanup();
  rec("compiled", await page.evaluate(() => {
    const t = document.body.innerText;
    return { warn: (t.match(/Warning: Unused function parameter/g) || []).length, err: /CompilerError|ParserError/.test(t) };
  }));
  await page.evaluate(() => {
    const adv = [...document.querySelectorAll("div, span, button")].find((e) => /^Advanced Configurations$/.test((e.innerText || "").trim()));
    if (adv) adv.click();
  });
  await sleep(2500);
  await snap("s7-05-compiled.png", { x: 0, y: 0, width: 470, height: 1010 });

  // deploy panel
  await page.evaluate(() => document.querySelector('[data-id="verticalIconsKindudapp"]').click());
  await sleep(7000);
  await cleanup();
  await scrollPanel("top");
  await snap("s7-06-deploy-panel.png", { x: 0, y: 0, width: 470, height: 900 });

  // contract list
  await page.evaluate(() => document.querySelector('[data-id="contractDropdownToggle"]').click());
  await sleep(1800);
  rec("dropdown_items", await page.evaluate(() =>
    [...document.querySelectorAll("a.contract-dropdown-item-hover")].filter((a) => a.offsetParent !== null)
      .map((a) => (a.innerText || "").trim().split("\n")[0].trim())));
  await snap("s7-07-contract-list.png", { x: 0, y: 0, width: 470, height: 1010 });

  // select StepFundFactory
  const pick = async (name) => {
    for (let i = 0; i < 3; i++) {
      const shown = await page.evaluate(() =>
        (document.querySelector('[data-id="contractDropdownToggle"]')?.innerText || "").trim().split("\n")[0].trim());
      if (shown === name) return { ok: true, shown, attempt: i };
      await page.evaluate(() => document.querySelector('[data-id="contractDropdownToggle"]')?.click());
      await sleep(1500);
      const r = await page.evaluate((nm) => {
        const items = [...document.querySelectorAll("a.contract-dropdown-item-hover")].filter((a) => a.offsetParent !== null);
        const hit = items.find((a) => (a.innerText || "").trim().split("\n")[0].trim() === nm);
        if (!hit) return { ok: false, visible: items.length };
        hit.click();
        return { ok: true };
      }, name);
      await sleep(1800);
      const after = await page.evaluate(() =>
        (document.querySelector('[data-id="contractDropdownToggle"]')?.innerText || "").trim().split("\n")[0].trim());
      if (after === name) return { ...r, shown: after, attempt: i };
    }
    return { ok: false };
  };
  rec("pick_factory", await pick("StepFundFactory"));
  await cleanup();

  const filled = await page.evaluate((addr) => {
    const inp = [...document.querySelectorAll("input")].find(
      (i) => i.offsetParent !== null && (i.placeholder === "address" || /asset/.test(i.placeholder || "")));
    if (!inp) return "no-input";
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    inp.focus();
    setter.call(inp, addr);
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    inp.blur();
    return inp.value;
  }, ACCOUNT);
  rec("factory_arg", filled);
  await sleep(1200);
  await snap("s7-08-factory-form.png", { x: 0, y: 0, width: 470, height: 1000 });

  // deploy
  rec("deploy", await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((e) => {
      const t = (e.innerText || "").trim();
      const r = e.getBoundingClientRect();
      return /^(Deploy|Transact)$/.test(t) && e.offsetParent !== null && r.width > 150;
    });
    if (!b) return { clicked: false };
    b.scrollIntoView({ block: "center" });
    b.click();
    return { clicked: true };
  }));
  await sleep(10000);
  await cleanup();
  await scrollPanel("top");
  rec("after_deploy", await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      hasInstance: /StepFundFactory/.test(t) && /Deployed Contracts/.test(t),
      balance: (t.match(/[\d.]+ ETH/g) || []).slice(0, 2),
      snippet: t.split("\n").filter((l) => l.trim()).slice(0, 30).join(" / ").slice(0, 400),
    };
  }));
  await snap("s7-09-deployed.png", { x: 0, y: 0, width: 470, height: 1050 });

  rec("buttons", await page.evaluate(() =>
    [...document.querySelectorAll("button")].filter((e) => e.offsetParent !== null)
      .map((e) => (e.innerText || "").trim().split("\n")[0]).filter((v) => v && v.length < 26).slice(0, 40)));

  // Remix renders the function name as a label inside a row and the action as a
  // generic "Call" button, so locate the name then click the Call in its row.
  const callFn = async (nm) => {
    const r = await page.evaluate((name) => {
      const labels = [...document.querySelectorAll("*")].filter(
        (e) => (e.innerText || "").trim() === name && e.offsetParent !== null && e.children.length === 0);
      if (!labels.length) return { ok: false, reason: "no-label" };
      const label = labels[labels.length - 1];
      let node = label;
      for (let i = 0; i < 6 && node; i++) {
        const btn = [...node.querySelectorAll("button")].find((b) => /^(Call|Transact)$/.test((b.innerText || "").trim()));
        if (btn) {
          btn.scrollIntoView({ block: "center" });
          btn.click();
          return { ok: true, kind: btn.innerText.trim(), depth: i };
        }
        node = node.parentElement;
      }
      // fallback: the row itself may be clickable
      label.scrollIntoView({ block: "center" });
      label.click();
      return { ok: true, kind: "label-click" };
    }, nm);
    await sleep(5000);
    return r;
  };
  rec("call_version", await callFn("protocolVersion"));
  await cleanup();
  rec("version_result", await page.evaluate(() => (document.body.innerText.match(/0:\s*uint256:\s*[\d,]+/g) || []).slice(-3)));
  await snap("s7-10-call-version.png", { x: 0, y: 0, width: 470, height: 1050 });

  rec("call_count", await callFn("campaignCount"));
  await cleanup();
  rec("count_result", await page.evaluate(() => (document.body.innerText.match(/0:\s*uint256:\s*[\d,]+/g) || []).slice(-3)));
  await snap("s7-11-call-count.png", { x: 0, y: 0, width: 470, height: 1050 });

  await snap("s7-12-full.png");
  fs.writeFileSync(P("capture-log-v7.json"), JSON.stringify(notes, null, 2), "utf8");
  await browser.close();
  console.log("DONE");
})().catch((e) => {
  console.log("FAILED: " + e.message);
  fs.writeFileSync(P("capture-log-v7.json"), JSON.stringify(notes, null, 2), "utf8");
  process.exit(1);
});
