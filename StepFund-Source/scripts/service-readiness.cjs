// Read-only service check from the built app's origin; no faucet claims or verification submissions.
const { chromium } = require("playwright");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(process.env.STEPFUND_URL || "http://127.0.0.1:5282");
    const result = await page.evaluate(async () => {
      const checks = {};
      for (const [name, url, init] of [
        [
          "sourcifyRead",
          "https://sourcify.dev/server/v2/contract/11155111/0x1111111111111111111111111111111111111111",
          {},
        ],
        [
          "sepoliaRPC",
          "https://ethereum-sepolia-rpc.publicnode.com",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "eth_chainId",
              params: [],
            }),
          },
        ],
      ]) {
        try {
          const r = await fetch(url, {
            ...init,
            signal: AbortSignal.timeout(15000),
            credentials: "omit",
          });
          const data = await r.json();
          checks[name] = {
            httpStatus: r.status,
            accessibleFromBrowser: true,
            ...(name === "sepoliaRPC"
              ? { chainId: data.result }
              : { verificationMatch: data.match ?? null }),
          };
        } catch (e) {
          checks[name] = { accessibleFromBrowser: false, error: String(e) };
        }
      }
      return checks;
    });
    const report = {
      ...result,
      verificationSubmitted: false,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      "reports/browser/service-readiness.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
