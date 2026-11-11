// v4: fix the Deploy button (tab has the same label), capture the real instance address,
// then call the two view functions.
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
      const cands = [...document.querySelectorAll("div")].filter(
        (d) => d.innerText && d.innerText.includes("Advanced Commands") && d.innerText.includes("Upgrade Plan")
      );
      cands.sort((a, b) => a.innerText.length - b.innerText.length);
      if (cands.length) {
        let node = cands[0];
        for (let i = 0; i < 8 && node; i++) {
          const cs = getComputedStyle(node);
          if (cs.position === "fixed" || cs.position === "absolute") { node.remove(); break; }
          node = node.parentElement;
        }
      }
      document.querySelectorAll(".modal-backdrop, .nudge-modal-backdrop").forEach((e) => e.remove());
    });
    await page.mouse.move(1400, 400);
    await sleep(700);
  };

  const snap = async (name, clip) => {
    await cleanup();
    await page.screenshot({ path: P(name), ...(clip ? { clip } : {}) });
    console.log("  shot " + name);
  };

  const scrollPanel = async (where) => {
    await page.evaluate((w) => {
      const boxes = [...document.querySelectorAll("div")].filter((d) => {
        const cs = getComputedStyle(d);
        const r = d.getBoundingClientRect();
        return (
          (cs.overflowY === "auto" || cs.overflowY === "scroll") &&
          d.scrollHeight > d.clientHeight + 40 &&
          r.left < 500 && r.width < 700
        );
      });
      boxes.forEach((d) => (d.scrollTop = w === "bottom" ? d.scrollHeight : 0));
    }, where);
    await sleep(900);
  };

  await page.goto("https://remix.ethereum.org", { waitUntil: "domcontentloaded", timeout: 180000 });
  await sleep(14000);
  await snap("s4-01-home.png");

  await page.locator('input[data-id="fileExplorerLocalFileSystemUpload"]').setInputFiles(FILE);
  await sleep(7000);
  await snap("s4-02-uploaded.png", { x: 0, y: 0, width: 460, height: 620 });

  await page.evaluate(() => {
    const el =
      document.querySelector('[data-id="treeViewDivDraggableItemStepFundAll.sol"]') ||
      [...document.querySelectorAll("[data-id^='treeViewDivDraggableItem']")].find((e) =>
        /StepFundAll\.sol/.test(e.getAttribute("data-id"))
      );
    if (el) el.click();
  });
  await sleep(6000);
  await snap("s4-03-editor.png");

  await page.evaluate(() => document.querySelector('[data-id="verticalIconsKindsolidity"]').click());
  await sleep(8000);
  await cleanup();
  await page.evaluate(() => document.querySelector("#versionSelector button").click());
  await sleep(2000);
  rec("version", await page.evaluate(() => {
    const m = document.querySelector("#versionSelector .dropdown-menu");
    const hit = [...m.querySelectorAll("button, div, li, a, span")].find((e) => /^0\.8\.30\+commit\./.test((e.innerText || "").trim()));
    if (!hit) return null;
    hit.click();
    return hit.innerText.trim();
  }));
  await sleep(2500);
  await page.evaluate(() => {
    const adv = [...document.querySelectorAll("div, span, button")].find((e) => /^Advanced Configurations$/.test((e.innerText || "").trim()));
    if (adv) adv.click();
  });
  await sleep(1800);
  if (!(await page.evaluate(() => document.querySelector("#optimize")?.checked)))
    await page.evaluate(() => document.querySelector("#optimize").click());
  await page.locator("#runs").fill("200");
  await page.evaluate(() => {
    const s = document.querySelector("#evmVersion");
    if (s && s.value !== "paris") { s.value = "paris"; s.dispatchEvent(new Event("change", { bubbles: true })); }
  });
  await sleep(1200);
  rec("cfg", await page.evaluate(() => ({
    version: document.querySelector("#versionSelector")?.innerText.trim(),
    optimize: document.querySelector("#optimize")?.checked,
    runs: document.querySelector("#runs")?.value,
    evm: document.querySelector("#evmVersion")?.value,
  })));
  await snap("s4-04-settings.png", { x: 0, y: 0, width: 470, height: 1010 });

  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((e) => /^Compile\s*StepFundAll\.sol$/.test((e.innerText || "").trim()))?.click();
  });
  await sleep(75000);
  await cleanup();
  rec("compiled", await page.evaluate(() => {
    const t = document.body.innerText;
    return { warn: (t.match(/Warning: Unused function parameter/g) || []).length, err: /CompilerError|ParserError/.test(t) };
  }));
  await page.evaluate(() => {
    const adv = [...document.querySelectorAll("div, span, button")].find((e) => /^Advanced Configurations$/.test((e.innerText || "").trim()));
    if (adv) adv.click();
  });
  await sleep(2500);
  await snap("s4-05-compiled.png", { x: 0, y: 0, width: 470, height: 1010 });

  await page.evaluate(() => document.querySelector('[data-id="verticalIconsKindudapp"]').click());
  await sleep(7000);
  await cleanup();
  await scrollPanel("top");
  await snap("s4-06-deploy-panel.png", { x: 0, y: 0, width: 470, height: 900 });

  await page.evaluate(() => document.querySelector('[data-id="contractDropdownToggle"]').click());
  await sleep(1800);
  rec("dropdown_items", await page.evaluate(() =>
    [...document.querySelectorAll("a.contract-dropdown-item-hover")].map((a) => (a.innerText || "").trim().split("\n")[0].trim())
  ));
  await snap("s4-07-contract-list.png", { x: 0, y: 0, width: 470, height: 1010 });

  const pick = async (name) => {
    await page.evaluate(() => document.querySelector('[data-id="contractDropdownToggle"]')?.click());
    await sleep(1600);
    const r = await page.evaluate((nm) => {
      const items = [...document.querySelectorAll("a.contract-dropdown-item-hover")];
      const hit = items.find((a) => (a.innerText || "").trim().split("\n")[0].trim() === nm);
      if (!hit) return { ok: false, count: items.length };
      hit.click();
      return { ok: true };
    }, name);
    await sleep(1800);
    const shown = await page.evaluate(() =>
      (document.querySelector('[data-id="contractDropdownToggle"]')?.innerText || "").trim().split("\n")[0].trim()
    );
    return { ...r, shown };
  };

  // ---- the Deploy *button* (not the tab): wide primary button
  const deploy = async () => {
    const info = await page.evaluate(() => {
      const cands = [...document.querySelectorAll("button")].filter((e) => {
        const t = (e.innerText || "").trim();
        const r = e.getBoundingClientRect();
        return /^(Deploy|Transact)$/.test(t) && e.offsetParent !== null && r.width > 150;
      });
      if (!cands.length) return { clicked: false };
      const b = cands[0];
      b.scrollIntoView({ block: "center" });
      b.click();
      return { clicked: true, w: Math.round(b.getBoundingClientRect().width), cls: b.className.slice(0, 60) };
    });
    await sleep(8000);
    return info;
  };

  rec("pick_testusd", await pick("TestUSD"));
  await cleanup();
  await snap("s4-08-testusd-form.png", { x: 0, y: 0, width: 470, height: 1000 });

  rec("deploy_testusd", await deploy());
  await cleanup();
  const state1 = await page.evaluate(() => {
    const t = document.body.innerText;
    const at = t.match(/(\w+) at (0x[0-9a-fA-F]{3,40})/g) || [];
    const nodes = [...document.querySelectorAll("*")].filter(
      (e) => / at 0x/.test((e.innerText || "").trim()) && (e.innerText || "").trim().length < 60 && e.offsetParent !== null
    );
    return {
      atLines: at.slice(-4),
      instanceNodes: nodes.slice(0, 4).map((e) => ({
        tag: e.tagName,
        cls: (e.className || "").toString().slice(0, 60),
        txt: (e.innerText || "").trim().slice(0, 50),
        title: e.getAttribute("title") || "",
        dataId: e.getAttribute("data-id") || "",
      })),
      vm: (t.match(/\[vm\][^\n]*/g) || []).slice(-3),
    };
  });
  rec("testusd_state", state1);
  await scrollPanel("bottom");
  await snap("s4-09-testusd-deployed.png", { x: 0, y: 0, width: 470, height: 1050 });
  await scrollPanel("top");

  const usd = (state1.atLines.find((l) => /^TestUSD at/.test(l)) || "").split(" at ")[1] || null;
  rec("usd_addr", usd);

  rec("pick_factory", await pick("StepFundFactory"));
  await cleanup();
  rec("factory_form", await page.evaluate(() => ({
    inputs: [...document.querySelectorAll("input")].filter((i) => i.offsetParent !== null).map((i) => i.placeholder || i.id),
  })));
  const filled = await page.evaluate((addr) => {
    const inp = [...document.querySelectorAll("input")].find(
      (i) => i.offsetParent !== null && (i.placeholder === "address" || /asset/.test(i.placeholder || ""))
    );
    if (!inp) return "no-input";
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    inp.focus();
    setter.call(inp, addr);
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    inp.blur();
    return inp.value;
  }, usd || "0x000000000000000000000000000000000000dEaD");
  rec("factory_arg", filled);
  await sleep(1200);
  await snap("s4-10-factory-form.png", { x: 0, y: 0, width: 470, height: 1000 });

  rec("deploy_factory", await deploy());
  await cleanup();
  const state2 = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      atLines: (t.match(/(\w+) at (0x[0-9a-fA-F]{3,40})/g) || []).slice(-4),
      vm: (t.match(/\[vm\][^\n]*/g) || []).slice(-3),
    };
  });
  rec("factory_state", state2);
  await scrollPanel("bottom");
  await snap("s4-11-factory-deployed.png", { x: 0, y: 0, width: 470, height: 1050 });

  // expand the factory instance
  const expanded = await page.evaluate(() => {
    const heads = [...document.querySelectorAll("div,button,a")].filter((e) => {
      const t = (e.innerText || "").trim();
      return /^StepFundFactory at 0x/.test(t) && e.offsetParent !== null && t.length < 80;
    });
    if (!heads.length) return false;
    heads.sort((a, b) => a.querySelectorAll("*").length - b.querySelectorAll("*").length);
    heads[0].click();
    return true;
  });
  rec("expand_click", expanded);
  await sleep(2500);
  await scrollPanel("bottom");
  await snap("s4-12-expanded.png", { x: 0, y: 0, width: 470, height: 1050 });
  rec("functions", await page.evaluate(() =>
    [...document.querySelectorAll("button")].filter((e) => e.offsetParent !== null).map((e) => (e.innerText || "").trim().split("\n")[0]).filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 40)
  ));

  const callFn = async (nm) => {
    const r = await page.evaluate((name) => {
      const btns = [...document.querySelectorAll("button")].filter(
        (e) => (e.innerText || "").trim().split("\n")[0].trim() === name && e.offsetParent !== null
      );
      if (!btns.length) return { ok: false, near: 0 };
      btns[btns.length - 1].scrollIntoView({ block: "center" });
      btns[btns.length - 1].click();
      return { ok: true, n: btns.length };
    }, nm);
    await sleep(4500);
    return r;
  };
  rec("call_version", await callFn("protocolVersion"));
  await cleanup();
  rec("version_result", await page.evaluate(() => (document.body.innerText.match(/0:\s*uint256:\s*[\d,]+/g) || []).slice(-3)));
  await snap("s4-13-call-version.png", { x: 0, y: 0, width: 470, height: 1050 });

  rec("call_count", await callFn("campaignCount"));
  await cleanup();
  rec("count_result", await page.evaluate(() => (document.body.innerText.match(/0:\s*uint256:\s*[\d,]+/g) || []).slice(-3)));
  await snap("s4-14-call-count.png", { x: 0, y: 0, width: 470, height: 1050 });

  await snap("s4-15-full.png");
  fs.writeFileSync(P("capture-log-v4.json"), JSON.stringify(notes, null, 2), "utf8");
  await browser.close();
  console.log("DONE");
})().catch((e) => {
  console.log("FAILED: " + e.message);
  fs.writeFileSync(P("capture-log-v4.json"), JSON.stringify(notes, null, 2), "utf8");
  process.exit(1);
});
