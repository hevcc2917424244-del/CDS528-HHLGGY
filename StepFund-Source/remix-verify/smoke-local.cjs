// Headless smoke test of the local dev server: load the app, capture the home page, and
// report any console error plus whether project cards rendered.
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 160));
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 160)));
  const res = await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle", timeout: 90000 });
  console.log("status:", res && res.status());
  await page.waitForTimeout(6000);
  const text = (await page.locator("body").innerText()).replace(/\n{2,}/g, "\n");
  console.log("body length:", text.length);
  console.log("--- first lines ---");
  console.log(text.split("\n").slice(0, 25).join(" | "));
  console.log("console errors:", errors.length ? errors.slice(0, 5).join(" ;; ") : "none");
  await page.screenshot({ path: path.resolve(__dirname, "local-home-2.png") });
  await browser.close();
})();
