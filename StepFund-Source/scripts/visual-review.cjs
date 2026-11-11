const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const output = path.resolve(__dirname, "../reports/design");
const base = process.env.STEPFUND_URL || "http://127.0.0.1:5173";
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1040 },
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const checks = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.hostname === "127.0.0.1" || url.hostname === "localhost"
      ? route.continue()
      : route.abort();
  });
  fs.mkdirSync(output, { recursive: true });
  async function capture(name) {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images].map((i) => i.decode().catch(() => {})),
      );
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      name + " overflows",
    );
    assert.deepEqual(
      await page
        .locator("img")
        .evaluateAll((imgs) =>
          imgs.filter((i) => !i.complete || !i.naturalWidth).map((i) => i.src),
        ),
      [],
      name + " has a broken image",
    );
    await page.screenshot({
      path: path.join(output, name + ".png"),
      fullPage: true,
      animations: "disabled",
    });
    checks.push(name);
  }
  try {
    await page.goto(base);
    await page.locator("[data-ready=true]").waitFor();
    await capture("explore-en-desktop");
    await page
      .getByRole("button", { name: "View project", exact: true })
      .first()
      .click();
    await capture("project-en-desktop");
    await page
      .getByRole("button", { name: "Fund transparency", exact: true })
      .click();
    await capture("finance-en-desktop");
    await page
      .getByRole("button", { name: "Create project", exact: true })
      .first()
      .click();
    await capture("create-en-desktop");
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await page.getByRole("dialog").waitFor();
    await capture("connection-en-desktop");
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Explore projects", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Switch to Chinese", exact: true })
      .click();
    await capture("explore-zh-desktop");
    await page.setViewportSize({ width: 768, height: 1024 });
    await capture("explore-zh-tablet");
    await page.setViewportSize({ width: 390, height: 844 });
    await capture("explore-zh-mobile");
    await page
      .getByRole("button", { name: "查看项目", exact: true })
      .first()
      .click();
    await capture("project-zh-mobile");
    await page
      .getByRole("button", { name: "返回项目列表", exact: true })
      .click();
    await page.setViewportSize({ width: 360, height: 800 });
    await page.getByRole("button", { name: "切换为英文", exact: true }).click();
    await capture("explore-en-small-mobile");
    await page
      .getByRole("button", { name: "Toggle navigation", exact: true })
      .click();
    await capture("navigation-en-mobile");
    await page
      .getByRole("button", { name: "Network & practice", exact: true })
      .click();
    await capture("settings-en-mobile");
    assert.deepEqual(pageErrors, []);
    fs.writeFileSync(
      path.join(output, "visual-review.json"),
      JSON.stringify(
        { base, checks, pageErrors, timestamp: new Date().toISOString() },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ checks, pageErrors }));
  } catch (error) {
    await page.screenshot({
      path: path.join(output, "review-failure.png"),
      fullPage: true,
    });
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
