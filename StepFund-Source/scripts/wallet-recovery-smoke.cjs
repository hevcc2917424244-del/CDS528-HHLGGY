// EIP-1193 adapter with real transactions on local Hardhat only. No physical wallet is claimed.
const { chromium } = require("playwright"),
  { JsonRpcProvider, Contract } = require("ethers"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
(async () => {
  const rpc = new JsonRpcProvider("http://127.0.0.1:8545");
  assert.equal((await rpc.getNetwork()).chainId, 31337n);
  const [account] = await rpc.send("eth_accounts", []),
    browser = await chromium.launch({ headless: true }),
    page = await browser.newPage(),
    errors = [],
    checks = [];
  let deploySends = 0,
    miningPaused = false;
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.exposeFunction("recoveryRpc", async (args) => {
      if (["eth_requestAccounts", "eth_accounts"].includes(args.method))
        return { result: [account] };
      if (args.method === "eth_sendTransaction" && !args.params[0].to) {
        deploySends++;
        if (deploySends === 2)
          return {
            error: { code: 4001, message: "User rejected factory deployment" },
          };
      }
      try {
        return { result: await rpc.send(args.method, args.params || []) };
      } catch (e) {
        return { error: { code: e.code, message: e.message } };
      }
    });
    await page.addInitScript(() => {
      window.ethereum = {
        request: async (args) => {
          const response = await window.recoveryRpc(args);
          if (response.error)
            throw Object.assign(Error(response.error.message), {
              code: response.error.code,
            });
          return response.result;
        },
        on: () => {},
        removeListener: () => {},
      };
    });
    const open = async () => {
      await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      await page.getByRole("dialog").locator("summary").click();
    };
    const deploy = async () => {
      await page
        .getByRole("button", { name: "Deploy / resume contracts", exact: true })
        .click();
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
    };
    await page.goto(process.env.STEPFUND_URL || "http://127.0.0.1:5173");
    await page.locator("[data-ready=true]").waitFor();
    await open();
    await deploy();
    await page.waitForFunction(
      () =>
        !document.querySelector(".transaction-status") &&
        Object.keys(localStorage).some((k) =>
          k.startsWith("stepfund-deployment-progress-"),
        ),
    );
    const before = await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem(
          Object.keys(localStorage).find((k) =>
            k.startsWith("stepfund-deployment-progress-"),
          ),
        ),
      ),
    );
    assert.ok(before.token.address);
    assert.equal(before.factory, undefined);
    assert.notEqual(await rpc.getCode(before.token.address), "0x");
    assert.equal(deploySends, 2);
    await page.reload();
    await page.locator("[data-ready=true]").waitFor();
    await open();
    const downloaded = page.waitForEvent("download");
    await deploy();
    const record = JSON.parse(fs.readFileSync(await (await downloaded).path()));
    assert.equal(
      record.token.toLowerCase(),
      before.token.address.toLowerCase(),
    );
    assert.equal(deploySends, 3);
    const factory = new Contract(
      record.factory,
      JSON.parse(fs.readFileSync("public/contracts/StepFundFactory.json")).abi,
      rpc,
    );
    assert.equal(
      (await factory.asset()).toLowerCase(),
      record.token.toLowerCase(),
    );
    checks.push(
      "Rejected second deployment persists the token; reload resumes only the factory, with no duplicate token deployment",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "Network & practice", exact: true })
      .click();
    await rpc.send("evm_setAutomine", [false]);
    miningPaused = true;
    await page
      .getByRole("button", { name: "Get 1,000 test tUSD", exact: true })
      .click();
    await page.waitForFunction(() =>
      JSON.parse(
        localStorage.getItem("stepfund-transaction-journal-v1") || "[]",
      ).some((r) => r.kind === "faucet" && r.status === "pending"),
    );
    await page.reload();
    await page.locator("[data-ready=true]").waitFor();
    await rpc.send("evm_mine", []);
    await rpc.send("evm_setAutomine", [true]);
    miningPaused = false;
    await page
      .getByRole("button", { name: "Network & practice", exact: true })
      .click();
    const row = page
      .locator(".journal-row")
      .filter({ hasText: "Claim test tokens" });
    await row
      .getByRole("button", { name: "Check receipt", exact: true })
      .click();
    await row.locator(".tx-confirmed").waitFor();
    checks.push(
      "A broadcast transaction survives page reload and recovers its mined receipt",
    );
    const journal = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("stepfund-transaction-journal-v1")),
    );
    assert.equal(journal.filter((r) => r.status === "confirmed").length, 3);
    assert.deepEqual(errors, []);
    const report = {
      network: 31337,
      method:
        "Local EIP-1193 test adapter; physical MetaMask signing remains untested",
      checks,
      pageErrors: errors,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      "reports/browser/wallet-recovery.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } catch (e) {
    await page.screenshot({
      path: "reports/browser/recovery-failure.png",
      fullPage: true,
      animations: "disabled",
    });
    throw e;
  } finally {
    if (miningPaused) {
      await rpc.send("evm_setAutomine", [true]);
      await rpc.send("evm_mine", []);
    }
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
