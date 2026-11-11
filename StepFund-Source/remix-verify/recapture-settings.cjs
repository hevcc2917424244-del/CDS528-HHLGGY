// Recapture only the compiler-settings and compile-result panels, with the hover
// tooltip removed and the runs field set without focusing it.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const FILE = path.resolve(__dirname, "StepFundAll.sol");
const OUT = path.resolve(__dirname, "flow");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 })).newPage();
  page.setDefaultTimeout(90000);

  const cleanup = async () => {
    await page.evaluate(() => {
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
        cands[0].remove();
      };
      kill("Estimated number of times each opcode");
      kill("Advanced Commands");
      document.querySelectorAll(".modal-backdrop, .nudge-modal-backdrop").forEach((e) => e.remove());
      // blur whatever has focus so no tooltip re-arms
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    });
    await page.mouse.move(1600, 60);
    await sleep(700);
  };

  const snap = async (name, clip) => {
    await cleanup();
    await page.screenshot({ path: path.join(OUT, name), ...(clip ? { clip } : {}) });
    console.log("  shot " + name);
  };

  await page.goto("https://remix.ethereum.org", { waitUntil: "domcontentloaded", timeout: 180000 });
  await sleep(14000);
  await cleanup();

  await page.locator('input[data-id="fileExplorerLocalFileSystemUpload"]').setInputFiles(FILE);
  await sleep(7000);
  await cleanup();
  await page.evaluate(() => {
    const el = document.querySelector('[data-id="treeViewDivDraggableItemStepFundAll.sol"]') ||
      [...document.querySelectorAll("[data-id^='treeViewDivDraggableItem']")].find((e) => /StepFundAll\.sol/.test(e.getAttribute("data-id")));
    if (el) el.click();
  });
  await sleep(5000);

  await page.evaluate(() => document.querySelector('[data-id="verticalIconsKindsolidity"]').click());
  await sleep(8000);
  await cleanup();

  await page.evaluate(() => document.querySelector("#versionSelector button").click());
  await sleep(2000);
  await page.evaluate(() => {
    const m = document.querySelector("#versionSelector .dropdown-menu");
    [...m.querySelectorAll("button, div, li, a, span")]
      .find((e) => /^0\.8\.30\+commit\./.test((e.innerText || "").trim()))?.click();
  });
  await sleep(2500);

  await page.evaluate(() => {
    const adv = [...document.querySelectorAll("div, span, button")].find((e) => /^Advanced Configurations$/.test((e.innerText || "").trim()));
    if (adv) adv.click();
  });
  await sleep(1800);

  // set everything through JS so the mouse never hovers the controls
  const cfg = await page.evaluate(() => {
    const setVal = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const opt = document.querySelector("#optimize");
    if (opt && !opt.checked) opt.click();
    const runs = document.querySelector("#runs");
    if (runs) setVal(runs, "200");
    const evm = document.querySelector("#evmVersion");
    if (evm && evm.value !== "paris") {
      evm.value = "paris";
      evm.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return {
      version: document.querySelector("#versionSelector")?.innerText.trim(),
      optimize: document.querySelector("#optimize")?.checked,
      runs: document.querySelector("#runs")?.value,
      evm: document.querySelector("#evmVersion")?.value,
      evmVisible: !!document.querySelector("#evmVersion")?.offsetParent,
    };
  });
  console.log("cfg: " + JSON.stringify(cfg));
  await sleep(1200);
  await snap("s7-04-settings.png", { x: 0, y: 0, width: 470, height: 1010 });

  // compile
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((e) => /^Compile\s*StepFundAll\.sol$/.test((e.innerText || "").trim()))?.click();
  });
  await sleep(75000);
  await cleanup();
  await page.evaluate(() => {
    const adv = [...document.querySelectorAll("div, span, button")].find((e) => /^Advanced Configurations$/.test((e.innerText || "").trim()));
    if (adv) adv.click();
  });
  await sleep(2500);
  console.log("warn: " + await page.evaluate(() => (document.body.innerText.match(/Warning: Unused function parameter/g) || []).length));
  await snap("s7-05-compiled.png", { x: 0, y: 0, width: 470, height: 1050 });

  await browser.close();
  console.log("DONE");
})().catch((e) => console.log("FAILED " + e.message));
