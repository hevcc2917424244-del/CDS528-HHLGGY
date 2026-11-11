// Uses real local-chain transactions and a deterministic EIP-1193 test adapter.
// Never run this against a public network.
const { chromium } = require("playwright");
const { JsonRpcProvider, Contract } = require("ethers");
const fs = require("node:fs");
const assert = require("node:assert/strict");
(async () => {
  const rpc = new JsonRpcProvider("http://127.0.0.1:8545");
  assert.equal((await rpc.getNetwork()).chainId, 31337n);
  const accounts = await rpc.send("eth_accounts", []);
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  let page;
  try {
    page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.exposeFunction("testRpc", async (args) => {
      if (["eth_requestAccounts", "eth_accounts"].includes(args.method))
        return [accounts[0]];
      return rpc.send(args.method, args.params || []);
    });
    await page.addInitScript(() => {
      window.ethereum = {
        request: (args) => window.testRpc(args),
        on: () => {},
        removeListener: () => {},
      };
    });
    await page.goto(process.env.STEPFUND_URL || "http://127.0.0.1:5173");
    await page.locator("[data-ready=true]").waitFor();
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await page.getByRole("dialog").locator("summary").click();
    await page
      .getByRole("button", { name: "Deploy / resume contracts", exact: true })
      .click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    const download = await downloadPromise;
    const record = JSON.parse(fs.readFileSync(await download.path()));
    assert.equal(record.chainId, 31337);
    assert.notEqual(await rpc.getCode(record.factory), "0x");
    const abi = JSON.parse(
      fs.readFileSync("public/contracts/StepFundFactory.json"),
    ).abi;
    const factory = new Contract(record.factory, abi, rpc);
    assert.equal(
      (await factory.asset()).toLowerCase(),
      record.token.toLowerCase(),
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "Create project", exact: true })
      .first()
      .click();
    await page
      .getByLabel("Project title", { exact: true })
      .fill("Wallet-created local project");
    await page
      .getByLabel("What will this project deliver?", { exact: true })
      .fill(
        "A real campaign created through the browser and recorded on the local Ethereum chain.",
      );
    for (let i = 1; i <= 3; i++)
      await page
        .getByLabel("Milestone title " + i, { exact: true })
        .fill("Stage " + i);
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    await page
      .locator(".summary-panel")
      .getByRole("button", { name: "Create project", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await page
      .getByRole("heading", {
        name: "Wallet-created local project",
        exact: true,
      })
      .waitFor({ timeout: 30000 });
    assert.equal(await factory.campaignCount(), 1n);
    await page
      .getByRole("button", { name: "Network & practice", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Get 1,000 test tUSD", exact: true })
      .click();
    await page.waitForFunction(() =>
      document.querySelector(".facts")?.textContent.includes("1,000"),
    );
    assert.equal(errors.length, 0);
    const result = {
      network: 31337,
      method: "Injected test wallet adapter with real Hardhat transactions",
      checks: [
        "Wallet deployment creates real TestUSD and factory contracts",
        "Deployment record downloaded",
        "Factory token verified on chain",
        "Wallet project creation registered on chain",
        "Wallet faucet balance refreshed",
      ],
      pageErrors: errors,
      timestamp: new Date().toISOString(),
    };
    fs.mkdirSync("reports/browser", { recursive: true });
    fs.writeFileSync(
      "reports/browser/wallet-deployment.json",
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
