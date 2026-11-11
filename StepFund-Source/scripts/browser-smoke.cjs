const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const base = process.env.STEPFUND_URL || "http://127.0.0.1:5173";
(async () => {
  const browser = await chromium.launch({ headless: true });
  const output = path.resolve("reports/browser");
  fs.mkdirSync(output, { recursive: true });
  let page;
  const errors = [];
  const checks = [];
  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("pageerror", (e) => errors.push(e.message));
    // This registry shim tests the optional tool handlers, not native browser WebMCP support.
    await page.addInitScript(() => {
      window.__tools = {};
      Object.defineProperty(document, "modelContext", {
        value: {
          registerTool: (tool, options) => {
            window.__tools[tool.name] = tool;
            options.signal.addEventListener(
              "abort",
              () => delete window.__tools[tool.name],
            );
          },
        },
        configurable: true,
      });
    });
    await page.goto(base);
    await page.locator("[data-ready=true]").waitFor();
    const listing = await page.evaluate(() =>
      window.__tools.stepfund_list_projects.execute({}),
    );
    assert.equal(listing.projects.length, 3);
    assert.equal(listing.mode, "practice");
    assert.equal(
      await page.evaluate(async () => {
        try {
          await window.__tools.stepfund_open_project.execute({
            projectId: "missing",
          });
          return false;
        } catch {
          return true;
        }
      }),
      true,
    );
    checks.push(
      "WebMCP handler schemas: valid read and invalid navigation (shim only)",
    );
    await page
      .getByLabel("Search projects", { exact: true })
      .fill("does not exist");
    await page
      .getByRole("heading", { name: "No matching projects", exact: true })
      .waitFor();
    await page.getByLabel("Search projects", { exact: true }).fill("");
    checks.push("Search empty state and recovery");
    await page
      .getByRole("button", { name: "View project", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Approve milestone", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await page
      .getByText("Your vote has been recorded.", { exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Approve milestone", exact: true })
        .isDisabled(),
      true,
    );
    checks.push("Approval vote and duplicate-vote prevention");
    await page
      .getByRole("button", { name: "Network & practice", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Advance 1 day", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Explore projects", exact: true })
      .click();
    await page
      .getByRole("button", { name: "View project", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Settle vote", exact: true })
      .click();
    await page
      .getByText(
        "The creator must submit evidence before the deadline to start the vote.",
        { exact: true },
      )
      .waitFor();
    checks.push("Time advancement and stage settlement");
    await page
      .getByRole("button", { name: "Back to projects", exact: true })
      .click();
    await page
      .locator(".project-card")
      .filter({ hasText: "Open Air Quality Network" })
      .getByRole("button", { name: "View project" })
      .click();
    await page
      .getByRole("button", { name: "Claim refund", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Refund claimed", exact: true })
      .waitFor();
    checks.push("Unreleased-fund refund");
    await page
      .getByRole("button", { name: "Create project", exact: true })
      .first()
      .click();
    await page
      .getByLabel("Project title", { exact: true })
      .fill("Browser-tested project");
    await page
      .getByLabel("What will this project deliver?", { exact: true })
      .fill("A project created through the complete user interface.");
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
      .getByRole("heading", { name: "Browser-tested project", exact: true })
      .waitFor();
    checks.push("Validated project creation");
    await page.getByLabel("Contribution (tUSD)", { exact: true }).fill("1000");
    await page
      .getByRole("button", { name: "Back this project", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Activate project", exact: true })
      .click();
    await page
      .getByLabel("Evidence URL", { exact: true })
      .fill("https://example.com/proof.txt");
    await page
      .getByLabel("Evidence file (max 20 MB)", { exact: true })
      .setInputFiles({
        name: "proof.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Proof for browser flow"),
      });
    await page
      .getByRole("button", { name: "Submit & open vote", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await page
      .getByRole("heading", { name: "Review this milestone", exact: true })
      .waitFor();
    await page
      .getByLabel("Verify evidence file", { exact: true })
      .setInputFiles({
        name: "proof.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Proof for browser flow"),
      });
    await page
      .getByText("Hash matches: the file bytes are unchanged.", { exact: true })
      .waitFor();
    checks.push("Funding, activation, evidence file hashing and verification");
    await page
      .getByRole("button", { name: "Switch to Chinese", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "审查当前阶段", exact: true })
      .waitFor();
    assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
    await page.reload();
    await page.locator("[data-ready=true]").waitFor();
    await page
      .getByRole("heading", { name: "好创意，值得透明的支持。", exact: true })
      .waitFor();
    assert.equal(await page.locator(".project-card").count(), 4);
    checks.push("Chinese translation and reload persistence");
    await page.screenshot({
      path: path.join(output, "desktop-zh.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page
      .getByRole("button", { name: "展开或收起导航", exact: true })
      .click();
    await page.getByRole("button", { name: "我的参与", exact: true }).click();
    await page
      .getByRole("heading", { name: "你参与的项目，尽在掌握。", exact: true })
      .waitFor();
    await page.screenshot({
      path: path.join(output, "mobile-zh.png"),
      fullPage: true,
    });
    checks.push("Mobile navigation and no horizontal overflow");
    const result = {
      base,
      passed: checks.length,
      checks,
      pageErrors: errors,
      nativeWebMCP:
        "Unavailable in this browser; handler shim tested separately",
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(output, "results.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result, null, 2));
    assert.equal(errors.length, 0);
  } catch (error) {
    if (page)
      await page
        .screenshot({ path: path.join(output, "failure.png"), fullPage: true })
        .catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
