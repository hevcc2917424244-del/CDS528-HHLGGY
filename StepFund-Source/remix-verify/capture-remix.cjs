// Final evidence capture: compile in Remix with the stock panel settings and grab clean
// crops of the compiler panel (version, optimizer, post-compile actions) and deploy panel.
const { chromium } = require("playwright");
const path = require("path");

const FILE = path.resolve(__dirname, "StepFundAll.sol");
const shot = (n) => path.resolve(__dirname, n);

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 1680, height: 1050 } })).newPage();
  const accept = async () => {
    try {
      const ok = page.locator("button.modal-ok").first();
      if ((await ok.count()) && (await ok.isVisible())) await ok.click({ timeout: 2500 });
    } catch {}
  };

  await page.goto("https://remix.ethereum.org", { waitUntil: "domcontentloaded", timeout: 150000 });
  await page.waitForTimeout(13000);
  await accept();
  await page.locator('input[data-id="fileExplorerLocalFileSystemUpload"]').setInputFiles(FILE);
  await page.waitForTimeout(6000);
  await accept();
  await page.evaluate(() => document.querySelector('[data-id="treeViewDivDraggableItemStepFundAll.sol"]').click());
  await page.waitForTimeout(3500);
  await accept();

  await page.evaluate(() => document.querySelector('[data-id="verticalIconsKindsolidity"]').click());
  await page.waitForTimeout(6500);
  await accept();
  await page.evaluate(() => document.querySelector("#versionSelector button").click());
  await page.waitForTimeout(1800);
  console.log("compiler:", await page.evaluate(() => {
    const hit = [...document.querySelectorAll("#versionSelector .dropdown-menu *")].find((e) => /^0\.8\.30\+commit\./.test((e.innerText || "").trim()));
    if (!hit) return null;
    hit.click();
    return hit.innerText.trim();
  }));
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const adv = [...document.querySelectorAll("div, span, button")].find((e) => /^Advanced Configurations$/.test((e.innerText || "").trim()));
    if (adv) adv.click();
  });
  await page.waitForTimeout(1500);
  if (!(await page.evaluate(() => document.querySelector("#optimize")?.checked))) await page.evaluate(() => document.querySelector("#optimize").click());
  await page.locator("#runs").fill("200");
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((e) => /^Compile\s*StepFundAll\.sol$/.test((e.innerText || "").trim()));
    if (b) b.click();
  });
  await page.waitForTimeout(55000);
  await accept();
  await page.waitForTimeout(1200);
  // A: compiler + optimizer settings (advanced section expanded)
  await page.screenshot({ path: shot("remix-8a-compiler-settings.png"), clip: { x: 0, y: 30, width: 380, height: 640 } });
  // B: collapse the advanced section so the post-compile results fit in one crop
  await page.evaluate(() => {
    const adv = [...document.querySelectorAll("div, span, button")].find((e) => /^Advanced Configurations$/.test((e.innerText || "").trim()));
    if (adv) adv.click();
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: shot("remix-8b-compiled-results.png"), clip: { x: 0, y: 30, width: 380, height: 1000 } });
  const state = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      version: document.querySelector("#versionSelector")?.innerText.trim(),
      optimize: document.querySelector("#optimize")?.checked,
      runs: document.querySelector("#runs")?.value,
      artifacts: ["StepFundFactory", "CampaignDeployer", "MilestoneCampaign", "AcceptanceVerifier", "AaveV3Vault", "ResearchVault", "TestUSD"].filter((n) => new RegExp(`\\b${n}\\b`).test(t)),
      postCompile: /Publish on IPFS/.test(t),
      stackTooDeep: /stack too deep/i.test(t),
      errors: /CompilerError|DeclarationError|ParserError/.test(t),
    };
  });
  console.log("state:", JSON.stringify(state));

  await accept();
  await page.evaluate(() => document.querySelector('[data-id="verticalIconsKindudapp"]').click());
  await page.waitForTimeout(6000);
  await accept();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: shot("remix-9-deploy-panel.png"), clip: { x: 0, y: 30, width: 380, height: 460 } });
  console.log("deploy panel:", await page.evaluate(() => (document.querySelector("[data-id='deploy-widget-header']")?.innerText || "").replace(/\n+/g, " | ").slice(0, 200)));
  await browser.close();
})();
