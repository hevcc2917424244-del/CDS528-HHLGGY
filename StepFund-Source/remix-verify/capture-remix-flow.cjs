// End-to-end Remix walkthrough capture.
// Upload StepFundAll.sol -> compile (0.8.30 / optimizer 200 / paris) -> deploy TestUSD
// -> deploy StepFundFactory(asset) -> call view functions. One screenshot per step.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const FILE = path.resolve(__dirname, "StepFundAll.sol");
const OUT = path.resolve(__dirname, "flow");
fs.mkdirSync(OUT, { recursive: true });

const shot = (n) => path.resolve(OUT, n);
const notes = [];
const record = (k, v) => {
  notes.push({ step: k, value: v });
  console.log(`[${k}] ${typeof v === "string" ? v : JSON.stringify(v)}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1680, height: 1050 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);

  const clear = async () => {
    try {
      await page.evaluate(() => {
        for (const b of document.querySelectorAll("[data-id^='matomoModal'] button"))
          if (/^accept$/i.test((b.innerText || "").trim())) b.click();
        const ok = document.querySelector("button.modal-ok");
        if (ok && ok.offsetParent !== null) ok.click();
        for (const sel of [".modal.show button.btn-close", "[data-id$='-close']"])
          for (const b of document.querySelectorAll(sel)) b.click();
        document
          .querySelectorAll(".modal-backdrop, .nudge-modal-backdrop")
          .forEach((e) => e.remove());
      });
    } catch {}
    await sleep(400);
  };

  const snap = async (name, opts = {}) => {
    await clear();
    await sleep(600);
    await page.screenshot({ path: shot(name), ...opts });
    console.log("  -> " + name);
  };

  // ---------- 1. home ----------
  await page.goto("https://remix.ethereum.org", { waitUntil: "domcontentloaded", timeout: 180000 });
  await sleep(14000);
  await clear();
  await snap("01-home.png");
  record("home", await page.title());

  // ---------- 2. upload ----------
  await page.locator('input[data-id="fileExplorerLocalFileSystemUpload"]').setInputFiles(FILE);
  await sleep(7000);
  await clear();
  await snap("02-uploaded.png");
  record(
    "file_tree",
    await page.evaluate(() =>
      [...document.querySelectorAll("[data-id^='treeViewDivDraggableItem']")]
        .map((e) => e.getAttribute("data-id").replace("treeViewDivDraggableItem", ""))
        .slice(0, 12)
    )
  );

  // ---------- 3. open the file ----------
  await page.evaluate(() => {
    const el =
      document.querySelector('[data-id="treeViewDivDraggableItemStepFundAll.sol"]') ||
      [...document.querySelectorAll("[data-id^='treeViewDivDraggableItem']")].find((e) =>
        /StepFundAll\.sol/.test(e.getAttribute("data-id"))
      );
    if (el) el.click();
  });
  await sleep(6000);
  await clear();
  await snap("03-editor.png");
  record("editor_lines", await page.evaluate(() => document.querySelectorAll(".view-lines .view-line").length));
  record(
    "editor_tab",
    await page.evaluate(() => {
      const t = document.querySelector(".main-tabs") || document.querySelector(".tabs");
      return (t?.innerText || "").replace(/\n+/g, " | ").slice(0, 120);
    })
  );

  // ---------- 4. compiler panel ----------
  await page.evaluate(() => document.querySelector('[data-id="verticalIconsKindsolidity"]').click());
  await sleep(8000);
  await clear();

  await page.evaluate(() => document.querySelector("#versionSelector button").click());
  await sleep(2000);
  const picked = await page.evaluate(() => {
    const m = document.querySelector("#versionSelector .dropdown-menu");
    if (!m) return null;
    const hit = [...m.querySelectorAll("button, div, li, a, span")].find((e) =>
      /^0\.8\.30\+commit\./.test((e.innerText || "").trim())
    );
    if (!hit) return null;
    hit.click();
    return hit.innerText.trim();
  });
  record("compiler_version_picked", picked);
  await sleep(2500);

  // advanced configurations -> optimizer + evm version
  await page.evaluate(() => {
    const adv = [...document.querySelectorAll("div, span, button")].find(
      (e) => /^Advanced Configurations$/.test((e.innerText || "").trim())
    );
    if (adv) adv.click();
  });
  await sleep(1800);

  const cfg0 = await page.evaluate(() => ({
    optimize: document.querySelector("#optimize")?.checked,
    runs: document.querySelector("#runs")?.value,
    evm: document.querySelector("#evmVersion")?.value,
  }));
  record("advanced_before", cfg0);
  if (!cfg0.optimize) {
    await page.evaluate(() => document.querySelector("#optimize").click());
    await sleep(500);
  }
  await page.locator("#runs").fill("200");
  await sleep(400);
  // force paris
  await page.evaluate(() => {
    const s = document.querySelector("#evmVersion");
    if (s && s.value !== "paris") {
      s.value = "paris";
      s.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await sleep(800);
  record(
    "advanced_after",
    await page.evaluate(() => ({
      version: document.querySelector("#versionSelector")?.innerText.trim(),
      optimize: document.querySelector("#optimize")?.checked,
      runs: document.querySelector("#runs")?.value,
      evm: document.querySelector("#evmVersion")?.value,
    }))
  );
  await snap("04-compiler-settings.png");

  // ---------- 5. compile ----------
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((e) =>
      /^Compile\s*StepFundAll\.sol$/.test((e.innerText || "").trim())
    );
    if (b) {
      b.click();
      return (b.innerText || "").trim();
    }
    return null;
  });
  record("compile_button", clicked);
  await sleep(70000);
  await clear();

  const compiled = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      success: /Compilation successful/i.test(t),
      stackTooDeep: /stack too deep/i.test(t),
      errors: /CompilerError|DeclarationError|ParserError|TypeError/i.test(t),
      artifacts: [
        "StepFundFactory",
        "CampaignDeployer",
        "MilestoneCampaign",
        "AcceptanceVerifier",
        "AaveV3Vault",
        "ResearchVault",
        "TestUSD",
      ].filter((n) => new RegExp(`\\b${n}\\b`).test(t)),
      status: (t.match(/[^\n]*(Compilation successful|Warning|Error)[^\n]*/g) || []).slice(0, 6),
    };
  });
  record("compile_result", compiled);
  // collapse advanced so the whole compiler card fits in the crop
  await page.evaluate(() => {
    const adv = [...document.querySelectorAll("div, span, button")].find(
      (e) => /^Advanced Configurations$/.test((e.innerText || "").trim())
    );
    if (adv) adv.click();
  });
  await sleep(2000);
  await snap("05-compiled.png", { clip: { x: 0, y: 30, width: 360, height: 900 } });
  await snap("05-compiled-full.png");

  // ---------- 6. deploy panel ----------
  await page.evaluate(() => document.querySelector('[data-id="verticalIconsKindudapp"]').click());
  await sleep(7000);
  await clear();
  const deployState = await page.evaluate(() => {
    const txt = (sel) => (document.querySelector(sel)?.innerText || "").replace(/\n+/g, " | ");
    const sel = document.querySelector("#selectContract") || document.querySelector("select[name='contract']");
    return {
      env: txt("[data-id='settingsEnvironment']") || txt(".udapp_environment"),
      account: txt("#defaultAccount") || txt("[data-id='defaultAccount']"),
      contractOptions: sel ? [...sel.options].map((o) => o.textContent.trim()) : null,
      header: txt("[data-id='deploy-widget-header']"),
      panel: txt("[data-id='deployAndRunListSelect']").slice(0, 300),
    };
  });
  record("deploy_panel", deployState);
  await snap("06-deploy-panel.png");

  // pick TestUSD from the contract dropdown
  const pickContract = async (name) => {
    await page.evaluate(() => {
      const sel = document.querySelector("#selectContract");
      if (sel) sel.click();
    });
    await sleep(1200);
    const ok = await page.evaluate((nm) => {
      const sel = document.querySelector("#selectContract");
      if (sel && sel.tagName === "SELECT") {
        const opt = [...sel.options].find((o) => o.textContent.trim() === nm);
        if (opt) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
          return "native-select";
        }
      }
      // custom dropdown
      const nodes = [...document.querySelectorAll("[data-id='deployAndRunListSelect'] li, .dropdown-menu li, li")];
      const hit = nodes.find((e) => (e.innerText || "").trim() === nm && e.offsetParent !== null);
      if (hit) {
        hit.click();
        return "custom-dropdown";
      }
      // last resort: type into the filter box
      return null;
    }, name);
    await sleep(1500);
    return ok;
  };
  record("pick_testusd", await pickContract("TestUSD"));
  // the deploy panel shows the chosen contract in the header
  record(
    "selected_contract",
    await page.evaluate(() => (document.querySelector("#selectContract")?.value || "") + " / " + (document.querySelector("[data-id='deploy-widget-header']")?.innerText || "").replace(/\n+/g, " | "))
  );
  await snap("07-deploy-testusd.png", { clip: { x: 0, y: 30, width: 340, height: 760 } });

  // click Deploy / transact
  const clickDeploy = async () => {
    const r = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (e) => /^(Deploy|Transact)$/.test((e.innerText || "").trim()) && e.offsetParent !== null
      );
      if (b) {
        b.click();
        return (b.innerText || "").trim();
      }
      return null;
    });
    await sleep(6000);
    return r;
  };
  record("deploy_testusd_click", await clickDeploy());
  await clear();
  record(
    "testusd_deployed",
    await page.evaluate(() => {
      const t = document.body.innerText;
      return (t.match(/\[block:\d+\][^\n]*/g) || []).slice(-4);
    })
  );
  await snap("08-testusd-deployed.png", { clip: { x: 0, y: 30, width: 340, height: 820 } });
  // capture the deployed instance address
  const testusdAddr = await page.evaluate(() => {
    const t = document.body.innerText;
    const m = t.match(/TestUSD at (0x[0-9a-fA-F]{40})/);
    return m ? m[1] : null;
  });
  record("testusd_address", testusdAddr);
  await snap("09-testusd-instance.png", { clip: { x: 0, y: 30, width: 340, height: 920 } });

  // ---------- 7. deploy factory with the token address ----------
  record("pick_factory", await pickContract("StepFundFactory"));
  await sleep(1500);
  // fill constructor arg
  const filled = await page.evaluate((addr) => {
    const inputs = [...document.querySelectorAll("input")].filter(
      (i) => i.offsetParent !== null && /asset_?/.test(i.getAttribute("placeholder") || "")
    );
    if (!inputs.length) return "no-input";
    inputs[0].focus();
    inputs[0].value = addr;
    inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
    inputs[0].dispatchEvent(new Event("change", { bubbles: true }));
    return "filled";
  }, testusdAddr || "0x0000000000000000000000000000000000000001");
  record("factory_arg", filled);
  await sleep(1200);
  await snap("10-deploy-factory.png", { clip: { x: 0, y: 30, width: 340, height: 760 } });

  record("deploy_factory_click", await clickDeploy());
  await clear();
  await snap("11-factory-deployed.png", { clip: { x: 0, y: 30, width: 340, height: 960 } });
  const factoryAddr = await page.evaluate(() => {
    const t = document.body.innerText;
    const m = t.match(/StepFundFactory at (0x[0-9a-fA-F]{40})/);
    return m ? m[1] : null;
  });
  record("factory_address", factoryAddr);
  record(
    "deploy_log",
    await page.evaluate(() => (document.body.innerText.match(/\[vm\][^\n]*|\[block:\d+\][^\n]*/g) || []).slice(-6))
  );

  // ---------- 8. expand the instance and call view functions ----------
  await page.evaluate(() => {
    const heads = [...document.querySelectorAll("div, button")].filter(
      (e) => /^StepFundFactory at 0x/.test((e.innerText || "").trim()) && e.offsetParent !== null
    );
    if (heads.length) heads[heads.length - 1].click();
  });
  await sleep(2500);
  await clear();
  await snap("12-factory-expanded.png", { clip: { x: 0, y: 30, width: 340, height: 1000 } });

  const callFn = async (name) => {
    const ok = await page.evaluate((nm) => {
      const btns = [...document.querySelectorAll("button, .ud_function, [data-id^='multiParam']")].filter(
        (e) => (e.innerText || "").trim().split("\n")[0] === nm && e.offsetParent !== null
      );
      if (!btns.length) return false;
      btns[btns.length - 1].click();
      return true;
    }, name);
    await sleep(3500);
    return ok;
  };
  record("call_protocolVersion", await callFn("protocolVersion"));
  await clear();
  record(
    "protocolVersion_result",
    await page.evaluate(() => (document.body.innerText.match(/0:\s*uint256:\s*\d+/g) || []).slice(-3))
  );
  await snap("13-call-protocolversion.png", { clip: { x: 0, y: 30, width: 340, height: 1000 } });

  record("call_campaignCount", await callFn("campaignCount"));
  await clear();
  await snap("14-call-campaigncount.png", { clip: { x: 0, y: 30, width: 340, height: 1000 } });

  record(
    "terminal",
    await page.evaluate(() => (document.body.innerText.match(/\[vm\][^\n]*/g) || []).slice(-8))
  );

  await snap("15-final-full.png");

  fs.writeFileSync(path.resolve(OUT, "capture-log.json"), JSON.stringify(notes, null, 2), "utf8");
  await browser.close();
  console.log("DONE");
})().catch(async (e) => {
  console.log("FAILED: " + e.message);
  fs.writeFileSync(path.resolve(OUT, "capture-log.json"), JSON.stringify(notes, null, 2), "utf8");
  process.exit(1);
});
