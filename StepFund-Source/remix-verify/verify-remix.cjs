// Compiles the flattened bundle in the live Remix IDE with the stock panel settings:
// compiler 0.8.30, optimizer enabled at 200 runs, no via-IR (the panel has no such switch).
const { chromium } = require("playwright");
const path = require("path");

const FILE = path.resolve(__dirname, "StepFundAll.sol");
const shot = (n) => path.resolve(__dirname, n);

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 1680, height: 1050 } })).newPage();

  const clear = () =>
    page.evaluate(() => {
      for (const b of document.querySelectorAll("[data-id^='matomoModal'] button")) if (/^accept$/i.test((b.innerText || "").trim())) b.click();
      for (const sel of [".modal.show button.btn-close", "[data-id$='-close']"]) for (const b of document.querySelectorAll(sel)) b.click();
      document.querySelectorAll(".modal-backdrop, .nudge-modal-backdrop").forEach((e) => e.remove());
    });
  const clickText = (re) =>
    page.evaluate((src) => {
      const rx = new RegExp(src);
      const el = [...document.querySelectorAll("button, div, span, li, a")].find((e) => rx.test((e.innerText || "").trim()) && e.offsetParent !== null);
      if (!el) return null;
      el.click();
      return (el.innerText || "").trim().slice(0, 60);
    }, re.source);

  await page.goto("https://remix.ethereum.org", { waitUntil: "domcontentloaded", timeout: 150000 });
  await page.waitForTimeout(13000);
  await clear();

  // upload + open
  await page.locator('input[data-id="fileExplorerLocalFileSystemUpload"]').setInputFiles(FILE);
  await page.waitForTimeout(6000);
  await clear();
  await page.evaluate(() => document.querySelector('[data-id="treeViewDivDraggableItemStepFundAll.sol"]').click());
  await page.waitForTimeout(4000);
  await clear();
  const lines = await page.evaluate(() => document.querySelectorAll(".view-lines .view-line").length);
  console.log("editor rendered lines:", lines);

  // compiler panel
  await page.evaluate(() => document.querySelector('[data-id="verticalIconsKindsolidity"]').click());
  await page.waitForTimeout(7000);
  await clear();

  // pick 0.8.30 from the custom version dropdown
  console.log("current version chip:", await page.evaluate(() => document.querySelector("#versionSelector")?.innerText.trim()));
  await page.evaluate(() => document.querySelector("#versionSelector button").click());
  await page.waitForTimeout(2000);
  const menu = await page.evaluate(() => {
    const m = document.querySelector("#versionSelector .dropdown-menu");
    return m ? m.innerText.replace(/\n{2,}/g, "\n").slice(0, 600) : "(no dropdown menu)";
  });
  console.log("dropdown head:\n" + menu);
  const picked = await page.evaluate(() => {
    const m = document.querySelector("#versionSelector .dropdown-menu");
    if (!m) return null;
    const items = [...m.querySelectorAll("button, div, li, a, span")];
    const hit = items.find((e) => /^0\.8\.30\+commit\./.test((e.innerText || "").trim()));
    if (!hit) return null;
    hit.click();
    return hit.innerText.trim();
  });
  console.log("picked version:", picked);
  await page.waitForTimeout(2500);
  console.log("version chip now:", await page.evaluate(() => document.querySelector("#versionSelector")?.innerText.trim()));

  // optimizer settings: open Advanced Configurations so the panel really applies 200 runs
  await clickText(/^Advanced Configurations$/);
  await page.waitForTimeout(1500);
  const cfg = await page.evaluate(() => ({ optimize: document.querySelector("#optimize")?.checked, runs: document.querySelector("#runs")?.value }));
  console.log("advanced config before:", JSON.stringify(cfg));
  if (!cfg.optimize) {
    await page.evaluate(() => document.querySelector("#optimize").click());
    await page.waitForTimeout(600);
  }
  const runsInput = page.locator("#runs");
  if (await runsInput.count()) {
    await runsInput.fill("200");
    await page.waitForTimeout(400);
  }
  console.log("advanced config after:", JSON.stringify(await page.evaluate(() => ({ optimize: document.querySelector("#optimize")?.checked, runs: document.querySelector("#runs")?.value }))));

  // compile
  const btn =
    (await clickText(/^Compile\s*StepFundAll\.sol$/)) ||
    (await clickText(/Compile.*StepFundAll/)) ||
    (await clickText(/^Compile$/));
  console.log("clicked:", btn);
  await page.waitForTimeout(45000);
  await page.screenshot({ path: shot("remix-3-compiled.png") });

  const result = await page.evaluate(() => {
    const lines = document.body.innerText.split("\n").map((l) => l.trim());
    const hits = lines.filter((l) => /compil|error|warning|stack too deep|success/i.test(l)).slice(0, 25);
    return {
      hits,
      success: /Compilation successful|compiled successfully/i.test(document.body.innerText),
      stackTooDeep: /stack too deep/i.test(document.body.innerText),
    };
  });
  console.log("---- status lines ----");
  console.log(result.hits.join("\n"));
  console.log("success flag:", result.success, " stack-too-deep:", result.stackTooDeep);

  // clean evidence shot: drop the promo overlay that Remix injects after a compile
  await clear();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: shot("remix-3-compiled.png") });
  const contractList = await page.evaluate(() => {
    const txt = document.body.innerText;
    const names = ["StepFundFactory", "CampaignDeployer", "MilestoneCampaign", "TestUSD", "AcceptanceVerifier", "ResearchVault", "AaveV3Vault"];
    return names.filter((n) => new RegExp(`\\b${n}\\b`).test(txt));
  });
  console.log("compiled artifacts seen in panel:", contractList.join(", "));

  // deploy panel: inspect how the contract picker is built
  await clear();
  await page.evaluate(() => document.querySelector('[data-id="verticalIconsKindudapp"]').click());
  await page.waitForTimeout(6000);
  await clear();
  await page.screenshot({ path: shot("remix-4-deploy.png") });
  const deploy = await page.evaluate(() => {
    const sel = document.querySelector("#selectContract") || document.querySelector("select[name='contract']");
    return {
      nativeSelect: sel ? [...sel.options].map((o) => o.textContent.trim()).filter(Boolean) : null,
      panelHead: (document.querySelector("[data-id='deployAndRunListSelect']")?.innerText || "").replace(/\n{2,}/g, "\n").slice(0, 500),
    };
  });
  console.log("deploy picker:", JSON.stringify(deploy, null, 1));
  await browser.close();
})();
