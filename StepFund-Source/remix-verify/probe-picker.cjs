// Probe the Remix 2.6 contract picker: dump its DOM tree before/after opening,
// and try several selection strategies, reporting which one lands.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const FILE = path.resolve(__dirname, "StepFundAll.sol");
const OUT = path.resolve(__dirname, "flow");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dump = {};

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);

  const cleanup = async () => {
    await page.evaluate(() => {
      for (const b of document.querySelectorAll("[data-id^='matomoModal'] button"))
        if (/^accept$/i.test((b.innerText || "").trim())) b.click();
      const ok = document.querySelector("button.modal-ok");
      if (ok && ok.offsetParent !== null) ok.click();
      const cands = [...document.querySelectorAll("div")].filter(
        (d) => d.innerText && d.innerText.includes("Advanced Commands") && d.innerText.includes("Upgrade Plan")
      );
      cands.sort((a, b) => a.innerText.length - b.innerText.length);
      if (cands.length) {
        let node = cands[0];
        for (let i = 0; i < 8 && node; i++) {
          const cs = getComputedStyle(node);
          if (cs.position === "fixed" || cs.position === "absolute") { node.remove(); break; }
          node = node.parentElement;
        }
      }
    });
    await sleep(400);
  };

  await page.goto("https://remix.ethereum.org", { waitUntil: "domcontentloaded", timeout: 180000 });
  await sleep(14000);
  await cleanup();
  await page.locator('input[data-id="fileExplorerLocalFileSystemUpload"]').setInputFiles(FILE);
  await sleep(7000);
  await cleanup();
  await page.evaluate(() => {
    const el =
      document.querySelector('[data-id="treeViewDivDraggableItemStepFundAll.sol"]') ||
      [...document.querySelectorAll("[data-id^='treeViewDivDraggableItem']")].find((e) =>
        /StepFundAll\.sol/.test(e.getAttribute("data-id"))
      );
    if (el) el.click();
  });
  await sleep(5000);
  await page.evaluate(() => document.querySelector('[data-id="verticalIconsKindsolidity"]').click());
  await sleep(7000);
  await cleanup();
  await page.evaluate(() => document.querySelector("#versionSelector button").click());
  await sleep(1800);
  await page.evaluate(() => {
    const m = document.querySelector("#versionSelector .dropdown-menu");
    [...m.querySelectorAll("button, div, li, a, span")]
      .find((e) => /^0\.8\.30\+commit\./.test((e.innerText || "").trim()))
      ?.click();
  });
  await sleep(2000);
  await page.evaluate(() => {
    const adv = [...document.querySelectorAll("div, span, button")].find(
      (e) => /^Advanced Configurations$/.test((e.innerText || "").trim())
    );
    if (adv) adv.click();
  });
  await sleep(1500);
  const opt = await page.evaluate(() => document.querySelector("#optimize")?.checked);
  if (!opt) await page.evaluate(() => document.querySelector("#optimize").click());
  await page.locator("#runs").fill("200");
  await page.evaluate(() => {
    const s = document.querySelector("#evmVersion");
    if (s && s.value !== "paris") { s.value = "paris"; s.dispatchEvent(new Event("change", { bubbles: true })); }
  });
  await sleep(800);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((e) => /^Compile\s*StepFundAll\.sol$/.test((e.innerText || "").trim()))
      ?.click();
  });
  await sleep(75000);
  await cleanup();

  // ---- deploy panel
  await page.evaluate(() => document.querySelector('[data-id="verticalIconsKindudapp"]').click());
  await sleep(7000);
  await cleanup();

  // find every element whose text is exactly the currently selected contract
  dump.candidates = await page.evaluate(() => {
    const out = [];
    for (const e of document.querySelectorAll("*")) {
      const t = (e.innerText || "").trim();
      if (t === "AaveV3Vault" || /^AaveV3Vault\s*StepFundAll\.sol/.test(t)) {
        out.push({
          tag: e.tagName,
          id: e.id,
          cls: (e.className || "").toString().slice(0, 120),
          dataId: e.getAttribute("data-id"),
          txt: t.slice(0, 60).replace(/\n/g, " | "),
          childCount: e.children.length,
          rect: (({ x, y, width, height }) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(width), h: Math.round(height) }))(e.getBoundingClientRect()),
        });
      }
    }
    return out;
  });

  // tree of the dropdown container
  dump.tree = await page.evaluate(() => {
    const holder = [...document.querySelectorAll("div")].find(
      (d) => (d.className || "").toString().includes("dropdown") && /^AaveV3Vault/.test((d.innerText || "").trim()) && d.offsetParent !== null
    );
    if (!holder) return "no holder";
    dump_holder = holder;
    const walk = (el, depth) => {
      if (depth > 3) return "";
      const t = (el.innerText || "").trim().replace(/\n/g, "|").slice(0, 40);
      const kids = [...el.children].map((c) => walk(c, depth + 1)).filter(Boolean).join("");
      return `<${el.tagName.toLowerCase()} class="${(el.className || "").toString().slice(0, 60)}" data-id="${el.getAttribute("data-id") || ""}" id="${el.id}">[${t}]${kids ? "{" + kids + "}" : ""}`;
    };
    const s = walk(holder, 0);
    return s.slice(0, 2500);
  });

  // open it
  await page.evaluate(() => {
    const holder = [...document.querySelectorAll("div")].find(
      (d) => (d.className || "").toString().includes("dropdown") && /^AaveV3Vault/.test((d.innerText || "").trim()) && d.offsetParent !== null
    );
    if (holder) {
      holder.click();
      holder.querySelector("button")?.click();
    }
  });
  await sleep(2500);

  dump.afterOpen = await page.evaluate(() => {
    const items = [];
    for (const e of document.querySelectorAll("li, [role='option'], .dropdown-item, .dropdown-menu div, .dropdown-menu span")) {
      const t = (e.innerText || "").trim();
      if (t && t.length < 60 && e.offsetParent !== null) items.push({ tag: e.tagName, cls: (e.className || "").toString().slice(0, 60), txt: t.replace(/\n/g, " | ") });
    }
    return items.slice(0, 60);
  });
  dump.bodyHasTestUSD = await page.evaluate(() => {
    const hits = [...document.querySelectorAll("*")].filter((e) => (e.innerText || "").trim() === "TestUSD" && e.offsetParent !== null);
    return hits.map((e) => ({ tag: e.tagName, cls: (e.className || "").toString().slice(0, 80), dataId: e.getAttribute("data-id") }));
  });
  await page.screenshot({ path: path.join(OUT, "probe-open.png"), clip: { x: 0, y: 0, width: 500, height: 1050 } });

  // strategy 1: click exact-text TestUSD
  dump.s1 = await page.evaluate(() => {
    const hits = [...document.querySelectorAll("div,span,li,button,a,p")].filter(
      (e) => (e.innerText || "").trim() === "TestUSD" && e.offsetParent !== null
    );
    if (!hits.length) return "no-hit";
    hits.sort((a, b) => b.querySelectorAll("*").length - a.querySelectorAll("*").length);
    hits[0].click();
    return "clicked:" + hits[0].tagName;
  });
  await sleep(2000);
  dump.afterS1 = await page.evaluate(() => {
    const holder = [...document.querySelectorAll("div")].find(
      (d) => (d.className || "").toString().includes("dropdown") && d.offsetParent !== null
    );
    return (holder?.innerText || "").replace(/\n+/g, " | ").slice(0, 120);
  });

  // strategy 2: keyboard filter
  if (!/TestUSD/.test(dump.afterS1 || "")) {
    await page.evaluate(() => {
      const holder = [...document.querySelectorAll("div")].find(
        (d) => (d.className || "").toString().includes("dropdown") && d.offsetParent !== null
      );
      holder?.click();
    });
    await sleep(1200);
    await page.keyboard.type("TestUSD", { delay: 120 });
    await sleep(1500);
    dump.s2_list = await page.evaluate(() =>
      [...document.querySelectorAll("li, div, span")]
        .filter((e) => (e.innerText || "").trim() === "TestUSD" && e.offsetParent !== null)
        .map((e) => e.tagName + "." + (e.className || "").toString().slice(0, 40))
    );
    await page.keyboard.press("Enter");
    await sleep(2000);
    dump.afterS2 = await page.evaluate(() => {
      const holder = [...document.querySelectorAll("div")].find(
        (d) => (d.className || "").toString().includes("dropdown") && d.offsetParent !== null
      );
      return (holder?.innerText || "").replace(/\n+/g, " | ").slice(0, 120);
    });
  }

  fs.writeFileSync(path.join(OUT, "probe.json"), JSON.stringify(dump, null, 2), "utf8");
  console.log(JSON.stringify(dump, null, 2).slice(0, 6000));
  await browser.close();
})().catch((e) => {
  console.log("FAILED " + e.message);
  fs.writeFileSync(path.join(OUT, "probe.json"), JSON.stringify(dump, null, 2), "utf8");
});
