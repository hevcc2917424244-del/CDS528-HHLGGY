// Sepolia UI simulation over local read-only RPC. All verification responses are fixtures.
const { chromium } = require("playwright");
const { JsonRpcProvider } = require("ethers");
const fs = require("node:fs");
const assert = require("node:assert/strict");
(async () => {
  const rpc = new JsonRpcProvider("http://127.0.0.1:8545");
  assert.equal((await rpc.getNetwork()).chainId, 31337n);
  const deployment = JSON.parse(
    fs.readFileSync("public/deployments/31337.json"),
  );
  const accounts = await rpc.send("eth_accounts", []);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const checks = [],
    errors = [];
  let sends = 0,
    status = "pending";
  const id = "72d12273-0723-448e-a9f6-f7957128efa5";
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.exposeFunction("setupRpc", async ({ method, params }) => {
      if (["eth_requestAccounts", "eth_accounts"].includes(method))
        return [accounts[0]];
      if (method === "eth_chainId") return "0xaa36a7";
      if (method === "eth_sendTransaction") {
        sends++;
        throw Error("Transactions forbidden in this fixture");
      }
      return rpc.send(method, params || []);
    });
    await page.addInitScript(() => {
      window.ethereum = {
        request: (args) => window.setupRpc(args),
        on() {},
        removeListener() {},
      };
    });
    await page.route("https://sourcify.dev/server/v2/**", async (route) => {
      const url = route.request().url();
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        assert.equal(body.compilerVersion, "0.8.30+commit.73712a01");
        assert.equal(
          body.contractIdentifier,
          "contracts/StepFundFactory.sol:StepFundFactory",
        );
        return route.fulfill({ json: { verificationId: id } });
      }
      const contract = {
        chainId: "11155111",
        address: deployment.factory,
        runtimeMatch: status === "verified" ? "match" : null,
        creationMatch: status === "verified" ? "exact_match" : null,
      };
      if (url.includes("/verify/"))
        return route.fulfill({
          json: {
            isJobCompleted: status !== "pending",
            contract,
            ...(status === "failed"
              ? { error: { customCode: "no_match" } }
              : {}),
          },
        });
      if (status === "outage")
        return route.fulfill({ status: 503, body: "temporarily unavailable" });
      return route.fulfill({
        status: status === "verified" ? 200 : 404,
        json: contract,
      });
    });
    await page.goto(process.env.STEPFUND_URL || "http://127.0.0.1:5282");
    await page.locator("[data-ready=true]").waitFor();
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    let dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Factory contract address", { exact: true })
      .fill(deployment.factory);
    await dialog
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "Network & practice", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Connect / configure", exact: true })
      .click();
    dialog = page.getByRole("dialog");
    const dl = page.waitForEvent("download");
    await dialog
      .getByRole("button", { name: "Share connection file", exact: true })
      .click();
    const shared = JSON.parse(fs.readFileSync(await (await dl).path()));
    assert.deepEqual(Object.keys(shared).sort(), [
      "chainId",
      "factory",
      "token",
    ]);
    assert.equal(shared.chainId, 11155111);
    checks.push("Sharing exports only public deployment identifiers");
    await dialog.locator("summary").click();
    await dialog
      .getByRole("button", { name: "Submit source verification", exact: true })
      .click();
    await dialog
      .getByText("Submitted — refresh to check the result", { exact: true })
      .waitFor();
    await dialog
      .getByRole("button", { name: "Check verification status", exact: true })
      .click();
    await dialog
      .getByText("Submitted — refresh to check the result", { exact: true })
      .waitFor();
    checks.push("Submitting source and pending jobs never display verified");
    status = "failed";
    await dialog
      .getByRole("button", { name: "Check verification status", exact: true })
      .click();
    await dialog
      .getByText("Verification failed (no_match)", { exact: true })
      .waitFor();
    checks.push("Completed nonmatching source job displays failure");
    status = "verified";
    await dialog
      .getByRole("button", { name: "Check verification status", exact: true })
      .click();
    await dialog
      .getByText("Creation and runtime source verified on Sourcify", {
        exact: true,
      })
      .waitFor();
    status = "outage";
    await dialog
      .getByRole("button", { name: "Check verification status", exact: true })
      .click();
    await page
      .getByText(
        "Verification could not be confirmed. Retry later or export the compiler input for manual verification.",
        { exact: true },
      )
      .waitFor();
    await dialog
      .getByText("Verification status unavailable — not confirmed", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await dialog
        .getByText("Creation and runtime source verified on Sourcify", {
          exact: true,
        })
        .count(),
      0,
    );
    checks.push("Service outage reports uncertainty");
    assert.equal(sends, 0);
    assert.deepEqual(errors, []);
    const result = {
      method:
        "Isolated local RPC adapter and mocked Sourcify responses; no real Sepolia verification claimed",
      checks,
      pageErrors: errors,
      publicTransactions: sends,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      "reports/browser/setup-verification.json",
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
