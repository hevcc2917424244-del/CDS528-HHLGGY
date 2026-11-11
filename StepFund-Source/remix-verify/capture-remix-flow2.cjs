// v2: correct contract-picker handling + promo-overlay removal + 2x DPR captures.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const FILE = path.resolve(__dirname, "StepFundAll.sol");
const OUT = path.resolve(__dirname, "flow");
const P = (n) => path.resolve(OUT, n);
const notes = {};
const rec = (k, v) => {
  notes[k] = v;
  console.log(`[${k}] ${JSON.stringify(v)}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);

  const cleanup = async () => {
    await page.evaluate(() => {
      for (const b of document.querySelectorAll("[data-id^='matomoModal'] button"))
        if (/^accept$/i.test((b.innerText || "").trim())) b.click();
      const ok = document.querySelector("button.modal-ok");
      if (ok && ok.offsetParent !== null) ok.click();
      for (const sel of [".modal.show button.btn-close", "[data-id$='-close']"])
        for (const b of document.querySelectorAll(sel)) b.click();
      // kill the Remix AI promo card ("Advanced Commands / Upgrade Plan")
      const cands = [...document.querySelectorAll("div")].filter(
        (d) => d.innerText && d.innerText.includes("Advanced Commands") && d.innerText.includes("Upgrade Plan")
      );
      cands.sort((a, b) => a.innerText.length - b.innerText.length);
      if (cands.length) {
        let node = cands[0];
        for (let i = 0; i < 8 && node; i++) {
          const cs = getComputedStyle(node);
          if (cs.position === "fixed" || cs.position === "absolute") {
            node.remove();
            break;
          }
          node = node.parentElement;
        }
      }
      document.querySelectorAll(".modal-backdrop, .nudge-modal-backdrop").forEach((e) => e.remove());
    });
    await sleep(500);
  };

  const snap = async (name, opts = {}) => {
    await cleanup();
    await sleep(500);
    await page.screenshot({ path: P(name), ...opts });
    console.log("  shot " + name);
  };

  await page.goto("https://remix.ethereum.org", { waitUntil: "domcontentloaded", timeout: 180000 });
  await sleep(14000);
  await cleanup();
  await snap("s2-01-home.png");

  await page.locator('input[data-id="fileExplorerLocalFileSystemUpload"]').setInputFiles(FILE);
  await sleep(7000);
  await cleanup();
  await snap("s2-02-uploaded.png");

  await page.evaluate(() => {
    const el =
      document.querySelector('[data-id="treeViewDivDraggableItemStepFundAll.sol"]') ||
      [...document.querySelectorAll("[data-id^='treeViewDivDraggableItem']")].find((e) =>
        /StepFundAll\.sol/.test(e.getAttribute("data-id"))
      );
    if (el) el.click();
  });
  await sleep(6000);
  await cleanup();
  await snap("s2-03-editor.png");
  rec("lines", await page.evaluate(() => document.querySelectorAll(".view-lines .view-line").length));

  // compiler
  await page.evaluate(() => document.querySelector('[data-id="verticalIconsKindsolidity"]').click());
  await sleep(8000);
  await cleanup();

  await page.evaluate(() => document.querySelector("#versionSelector button").click());
  await sleep(2000);
  rec(
    "version",
    await page.evaluate(() => {
      const m = document.querySelector("#versionSelector .dropdown-menu");
      const hit = [...m.querySelectorAll("button, div, li, a, span")].find((e) =>
        /^0\.8\.30\+commit\./.test((e.innerText || "").trim())
      );
      if (!hit) return null;
      hit.click();
      return hit.innerText.trim();
    })
  );
  await sleep(2500);

  await page.evaluate(() => {
    const adv = [...document.querySelectorAll("div, span, button")].find(
      (e) => /^Advanced Configurations$/.test((e.innerText || "").trim())
    );
    if (adv) adv.click();
  });
  await sleep(1800);
  const cfg = await page.evaluate(() => ({
    optimize: document.querySelector("#optimize")?.checked,
    runs: document.querySelector("#runs")?.value,
    evm: document.querySelector("#evmVersion")?.value,
  }));
  rec("cfg_before", cfg);
  if (!cfg.optimize) {
    await page.evaluate(() => document.querySelector("#optimize").click());
    await sleep(500);
  }
  await page.locator("#runs").fill("200");
  await page.evaluate(() => {
    const s = document.querySelector("#evmVersion");
    if (s && s.value !== "paris") {
      s.value = "paris";
      s.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await sleep(1000);
  rec(
    "cfg_after",
    await page.evaluate(() => ({
      version: document.querySelector("#versionSelector")?.innerText.trim(),
      optimize: document.querySelector("#optimize")?.checked,
      runs: document.querySelector("#runs")?.value,
      evm: document.querySelector("#evmVersion")?.value,
    }))
  );
  // full panel with advanced open (compiler settings evidence)
  await snap("s2-04-compiler-settings.png", { clip: { x: 0, y: 0, width: 420, height: 620 } });

  // compile
  rec(
    "compile_click",
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((e) =>
        /^Compile\s*StepFundAll\.sol$/.test((e.innerText || "").trim())
      );
      if (b) {
        b.click();
        return true;
      }
      return false;
    })
  );
  await sleep(75000);
  await cleanup();
  rec(
    "compiled",
    await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        warnings: (t.match(/Warning: Unused function parameter/g) || []).length,
        err: /CompilerError|ParserError|DeclarationError/.test(t),
      };
    })
  );
  // collapse advanced so the whole result card fits
  await page.evaluate(() => {
    const adv = [...document.querySelectorAll("div, span, button")].find(
      (e) => /^Advanced Configurations$/.test((e.innerText || "").trim())
    );
    if (adv) adv.click();
  });
  await sleep(2500);
  await snap("s2-05-compiled.png", { clip: { x: 0, y: 0, width: 420, height: 1010 } });

  // open the CONTRACT dropdown to prove all artifacts exist
  const dropInfo = await page.evaluate(() => {
    const holder =
      document.querySelector("#selectContract") ||
      document.querySelector("[data-id='deployAndRunListSelect']") ||
      [...document.querySelectorAll("div")].find((d) => /^AaveV3Vault|^StepFundFactory|^TestUSD/.test((d.innerText || "").trim()) && d.className.includes("dropdown"));
    if (!holder) return { found: false };
    holder.click();
    return { found: true, id: holder.id, cls: holder.className, txt: (holder.innerText || "").trim().slice(0, 80) };
  });
  rec("dropdown_open", dropInfo);
  await sleep(2000);
  await snap("s2-05b-contract-list.png", { clip: { x: 0, y: 0, width: 420, height: 1010 } });
  rec(
    "contract_list",
    await page.evaluate(() =>
      [...document.querySelectorAll("div,li,span")]
        .map((e) => (e.innerText || "").trim())
        .filter((t) => /^(StepFundFactory|CampaignDeployer|MilestoneCampaign|AcceptanceVerifier|AaveV3Vault|ResearchVault|TestUSD)$/.test(t))
        .filter((v, i, a) => a.indexOf(v) === i)
    )
  );
  // close dropdown
  await page.keyboard.press("Escape");
  await sleep(800);

  // deploy panel
  await page.evaluate(() => document.querySelector('[data-id="verticalIconsKindudapp"]').click());
  await sleep(7000);
  await cleanup();
  await snap("s2-06-deploy-panel.png", { clip: { x: 0, y: 0, width: 440, height: 900 } });
  rec(
    "deploy_panel",
    await page.evaluate(() => ({
      env: (document.querySelector("[data-id='settingsEnvironment']")?.innerText || "").replace(/\n+/g, " | "),
      account: (document.querySelector("#defaultAccount")?.innerText || "").replace(/\n+/g, " | "),
      contractBox: (document.querySelector("#selectContract")?.innerText || "").replace(/\n+/g, " | "),
      contractHTML: (document.querySelector("#selectContract")?.outerHTML || "").slice(0, 500),
    }))
  );

  // ---- robust contract picker
  const pick = async (name) => {
    const opened = await page.evaluate(() => {
      const el = document.querySelector("#selectContract");
      if (!el) return false;
      el.click();
      const btn = el.querySelector("button");
      if (btn) btn.click();
      return true;
    });
    await sleep(1800);
    const r = await page.evaluate((nm) => {
      const vis = (e) => e.offsetParent !== null;
      const cands = [...document.querySelectorAll("div,span,li,button,a,p")].filter(
        (e) => vis(e) && (e.innerText || "").trim() === nm
      );
      if (!cands.length) {
        const near = [...document.querySelectorAll("div,span,li")].filter(
          (e) => vis(e) && (e.innerText || "").includes(nm)
        ).length;
        return { ok: false, near, html: (document.querySelector("#selectContract")?.outerHTML || "").slice(0, 400) };
      }
      cands.sort((a, b) => b.querySelectorAll("*").length - a.querySelectorAll("*").length);
      cands[0].click();
      return { ok: true, tag: cands[0].tagName };
    }, name);
    await sleep(2000);
    const shown = await page.evaluate(() => (document.querySelector("#selectContract")?.innerText || "").replace(/\n+/g, " | ").trim());
    return { opened, ...r, shown };
  };

  rec("pick_testusd", await pick("TestUSD"));
  await cleanup();
  await snap("s2-07-deploy-testusd.png", { clip: { x: 0, y: 0, width: 440, height: 940 } });

  const clickDeploy = async () => {
    const hit = await page.evaluate(() => {
      const b =
        document.querySelector("[data-id='deployButton']") ||
        [...document.querySelectorAll("button")].find(
          (e) => /^(Deploy|Transact)$/.test((e.innerText || "").trim()) && e.offsetParent !== null
        );
      if (b) {
        b.click();
        return (b.innerText || "").trim();
      }
      return null;
    });
    await sleep(7000);
    return hit;
  };
  rec("deploy1", await clickDeploy());
  await cleanup();
  rec(
    "after_deploy1",
    await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        addr: (t.match(/TestUSD at (0x[0-9a-fA-F]{40})/) || [])[1] || null,
        vm: (t.match(/\[vm\][^\n]*/g) || []).slice(-3),
      };
    })
  );
  await snap("s2-08-testusd-deployed.png", { clip: { x: 0, y: 0, width: 440, height: 1010 } });

  const usdAddr = notes.after_deploy1?.addr || null;
  rec("usd_addr", usdAddr);

  // factory
  rec("pick_factory", await pick("StepFundFactory"));
  await sleep(1500);
  rec(
    "factory_form",
    await page.evaluate(() => ({
      params: [...document.querySelectorAll("input")].filter((i) => i.offsetParent !== null).map((i) => i.placeholder || i.id).slice(0, 10),
      html: (document.querySelector("#deployAndRunListSelect")?.innerText || "").replace(/\n+/g, " | ").slice(0, 300),
    }))
  );
  const filled = await page.evaluate((addr) => {
    const inp = [...document.querySelectorAll("input")].find(
      (i) => i.offsetParent !== null && /asset_?/.test(i.getAttribute("placeholder") || "")
    );
    if (!inp) return "no-input";
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    inp.focus();
    setter.call(inp, addr);
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    inp.blur();
    return inp.value;
  }, usdAddr || "0x0000000000000000000000000000000000000001");
  rec("factory_arg", filled);
  await sleep(1200);
  await cleanup();
  await snap("s2-09-deploy-factory.png", { clip: { x: 0, y: 0, width: 440, height: 940 } });

  rec("deploy2", await clickDeploy());
  await cleanup();
  rec(
    "after_deploy2",
    await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        addr: (t.match(/StepFundFactory at (0x[0-9a-fA-F]{40})/) || [])[1] || null,
        vm: (t.match(/\[vm\][^\n]*/g) || []).slice(-4),
      };
    })
  );
  await snap("s2-10-factory-deployed.png", { clip: { x: 0, y: 0, width: 440, height: 1010 } });

  // expand instance
  await page.evaluate(() => {
    const heads = [...document.querySelectorAll("div,button")].filter(
      (e) => /^StepFundFactory at 0x/.test((e.innerText || "").trim()) && e.offsetParent !== null
    );
    if (heads.length) heads[heads.length - 1].click();
  });
  await sleep(2500);
  await cleanup();
  await snap("s2-11-factory-expanded.png", { clip: { x: 0, y: 0, width: 440, height: 1010 } });

  const callFn = async (nm) => {
    const ok = await page.evaluate((name) => {
      const btns = [...document.querySelectorAll("button, .ud_function, [data-id^='multiParam']")].filter(
        (e) => ((e.innerText || "").trim().split("\n")[0] || "") === name && e.offsetParent !== null
      );
      if (!btns.length) {
        const near = [...document.querySelectorAll("button")].filter((e) => (e.innerText || "").includes(name)).length;
        return { ok: false, near };
      }
      btns[btns.length - 1].click();
      return { ok: true };
    }, nm);
    await sleep(4000);
    return ok;
  };
  rec("call_version", await callFn("protocolVersion"));
  await cleanup();
  rec(
    "version_result",
    await page.evaluate(() => (document.body.innerText.match(/0:\s*uint256:\s*[\d,]+/g) || []).slice(-4))
  );
  await snap("s2-12-call-protocolversion.png", { clip: { x: 0, y: 0, width: 440, height: 1010 } });

  rec("call_count", await callFn("campaignCount"));
  await cleanup();
  rec(
    "count_result",
    await page.evaluate(() => (document.body.innerText.match(/0:\s*uint256:\s*[\d,]+/g) || []).slice(-4))
  );
  await snap("s2-13-call-campaigncount.png", { clip: { x: 0, y: 0, width: 440, height: 1010 } });

  await cleanup();
  await snap("s2-14-full.png");
  rec("terminal", await page.evaluate(() => (document.body.innerText.match(/\[vm\][^\n]*/g) || []).slice(-8)));

  fs.writeFileSync(P("capture-log-v2.json"), JSON.stringify(notes, null, 2), "utf8");
  await browser.close();
  console.log("DONE");
})().catch((e) => {
  console.log("FAILED: " + e.message);
  fs.writeFileSync(P("capture-log-v2.json"), JSON.stringify(notes, null, 2), "utf8");
  process.exit(1);
});
