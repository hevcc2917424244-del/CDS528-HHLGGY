const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  { keccak256 } = require("ethers");
(async () => {
  const browser = await chromium.launch({ headless: true }),
    page = await browser.newPage({ viewport: { width: 1440, height: 1050 } }),
    errors = [],
    checks = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const button = (name) => page.getByRole("button", { name, exact: true });
  try {
    await page.goto(process.env.STEPFUND_URL || "http://127.0.0.1:5173");
    await page.locator("[data-ready=true]").waitFor();
    await button("Fund transparency").click();
    await page
      .getByRole("heading", { name: "Fund transparency", exact: true })
      .waitFor();
    assert.match(await page.locator(".fund-chart").innerText(), /2,760/);
    assert.equal(await page.locator(".fund-legend > div").count(), 7);
    assert.equal(await page.locator(".insight-table tbody tr").count(), 3);
    await page.screenshot({
      path: "reports/browser/finance-en.png",
      fullPage: true,
      animations: "disabled",
    });
    checks.push(
      "Financial chart has seven non-overlapping allocations including treasury and loss, and all three project ledgers",
    );
    await button("Action center").click();
    assert.equal(await page.locator(".task-card").count(), 2);
    await page
      .locator(".task-card")
      .filter({ hasText: "Claim refund" })
      .getByRole("button", { name: "Review task" })
      .click();
    await button("Claim refund").click();
    await button("Refund claimed").waitFor();
    await button("Action center").click();
    assert.equal(await page.locator(".task-card").count(), 1);
    await button("Review task").click();
    await button("Approve milestone").click();
    await button("Confirm").click();
    await page
      .getByText("Your vote has been recorded.", { exact: true })
      .waitFor();
    await button("Action center").click();
    await page.getByRole("heading", { name: "You're all caught up" }).waitFor();
    checks.push("Refund and vote tasks disappear after successful actions");
    await button("Network & practice").click();
    await button("Advance 1 day").click();
    await button("Action center").click();
    await page.getByRole("heading", { name: "Settle closed vote" }).waitFor();
    await button("Review task").click();
    await button("Settle vote").click();
    await page
      .getByText(
        "The creator must submit evidence before the deadline to start the vote.",
        { exact: true },
      )
      .waitFor();
    await page
      .getByLabel("Save attachments (20 MB each)", { exact: true })
      .setInputFiles({
        name: "review-proof.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(
          "<script>window.evidenceExecuted=true</script>\nMilestone evidence",
        ),
      });
    await page
      .locator(".attachment-row")
      .filter({ hasText: "review-proof.txt" })
      .waitFor();
    const hash = keccak256(
      Buffer.from(
        "<script>window.evidenceExecuted=true</script>\nMilestone evidence",
      ),
    );
    assert.match(
      await page.locator(".attachment-row").innerText(),
      new RegExp(hash),
    );
    await button("Preview").click();
    assert.match(
      await page.locator(".evidence-preview pre").innerText(),
      /window.evidenceExecuted/,
    );
    assert.equal(await page.evaluate(() => window.evidenceExecuted), undefined);
    checks.push(
      "Attachment saves in IndexedDB, hashes exact bytes and previews text without executing it",
    );
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      button("Download").click(),
    ]);
    assert.equal(keccak256(fs.readFileSync(await download.path())), hash);
    const [manifest] = await Promise.all([
      page.waitForEvent("download"),
      button("Download manifest").click(),
    ]);
    assert.equal(
      JSON.parse(fs.readFileSync(await manifest.path())).files[0].digest,
      hash,
    );
    checks.push("Downloaded file and attachment manifest preserve the digest");
    await page.reload();
    await page.locator("[data-ready=true]").waitFor();
    await page
      .getByRole("button", { name: "View project", exact: true })
      .first()
      .click();
    await page
      .locator(".attachment-row")
      .filter({ hasText: "review-proof.txt" })
      .waitFor();
    checks.push(
      "Saved attachments survive reload and remain scoped to their project and milestone",
    );
    await button("Network & practice").click();
    await page.getByRole("combobox", { name: "Practice account" }).click();
    await page
      .getByRole("option", { name: "Morgan · Creator", exact: true })
      .click();
    await button("Action center").click();
    await page
      .getByRole("heading", { name: "Withdraw approved funds", exact: true })
      .waitFor();
    await page
      .getByRole("heading", { name: "Submit evidence", exact: true })
      .waitFor();
    await page.screenshot({
      path: "reports/browser/tasks-en.png",
      fullPage: true,
      animations: "disabled",
    });
    checks.push(
      "Creator account gets evidence and withdrawal tasks with appropriate deadlines",
    );
    await page
      .locator(".task-card")
      .filter({ hasText: "Submit evidence" })
      .getByRole("button", { name: "Review task" })
      .click();
    await button("Use this hash").click();
    assert.equal(
      await page.getByLabel("File hash", { exact: true }).inputValue(),
      hash,
    );
    await page
      .getByLabel("Evidence URL", { exact: true })
      .fill("https://example.com/review-proof.txt");
    await button("Submit & open vote").click();
    await button("Confirm").click();
    await page
      .getByText("Matches practice commitment", { exact: true })
      .waitFor();
    await page.locator(".attachment-panel").screenshot({
      path: "reports/browser/evidence-en.png",
      animations: "disabled",
    });
    checks.push(
      "Saved primary attachment can be committed and displays matching digest status",
    );
    await button("Switch to Chinese").click();
    await page
      .getByRole("heading", { name: "阶段成果文件", exact: true })
      .waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await button("展开或收起导航").click();
    await button("资金透明看板").click();
    await page
      .getByRole("heading", { name: "资金透明看板", exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "reports/browser/finance-mobile-zh.png",
      fullPage: true,
      animations: "disabled",
    });
    checks.push(
      "Chinese labels and mobile layouts have no document-level horizontal overflow",
    );
    assert.deepEqual(errors, []);
    const report = {
      checks,
      passed: checks.length,
      pageErrors: errors,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      "reports/browser/optimizations.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } catch (e) {
    await page.screenshot({
      path: "reports/browser/optimization-failure.png",
      fullPage: true,
      animations: "disabled",
    });
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
