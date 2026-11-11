// Two isolated browser profiles, one real local-chain project, no browser sends.
const { chromium } = require("playwright"),
  { JsonRpcProvider, ContractFactory, Contract, keccak256 } = require("ethers"),
  { unzipSync, zipSync, strToU8 } = require("fflate"),
  fs = require("node:fs"),
  assert = require("node:assert/strict");
const base = process.env.STEPFUND_URL || "http://127.0.0.1:5173",
  primary = Buffer.from(
    "StepFund shared milestone proof\nReady for reviewer verification.",
  ),
  secondary = Buffer.from(
    "<script>window.bundleExecuted=true</script>\nSupplementary evidence.",
  );
(async () => {
  const rpc = new JsonRpcProvider("http://127.0.0.1:8545");
  assert.equal((await rpc.getNetwork()).chainId, 31337n);
  const accounts = await rpc.send("eth_accounts", []),
    owner = await rpc.getSigner(accounts[0]),
    backer = await rpc.getSigner(accounts[1]);
  const artifact = (name) =>
    JSON.parse(fs.readFileSync(`public/contracts/${name}.json`));
  const t = artifact("TestUSD"),
    f = artifact("StepFundFactory"),
    m = artifact("MilestoneCampaign");
  const token = await new ContractFactory(t.abi, t.bytecode, owner).deploy();
  await token.waitForDeployment();
  const factory = await new ContractFactory(f.abi, f.bytecode, owner).deploy(
    token.target,
  );
  await factory.waitForDeployment();
  await (await token.faucet()).wait();
  await (await token.approve(factory.target, 5000000)).wait();
  const now = (await rpc.getBlock("latest")).timestamp;
  await (
    await factory.createCampaign([
      "Shared evidence project",
      "A local-chain fixture for transferring real evidence files between independent browsers.",
      1,
      now + 86400,
      86400,
      ["Deliver prototype"],
      [100000000],
      [now + 4 * 86400],
    ])
  ).wait();
  const address = await factory.campaignAt(0),
    campaign = new Contract(address, m.abi, owner);
  await (await token.connect(backer).faucet()).wait();
  await (await token.connect(backer).approve(address, 100000000)).wait();
  await (await campaign.connect(backer).contribute(100000000)).wait();
  await (await campaign.finalizeFunding()).wait();
  await (
    await campaign.submitEvidence(
      "https://example.com/shared-proof.txt",
      keccak256(primary),
    )
  ).wait();
  const browser = await chromium.launch({ headless: true }),
    checks = [],
    errors = [];
  let sends = 0,
    pages = [];
  async function newReviewer(account) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    });
    pages.push(page);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.exposeFunction("evidenceRpc", (args) => {
      if (["eth_accounts", "eth_requestAccounts"].includes(args.method))
        return [account];
      if (args.method === "eth_sendTransaction") {
        sends++;
        throw Error("This test must not send through the browser");
      }
      return rpc.send(args.method, args.params || []);
    });
    await page.addInitScript(() => {
      window.ethereum = {
        request: (args) => window.evidenceRpc(args),
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
      .fill(String(factory.target));
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "View project", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Shared evidence project", exact: true })
      .waitFor();
    return page;
  }
  const importFile = (page, bytes) =>
    page.getByLabel("Evidence package ZIP", { exact: true }).setInputFiles({
      name: "StepFund-evidence.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(bytes),
    });
  try {
    const sender = await newReviewer(accounts[0]);
    await sender
      .getByLabel("Save attachments (20 MB each)", { exact: true })
      .setInputFiles([
        { name: "primary.txt", mimeType: "text/plain", buffer: primary },
        { name: "supplement.txt", mimeType: "text/plain", buffer: secondary },
      ]);
    await sender.waitForFunction(
      () => document.querySelectorAll(".attachment-row").length === 2,
    );
    await sender.getByText("Matches on-chain hash", { exact: true }).waitFor();
    const download = sender.waitForEvent("download");
    await sender
      .getByRole("button", { name: "Export evidence ZIP", exact: true })
      .click();
    const bundle = fs.readFileSync(await (await download).path());
    const unpacked = unzipSync(bundle);
    assert.equal(Object.keys(unpacked).length, 3);
    const manifest = JSON.parse(
      new TextDecoder().decode(unpacked["manifest.json"]),
    );
    assert.equal(manifest.target.projectId, address.toLowerCase());
    assert.ok(
      manifest.files.some(
        (file) => keccak256(unpacked[file.path]) === keccak256(primary),
      ),
    );
    checks.push(
      "Exported ZIP contains the real files, milestone mapping and exact hash manifest",
    );
    const recipient = await newReviewer(accounts[1]);
    assert.equal(await recipient.locator(".attachment-row").count(), 0);
    await importFile(recipient, bundle);
    const dialog = recipient.getByRole("dialog");
    await dialog
      .getByRole("heading", { name: "Review shared evidence" })
      .waitFor();
    await dialog.getByText("Commitment matches", { exact: true }).waitFor();
    assert.equal(await recipient.locator(".attachment-row").count(), 0);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await recipient.locator(".attachment-row").count(), 0);
    checks.push(
      "Inspection checks chain commitments and cancellation writes nothing",
    );
    await importFile(recipient, bundle);
    await recipient
      .getByRole("dialog")
      .getByRole("button", { name: "Save to evidence library", exact: true })
      .click();
    await recipient.waitForFunction(
      () => document.querySelectorAll(".attachment-row").length === 2,
    );
    await recipient
      .getByText("2 files imported; 0 duplicates skipped.", { exact: true })
      .waitFor();
    await recipient
      .locator(".attachment-row")
      .filter({ hasText: "primary.txt" })
      .getByText("Matches on-chain hash", { exact: true })
      .waitFor();
    const received = recipient.waitForEvent("download");
    await recipient
      .locator(".attachment-row")
      .filter({ hasText: "primary.txt" })
      .getByRole("button", { name: "Download", exact: true })
      .click();
    assert.deepEqual(fs.readFileSync(await (await received).path()), primary);
    await recipient
      .locator(".attachment-row")
      .filter({ hasText: "supplement.txt" })
      .getByRole("button", { name: "Preview", exact: true })
      .click();
    assert.match(
      await recipient.locator(".evidence-preview pre").innerText(),
      /window.bundleExecuted/,
    );
    assert.equal(
      await recipient.evaluate(() => window.bundleExecuted),
      undefined,
    );
    checks.push(
      "A separate browser imports exact bytes; primary hash matches the real local contract and text never executes",
    );
    await importFile(recipient, bundle);
    await recipient
      .getByRole("dialog")
      .getByRole("button", { name: "Save to evidence library", exact: true })
      .click();
    await recipient
      .getByText("0 files imported; 2 duplicates skipped.", { exact: true })
      .waitFor();
    assert.equal(await recipient.locator(".attachment-row").count(), 2);
    checks.push(
      "Repeated imports skip identical files without duplicating storage",
    );
    const bad = { ...unpacked },
      first = manifest.files[0].path;
    bad[first] = Uint8Array.from(bad[first]);
    bad[first][0] ^= 1;
    await importFile(recipient, zipSync(bad, { level: 0 }));
    await recipient.getByText(/A file failed its integrity check/).waitFor();
    assert.equal(await recipient.locator(".attachment-row").count(), 2);
    checks.push(
      "A tampered package is rejected without changing existing attachments",
    );
    await recipient.reload();
    await recipient.locator("[data-ready=true]").waitFor();
    await recipient
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await recipient
      .getByRole("dialog")
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await recipient.getByRole("dialog").waitFor({ state: "hidden" });
    await recipient
      .getByRole("button", { name: "View project", exact: true })
      .click();
    await recipient
      .locator(".attachment-row")
      .filter({ hasText: "primary.txt" })
      .waitFor();
    checks.push("Imported evidence persists after reload");
    await importFile(recipient, bundle);
    await recipient.getByRole("dialog").screenshot({
      path: "reports/browser/evidence-import-en.png",
      animations: "disabled",
    });
    await recipient
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await recipient
      .getByRole("button", { name: "Switch to Chinese", exact: true })
      .click();
    await recipient.setViewportSize({ width: 390, height: 844 });
    await recipient.getByLabel("成果 ZIP 文件", { exact: true }).setInputFiles({
      name: "evidence.zip",
      mimeType: "application/zip",
      buffer: bundle,
    });
    await recipient
      .getByRole("dialog")
      .getByRole("heading", { name: "检查收到的成果包" })
      .waitFor();
    assert.equal(
      await recipient.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await recipient.screenshot({
      path: "reports/browser/evidence-import-mobile-zh.png",
      fullPage: true,
      animations: "disabled",
    });
    await recipient
      .getByRole("dialog")
      .getByRole("button", { name: "取消", exact: true })
      .click();
    await recipient
      .getByRole("button", { name: "切换为英文", exact: true })
      .click();
    checks.push("English and Chinese review screens fit desktop and mobile");
    const largeManifest = structuredClone(manifest),
      largeBytes = new Uint8Array(20 * 1024 * 1024).fill(65),
      largeFile = largeManifest.files[0];
    largeFile.size = largeBytes.length;
    largeFile.digest = keccak256(largeBytes);
    largeManifest.files = [largeFile];
    await importFile(
      recipient,
      zipSync(
        {
          "manifest.json": strToU8(JSON.stringify(largeManifest)),
          [largeFile.path]: largeBytes,
        },
        { level: 0 },
      ),
    );
    await recipient
      .locator(".bundle-progress")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await recipient.locator(".bundle-progress").waitFor({ state: "hidden" });
    assert.equal(await recipient.getByRole("dialog").count(), 0);
    assert.equal(await recipient.locator(".attachment-row").count(), 2);
    checks.push(
      "A 20 MB package can be cancelled while processing without saving files",
    );
    // Fill the actual IndexedDB library to five bytes below its application cap.
    const countBefore = await recipient.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open("stepfund-evidence-v1", 1);
          r.onsuccess = () => {
            const db = r.result,
              tx = db.transaction("files", "readwrite"),
              store = tx.objectStore("files"),
              all = store.getAll();
            let count = 0;
            all.onsuccess = () => {
              let remaining =
                  100 * 1024 * 1024 -
                  5 -
                  all.result.reduce((n, x) => n + x.size, 0),
                i = 0;
              while (remaining > 0) {
                const size = Math.min(20 * 1024 * 1024, remaining);
                store.put({
                  id: "quota-fixture-" + i,
                  scope: "quota-test",
                  stage: 0,
                  name: "quota-" + i,
                  type: "application/octet-stream",
                  size,
                  digest: "fixture",
                  savedAt: Date.now(),
                  blob: new Blob([new Uint8Array(size)]),
                });
                remaining -= size;
                i++;
              }
              count = all.result.length + i;
            };
            tx.oncomplete = () => {
              db.close();
              resolve(count);
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    const more = { ...unpacked },
      newManifest = structuredClone(manifest);
    for (let i = 0; i < newManifest.files.length; i++) {
      const file = newManifest.files[i],
        data = strToU8("new-file-" + i);
      more[file.path] = data;
      file.size = data.length;
      file.digest = keccak256(data);
    }
    more["manifest.json"] = strToU8(JSON.stringify(newManifest));
    await importFile(recipient, zipSync(more, { level: 0 }));
    await recipient
      .getByRole("dialog")
      .getByRole("button", { name: "Save to evidence library", exact: true })
      .click();
    await recipient
      .getByText(/The evidence library has reached its 100 MB limit/)
      .waitFor();
    const countAfter = await recipient.evaluate(
      () =>
        new Promise((resolve) => {
          const r = indexedDB.open("stepfund-evidence-v1", 1);
          r.onsuccess = () => {
            const db = r.result,
              tx = db.transaction("files"),
              q = tx.objectStore("files").count();
            tx.oncomplete = () => {
              db.close();
              resolve(q.result);
            };
          };
        }),
    );
    assert.equal(countBefore, countAfter);
    assert.equal(await recipient.locator(".attachment-row").count(), 2);
    checks.push(
      "A real 100 MB library quota failure rolls back the entire import",
    );
    assert.equal(sends, 0);
    assert.deepEqual(errors, []);
    checks.push("Sharing and importing requested no wallet transactions");
    const report = {
      version: "0.5.0",
      base,
      network: 31337,
      method:
        "Two isolated browser profiles with real local-chain contracts and read-only EIP-1193 adapters",
      checks,
      passed: checks.length,
      pageErrors: errors,
      browserTransactions: sends,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      "reports/browser/evidence-sharing.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } catch (e) {
    for (let i = 0; i < pages.length; i++)
      await pages[i]
        .screenshot({
          path: `reports/browser/evidence-sharing-failure-${i}.png`,
          fullPage: true,
          animations: "disabled",
        })
        .catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
