const { chromium } = require("playwright");
const fs = require("node:fs");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const checks = [];
  try {
    for (const scenario of ["rejected", "mainnet"]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      let sends = 0;
      await page.exposeFunction("guardRpc", async ({ method }) => {
        if (method === "eth_chainId")
          return scenario === "mainnet" ? "0x1" : "0x7a69";
        if (method === "eth_requestAccounts") {
          if (scenario === "rejected") return { reject: true };
          return ["0x1000000000000000000000000000000000000001"];
        }
        if (method === "eth_accounts")
          return ["0x1000000000000000000000000000000000000001"];
        if (method === "eth_sendTransaction") sends++;
        throw Error("Unexpected RPC " + method);
      });
      await page.addInitScript(() => {
        window.ethereum = {
          request: async (args) => {
            const value = await window.guardRpc(args);
            if (value?.reject) {
              const e = new Error("User rejected request");
              e.code = 4001;
              throw e;
            }
            return value;
          },
          on: () => {},
          removeListener: () => {},
        };
      });
      await page.goto(process.env.STEPFUND_URL || "http://127.0.0.1:5173");
      await page.locator("[data-ready=true]").waitFor();
      await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      await page
        .getByLabel("Factory contract address", { exact: true })
        .fill("0x1000000000000000000000000000000000000001");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      await page
        .getByText(
          scenario === "rejected"
            ? "The wallet request was cancelled. No confirmed transaction was added."
            : "Switch your wallet to Sepolia or Hardhat Local. Mainnet is not supported.",
          { exact: true },
        )
        .waitFor();
      assert.equal(sends, 0);
      checks.push(scenario + " blocked without sending a transaction");
      await context.close();
    }
    fs.mkdirSync("reports/browser", { recursive: true });
    const result = { checks, timestamp: new Date().toISOString() };
    fs.writeFileSync(
      "reports/browser/wallet-guards.json",
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
