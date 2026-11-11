// Recapture the compile result with the panel scrolled to the warning block.
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const FILE = path.resolve(__dirname, "StepFundAll.sol");
const OUT = path.resolve(__dirname, "flow");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 })).newPage();
  page.setDefaultTimeout(90000);

  const kill = () =>
    page.evaluate(() => {
      for (const b of document.querySelectorAll("[data-id^='matomoModal'] button"))
        if (/^accept$/i.test((b.innerText || "").trim())) b.click();
      const ok = document.querySelector("button.modal-ok");
      if (ok && ok.offsetParent !== null) ok.click();
      const k = (needle) => {
        const c = [...document.querySelectorAll("div")].filter((d) => (d.innerText || "").includes(needle));
        c.sort((a, b) => a.innerText.length - b.innerText.length);
        if (!c.length) return;
        let n = c[0];
        for (let i = 0; i < 8 && n; i++) {
          const cs = getComputedStyle(n);
          if (cs.position === "absolute" || cs.position === "fixed") { n.remove(); return; }
          n = n.parentElement;
        }
      };
      k("Estimated number of times each opcode");
      k("Advanced Commands");
      document.querySelectorAll(".modal-backdrop, .nudge-modal-backdrop").forEach((e) => e.remove());
    });

  await page.goto("https://remix.ethereum.org", { waitUntil: "domcontentloaded", timeout: 180000 });
  await sleep(14000);
  await kill();
  await page.locator('input[data-id="fileExplorerLocalFileSystemUpload"]').setInputFiles(FILE);
  await sleep(7000);
  await kill();
  await page.evaluate(() => {
    const el = document.querySelector('[data-id="treeViewDivDraggableItemStepFundAll.sol"]') ||
      [...document.querySelectorAll("[data-id^='treeViewDivDraggableItem']")].find((e) => /StepFundAll\.sol/.test(e.getAttribute("data-id")));
    if (el) el.click();
  });
  await sleep(5000);
  await page.evaluate(() => document.querySelector('[data-id="verticalIconsKindsolidity"]').click());
  await sleep(8000);
  await kill();
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
  await sleep(1500);
  await page.evaluate(() => {
    const opt = document.querySelector("#optimize");
    if (opt && !opt.checked) opt.click();
    const runs = document.querySelector("#runs");
    if (runs) {
      const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      s.call(runs, "200");
      runs.dispatchEvent(new Event("input", { bubbles: true }));
      runs.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await sleep(800);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((e) => /^Compile\s*StepFundAll\.sol$/.test((e.innerText || "").trim()))?.click();
  });
  await sleep(75000);
  await kill();
  await page.evaluate(() => {
    const adv = [...document.querySelectorAll("div, span, button")].find((e) => /^Advanced Configurations$/.test((e.innerText || "").trim()));
    if (adv) adv.click();
  });
  await sleep(2500);

  const scrollPanelTo = (where) =>
    page.evaluate((w) => {
      const boxes = [...document.querySelectorAll("div")].filter((d) => {
        const cs = getComputedStyle(d);
        const r = d.getBoundingClientRect();
        return (cs.overflowY === "auto" || cs.overflowY === "scroll") &&
          d.scrollHeight > d.clientHeight + 40 && r.left < 520 && r.width < 760;
      });
      boxes.forEach((d) => { d.scrollTop = w === "bottom" ? d.scrollHeight : 0; });
    }, where);

  await page.mouse.move(1600, 60);
  await scrollPanelTo("top");
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, "s9-05a-compiled-top.png"), clip: { x: 0, y: 0, width: 470, height: 1010 } });
  console.log("shot top");

  await scrollPanelTo("bottom");
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, "s9-05b-compiled-bottom.png"), clip: { x: 0, y: 0, width: 470, height: 1010 } });
  console.log("shot bottom");

  console.log("warn count:", await page.evaluate(() => (document.body.innerText.match(/Warning: Unused function parameter/g) || []).length));
  await browser.close();
})().catch((e) => console.log("FAILED " + e.message));
