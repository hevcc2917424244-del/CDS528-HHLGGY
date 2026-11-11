// v8 final: set the Remix EVM version through its custom dropdown, verify the shown
// value, then compile / deploy / call. All published screenshots come from this run.
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
  const page = await (await browser.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 })).newPage();
  page.setDefaultTimeout(90000);

  const killOverlays = () =>
    page.evaluate(() => {
      for (const b of document.querySelectorAll("[data-id^='matomoModal'] button"))
        if (/^accept$/i.test((b.innerText || "").trim())) b.click();
      const ok = document.querySelector("button.modal-ok");
      if (ok && ok.offsetParent !== null) ok.click();
      const kill = (needle) => {
        const cands = [...document.querySelectorAll("div")].filter((d) => (d.innerText || "").includes(needle));
        cands.sort((a, b) => a.innerText.length - b.innerText.length);
        if (!cands.length) return;
        let node = cands[0];
        for (let i = 0; i < 8 && node; i++) {
          const cs = getComputedStyle(node);
          if (cs.position === "absolute" || cs.position === "fixed") { node.remove(); return; }
          node = node.parentElement;
        }
      };
      kill("Estimated number of times each opcode");
      kill("Advanced Commands");
      document.querySelectorAll(".modal-backdrop, .nudge-modal-backdrop").forEach((e) => e.remove());
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    });

  const snap = async (name, clip) => {
    await killOverlays();
    await page.mouse.move(1600, 60);
    await sleep(650);
    await page.screenshot({ path: P(name), ...(clip ? { clip } : {}) });
    console.log("  shot " + name);
  };

  await page.goto("https://remix.ethereum.org", { waitUntil: "domcontentloaded", timeout: 180000 });
  await sleep(14000);
  await killOverlays();
  await page.mouse.move(1600, 60);
  await sleep(600);
  await page.screenshot({ path: P("s8-01-home.png") });

  await page.locator('input[data-id="fileExplorerLocalFileSystemUpload"]').setInputFiles(FILE);
  await sleep(7000);
  await killOverlays();
  await page.screenshot({ path: P("s8-02-uploaded.png"), clip: { x: 0, y: 0, width: 460, height: 620 } });

  await page.evaluate(() => {
    const el = document.querySelector('[data-id="treeViewDivDraggableItemStepFundAll.sol"]') ||
      [...document.querySelectorAll("[data-id^='treeViewDivDraggableItem']")].find((e) => /StepFundAll\.sol/.test(e.getAttribute("data-id")));
    if (el) el.click();
  });
  await sleep(6000);
  await snap("s8-03-editor.png");

  await page.evaluate(() => document.querySelector('[data-id="verticalIconsKindsolidity"]').click());
  await sleep(8000);
  await killOverlays();

  // version
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

  // advanced
  await page.evaluate(() => {
    const adv = [...document.querySelectorAll("div, span, button")].find((e) => /^Advanced Configurations$/.test((e.innerText || "").trim()));
    if (adv) adv.click();
  });
  await sleep(1800);

  // optimizer + runs (JS only, no hover)
  await page.evaluate(() => {
    const opt = document.querySelector("#optimize");
    if (opt && !opt.checked) opt.click();
    const runs = document.querySelector("#runs");
    if (runs) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(runs, "200");
      runs.dispatchEvent(new Event("input", { bubbles: true }));
      runs.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await sleep(800);

  // EVM version: custom dropdown, so click the box that shows the current value
  const curEvm = await page.evaluate(() => {
    const cands = [...document.querySelectorAll("div,button")].filter((e) => {
      const t = (e.innerText || "").trim();
      return /^(default \((osaka|cancun|prague|paris)\)|osaka|cancun|paris)$/i.test(t) && e.offsetParent !== null;
    });
    cands.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return cands.length ? cands[0].innerText.trim() : null;
  });
  rec("evm_before", curEvm);

  const setEvm = async (target) => {
    const opened = await page.evaluate((tgt) => {
      const cands = [...document.querySelectorAll("div,button")].filter((e) => {
        const t = (e.innerText || "").trim();
        return /^(default \(|osaka|cancun|paris|prague|shanghai)/i.test(t) && e.offsetParent !== null &&
          e.getBoundingClientRect().width > 100 && e.getBoundingClientRect().left < 420;
      });
      if (!cands.length) return false;
      cands[0].click();
      return true;
    });
    await sleep(1400);
    const picked = await page.evaluate((tgt) => {
      const items = [...document.querySelectorAll("div,li,span,a,button")].filter((e) => {
        const t = (e.innerText || "").trim();
        return t.toLowerCase() === tgt && e.offsetParent !== null;
      });
      if (!items.length) {
        const near = [...document.querySelectorAll("div,li")].filter((e) => /paris/i.test((e.innerText || "").trim()) && (e.innerText || "").trim().length < 40 && e.offsetParent !== null);
        return { ok: false, near: near.map((e) => e.innerText.trim()).slice(0, 5) };
      }
      items[0].click();
      return { ok: true };
    }, target);
    await sleep(1500);
    const after = await page.evaluate(() => {
      const cands = [...document.querySelectorAll("div,button")].filter((e) => {
        const t = (e.innerText || "").trim();
        return /^(default \(|osaka|cancun|paris|prague|shanghai)/i.test(t) && e.offsetParent !== null &&
          e.getBoundingClientRect().width > 100 && e.getBoundingClientRect().left < 420;
      });
      return cands.length ? cands[0].innerText.trim() : null;
    });
    return { opened, ...picked, after };
  };
  rec("evm_set", await setEvm("paris"));
  rec("cfg_final", await page.evaluate(() => ({
    version: document.querySelector("#versionSelector")?.innerText.trim(),
    optimize: document.querySelector("#optimize")?.checked,
    runs: document.querySelector("#runs")?.value,
  })));
  await snap("s8-04-settings.png", { x: 0, y: 0, width: 470, height: 1010 });

  // compile
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((e) => /^Compile\s*StepFundAll\.sol$/.test((e.innerText || "").trim()))?.click();
  });
  await sleep(75000);
  await killOverlays();
  rec("compiled", await page.evaluate(() => {
    const t = document.body.innerText;
    return { warn: (t.match(/Warning: Unused function parameter/g) || []).length, err: /CompilerError|ParserError/.test(t) };
  }));
  await page.evaluate(() => {
    const adv = [...document.querySelectorAll("div, span, button")].find((e) => /^Advanced Configurations$/.test((e.innerText || "").trim()));
    if (adv) adv.click();
  });
  await sleep(2500);
  await snap("s8-05-compiled.png", { x: 0, y: 0, width: 470, height: 1010 });

  // deploy panel + open dropdown (no hover move, no overlay cleanup → keeps it open)
  await page.evaluate(() => document.querySelector('[data-id="verticalIconsKindudapp"]').click());
  await sleep(7000);
  await killOverlays();
  await page.mouse.move(1600, 60);
  await sleep(600);
  await page.screenshot({ path: P("s8-06-deploy-panel.png"), clip: { x: 0, y: 0, width: 470, height: 900 } });

  await page.evaluate(() => document.querySelector('[data-id="contractDropdownToggle"]').click());
  await sleep(2000);
  rec("dropdown_items", await page.evaluate(() =>
    [...document.querySelectorAll("a.contract-dropdown-item-hover")].filter((a) => a.offsetParent !== null)
      .map((a) => (a.innerText || "").trim().split("\n")[0].trim())));
  // screenshot immediately, the list is open right now
  await page.screenshot({ path: P("s8-07-contract-list.png"), clip: { x: 0, y: 0, width: 470, height: 1010 } });
  console.log("  shot s8-07-contract-list.png");

  // select factory
  const picked = await page.evaluate(() => {
    const items = [...document.querySelectorAll("a.contract-dropdown-item-hover")].filter((a) => a.offsetParent !== null);
    const hit = items.find((a) => (a.innerText || "").trim().split("\n")[0].trim() === "StepFundFactory");
    if (!hit) return { ok: false };
    hit.click();
    return { ok: true };
  });
  await sleep(2000);
  rec("pick_factory", {
    ...picked,
    shown: await page.evaluate(() => (document.querySelector('[data-id="contractDropdownToggle"]')?.innerText || "").trim().split("\n")[0].trim()),
  });
  await killOverlays();

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
  await sleep(1000);
  await snap("s8-08-factory-form.png", { x: 0, y: 0, width: 470, height: 1000 });

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
  await killOverlays();
  await page.mouse.move(1600, 60);
  await sleep(600);
  rec("balance", await page.evaluate(() => (document.body.innerText.match(/[\d.]+ ETH/g) || []).slice(0, 2)));
  await page.screenshot({ path: P("s8-09-deployed.png"), clip: { x: 0, y: 0, width: 470, height: 1050 } });

  const callFn = async (nm) => {
    const r = await page.evaluate((name) => {
      const labels = [...document.querySelectorAll("*")].filter(
        (e) => (e.innerText || "").trim() === name && e.offsetParent !== null && e.children.length === 0);
      if (!labels.length) return { ok: false };
      let node = labels[labels.length - 1];
      for (let i = 0; i < 6 && node; i++) {
        const btn = [...node.querySelectorAll("button")].find((b) => /^(Call|Transact)$/.test((b.innerText || "").trim()));
        if (btn) {
          btn.scrollIntoView({ block: "center" });
          btn.click();
          return { ok: true, d: i };
        }
        node = node.parentElement;
      }
      return { ok: false };
    }, nm);
    await sleep(5000);
    return r;
  };
  rec("call_version", await callFn("protocolVersion"));
  await killOverlays();
  rec("version_result", await page.evaluate(() => (document.body.innerText.match(/0:\s*uint256:\s*[\d,]+/g) || []).slice(-2)));
  await snap("s8-10-call-version.png", { x: 0, y: 0, width: 470, height: 1050 });

  rec("call_count", await callFn("campaignCount"));
  await killOverlays();
  rec("count_result", await page.evaluate(() => (document.body.innerText.match(/0:\s*uint256:\s*[\d,]+/g) || []).slice(-2)));
  await snap("s8-11-call-count.png", { x: 0, y: 0, width: 470, height: 1050 });

  fs.writeFileSync(P("capture-log-v8.json"), JSON.stringify(notes, null, 2), "utf8");
  await browser.close();
  console.log("DONE");
})().catch((e) => {
  console.log("FAILED: " + e.message);
  fs.writeFileSync(P("capture-log-v8.json"), JSON.stringify(notes, null, 2), "utf8");
  process.exit(1);
});
