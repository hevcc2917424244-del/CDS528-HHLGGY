// Browser QA: isolated test contexts, no personal wallet or public-chain transactions.
const { chromium } = require("playwright");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const base = process.env.STEPFUND_URL || "http://127.0.0.1:5282";
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
  });
  const errors = [];
  const checks = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(base);
    await page.locator("[data-ready=true]").waitFor();
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("heading", { name: "Your testnet, connected.", exact: true })
      .waitFor();
    assert.equal(await page.evaluate(() => !!window.ethereum), false);
    assert.equal(
      await dialog
        .getByRole("button", { name: "Claim 1,000 tUSD", exact: true })
        .isDisabled(),
      true,
    );
    fs.mkdirSync("reports/browser", { recursive: true });
    await page.screenshot({
      path: "reports/browser/connection-center-en.png",
      animations: "disabled",
    });
    checks.push(
      "Connection center works without an installed wallet; tUSD claim gated",
    );
    const file = dialog.getByLabel("Import connection file", { exact: true });
    await file.setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          chainId: 1,
          factory: "0x1111111111111111111111111111111111111111",
        }),
      ),
    });
    await page
      .getByText(
        "Choose a StepFund connection JSON file with a valid testnet and factory address (maximum 16 KB).",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await dialog
        .getByLabel("Factory contract address", { exact: true })
        .inputValue(),
      "",
    );
    await file.setInputFiles({
      name: "connection.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          chainId: 11155111,
          factory: "0x1111111111111111111111111111111111111111",
          rpcUrl: "https://untrusted.invalid",
        }),
      ),
    });
    await page.waitForFunction(
      () =>
        document.querySelector('input[placeholder="0x…"]')?.value ===
        "0x1111111111111111111111111111111111111111",
    );
    checks.push(
      "Connection import rejects mainnet and accepts public Sepolia config",
    );
    await dialog.locator("summary").click();
    assert.equal(
      await dialog
        .getByRole("button", {
          name: "Submit source verification",
          exact: true,
        })
        .isDisabled(),
      true,
    );
    const downloadP = page.waitForEvent("download");
    await dialog
      .getByRole("button", { name: "Export compiler input", exact: true })
      .click();
    const download = await downloadP;
    const input = JSON.parse(fs.readFileSync(await download.path()));
    assert.equal(input.language, "Solidity");
    assert.equal(input.settings.viaIR, true);
    assert.equal(input.settings.optimizer.runs, 200);
    assert.ok(input.sources["contracts/StepFundFactory.sol"]);
    checks.push(
      "Bundled real compiler input exports; unconnected verification gated",
    );
    await dialog.locator("summary").click();
    fs.mkdirSync("reports/browser", { recursive: true });
    await dialog
      .getByRole("button", { name: "Connect phone wallet", exact: true })
      .click();
    await dialog
      .getByRole("img", { name: "Scan with MetaMask Mobile", exact: true })
      .waitFor({ timeout: 45000 });
    assert.ok(
      (
        await dialog
          .getByRole("img", { name: "Scan with MetaMask Mobile", exact: true })
          .getAttribute("src")
      ).startsWith("data:image/png"),
    );
    checks.push(
      "Real MetaMask Connect SDK produces a phone pairing QR without a desktop wallet",
    );
    await dialog
      .getByRole("button", { name: "Cancel connection", exact: true })
      .click();
    await dialog
      .getByRole("img", { name: "Scan with MetaMask Mobile", exact: true })
      .waitFor({ state: "hidden" });
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll("button")].find((x) =>
          x.textContent.includes("Connect phone wallet"),
        )?.disabled === false,
    );
    checks.push("Phone pairing cancellation clears QR and allows retry");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Switch to Chinese", exact: true })
      .click();
    await page.getByRole("button", { name: "连接钱包", exact: true }).click();
    await dialog
      .getByRole("heading", { name: "连接钱包，开始参与。", exact: true })
      .waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await dialog.evaluate((el) => el.scrollWidth > el.clientWidth + 1),
      false,
    );
    await page.screenshot({
      path: "reports/browser/connection-center-zh-mobile.png",
      animations: "disabled",
    });
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    checks.push(
      "Chinese connection center and mobile layout have no horizontal overflow",
    );
    assert.deepEqual(errors, []);
    const result = {
      base,
      checks,
      pageErrors: errors,
      limitations: [
        "Phone scan, account consent and transaction signatures still require a physical user wallet",
        "No Sepolia contracts deployed during this QA run",
      ],
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      "reports/browser/connection-center.json",
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    // No screenshot of a live pairing code is retained.
    console.error("Page errors:", errors);
    console.error((await page.locator("body").innerText()).slice(-4500));
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
