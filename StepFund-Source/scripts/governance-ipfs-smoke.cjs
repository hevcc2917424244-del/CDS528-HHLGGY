// Real local-chain transactions through a deterministic EIP-1193 adapter.
// Gateway bytes are explicitly mocked: this does not attest a live storage-provider upload.
const { chromium } = require("playwright");
const {
  JsonRpcProvider,
  ContractFactory,
  Contract,
  keccak256,
} = require("ethers");
const fs = require("node:fs"),
  assert = require("node:assert/strict");
const base = process.env.STEPFUND_URL || "http://127.0.0.1:5173";
(async () => {
  const { CID } = await import("multiformats/cid"),
    { sha256 } = await import("multiformats/hashes/sha2");
  const bytes = Buffer.from(
    "StepFund verified IPFS fixture\n<script>window.evidenceExecuted=true</script>\n",
  );
  const cid = CID.createV1(0x55, await sha256.digest(bytes)).toString();
  const rpc = new JsonRpcProvider("http://127.0.0.1:8545");
  assert.equal((await rpc.getNetwork()).chainId, 31337n);
  const accounts = await rpc.send("eth_accounts", []),
    signers = await Promise.all(
      accounts.slice(0, 5).map((a) => rpc.getSigner(a)),
    );
  const artifact = (name) =>
    JSON.parse(fs.readFileSync(`public/contracts/${name}.json`));
  const deploy = async (name, args = []) => {
    const a = artifact(name);
    const c = await new ContractFactory(a.abi, a.bytecode, signers[0]).deploy(
      ...args,
    );
    await c.waitForDeployment();
    return c;
  };
  const token = await deploy("TestUSD"),
    factory = await deploy("StepFundFactory", [token.target]);
  await (await token.faucet()).wait();
  await (await token.approve(factory.target, 50_000_000)).wait();
  const now = (await rpc.getBlock("latest")).timestamp;
  await (
    await factory.createCampaign([
      "Governance & IPFS",
      "Reviewable evidence and delegated votes",
      0,
      now + 86400,
      86400,
      ["Deliver"],
      [1_000_000_000],
      [now + 4 * 86400],
    ])
  ).wait();
  const campaign = new Contract(
    await factory.campaignAt(0),
    artifact("MilestoneCampaign").abi,
    signers[0],
  );
  for (let i = 1; i <= 3; i++) {
    const value = [600, 100, 300][i - 1] * 1_000_000;
    await (await token.connect(signers[i]).faucet()).wait();
    await (
      await token.connect(signers[i]).approve(campaign.target, value)
    ).wait();
    await (await campaign.connect(signers[i]).contribute(value)).wait();
  }
  await (await campaign.finalizeFunding()).wait();
  await (await campaign.connect(signers[1]).delegateVote(accounts[4])).wait();
  await (
    await campaign.submitEvidence(`ipfs://${cid}`, keccak256(bytes))
  ).wait();
  const browser = await chromium.launch({ headless: true }),
    checks = [],
    errors = [];
  let page,
    mode = "valid",
    sends = 0;
  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(`https://${cid}.ipfs.dweb.link/**`, (route) =>
      mode === "unavailable"
        ? route.fulfill({ status: 503, body: "unavailable" })
        : route.fulfill({
            status: 200,
            contentType: "text/plain",
            body: mode === "valid" ? bytes : Buffer.from("Changed bytes"),
          }),
    );
    await page.exposeFunction("testRpc", async ({ method, params = [] }) => {
      if (["eth_accounts", "eth_requestAccounts"].includes(method))
        return [accounts[4]];
      if (method === "eth_sendTransaction") {
        assert.equal(params[0].from.toLowerCase(), accounts[4].toLowerCase());
        sends++;
      }
      return rpc.send(method, params);
    });
    await page.addInitScript(() => {
      window.ethereum = {
        request: (args) => window.testRpc(args),
        on: () => {},
        removeListener: () => {},
      };
    });
    await page.goto(base);
    await page.locator("[data-ready=true]").waitFor();
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await page
      .getByLabel("Factory contract address", { exact: true })
      .fill(factory.target);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "View project", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Creator bond", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Approve milestone", exact: true })
        .isEnabled(),
      true,
    );
    checks.push(
      "Real v2 chain loads bond balances and a delegate with no personal stake can vote",
    );
    const preview = page.getByLabel("IPFS verified preview", { exact: true });
    await preview
      .getByRole("button", { name: "Verify & preview", exact: true })
      .click();
    await preview
      .getByText("Downloaded bytes match the on-chain Keccak-256 hash.", {
        exact: true,
      })
      .waitFor();
    assert.match(
      await preview.locator("pre").innerText(),
      /StepFund verified IPFS fixture/,
    );
    assert.equal(await page.evaluate(() => window.evidenceExecuted), undefined);
    checks.push(
      "Mocked gateway bytes independently match the real chain hash; active-looking text stays escaped",
    );
    mode = "tampered";
    await preview
      .getByRole("button", { name: "Verify & preview", exact: true })
      .click();
    await preview
      .getByText("Hash mismatch. This file is blocked from verified preview.", {
        exact: true,
      })
      .waitFor();
    assert.equal(await preview.locator("pre").count(), 0);
    mode = "unavailable";
    await preview
      .getByRole("button", { name: "Verify & preview", exact: true })
      .click();
    await preview
      .getByRole("alert")
      .filter({ hasText: "gateway is unavailable" })
      .waitFor();
    mode = "valid";
    await preview
      .getByRole("button", { name: "Verify & preview", exact: true })
      .click();
    await preview.locator("pre").waitFor();
    checks.push(
      "Tampering and gateway outages clear the verified preview and report distinct failures",
    );
    await page
      .getByRole("button", { name: "Approve milestone", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await page
      .getByText("Your vote has been recorded.", { exact: true })
      .waitFor();
    assert.equal((await campaign.getStages())[0].yes, 600_000_000n);
    assert.equal(sends, 1);
    assert.equal(
      await page
        .getByRole("button", { name: "Approve milestone", exact: true })
        .isDisabled(),
      true,
    );
    await page
      .getByText(
        "Both thresholds must be met; displayed percentages are rounded.",
        { exact: true },
      )
      .waitFor();
    checks.push(
      "The UI submits a real delegated vote once; 60% yes alone is shown below combined requirements",
    );
    await page
      .getByLabel("Storage account email", { exact: true })
      .fill("not-an-email");
    await page
      .getByRole("button", { name: "Connect storage", exact: true })
      .click();
    await page
      .getByText("Enter a valid email address.", { exact: true })
      .waitFor();
    checks.push(
      "Storage SDK lazy-loads in the browser and rejects invalid login without sending email",
    );
    await page.screenshot({
      path: "reports/browser/governance-ipfs-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Switch to Chinese", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "项目方保证金", exact: true })
      .waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
    await page.screenshot({
      path: "reports/browser/governance-ipfs-mobile.png",
      fullPage: true,
    });
    checks.push(
      "Bilingual bond/IPFS controls render without mobile horizontal overflow",
    );
    assert.deepEqual(errors, []);
    const result = {
      version: "0.5.0",
      base,
      passed: checks.length,
      checks,
      pageErrors: errors,
      realLocalTransactions: sends,
      gateway: "mocked",
      authenticatedStorageUpload: "not exercised; user account/space required",
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      "reports/browser/governance-ipfs.json",
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (page)
      await page
        .screenshot({
          path: "reports/browser/governance-ipfs-failure.png",
          fullPage: true,
        })
        .catch(() => {});
    throw error;
  } finally {
    await browser.close();
    rpc.destroy();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
