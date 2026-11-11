// Standalone compile check of the flattened Remix file using solc 0.8.30 (same compiler Remix uses).
const fs = require("fs");
const path = require("path");
const solc = require("solc");

const FILE = path.join(__dirname, "..", "remix-verify", "StepFundAll.sol");
const src = fs.readFileSync(FILE, "utf8");
const lines = src.split(/\r?\n/);
console.log("solc version:", solc.version());
console.log("source lines:", lines.length);

function run(viaIR) {
  const input = {
    language: "Solidity",
    sources: { "StepFundAll.sol": { content: src } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR,
      evmVersion: "paris",
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errs = (out.errors || []).filter((e) => e.severity === "error");
  const warns = (out.errors || []).filter((e) => e.severity === "warning");
  console.log(`\n=== optimizer=200 evmVersion=paris viaIR=${viaIR} ===`);
  console.log("errors:", errs.length, "warnings:", warns.length);
  for (const e of errs) {
    const m = /StepFundAll\.sol:(\d+):(\d+)/.exec(e.formattedMessage);
    console.log("ERR:", e.type || e.severity, "-", (e.message || "").split("\n")[0]);
    if (m) {
      const ln = Number(m[1]);
      console.log("     at line", ln, ":", (lines[ln - 2] || "").trim().slice(0, 120));
      console.log("                   ", (lines[ln - 1] || "").trim().slice(0, 120));
    }
  }
  for (const w of warns) console.log("WARN:", (w.message || "").split("\n")[0]);
  if (!errs.length) {
    const contracts = out.contracts["StepFundAll.sol"];
    const rows = [];
    for (const name of Object.keys(contracts)) {
      const bc = contracts[name].evm.bytecode.object;
      if (!bc) continue;
      rows.push({
        name,
        deploy: contracts[name].evm.deployedBytecode.object.length / 2,
        create: bc.length / 2,
      });
    }
    rows.sort((a, b) => b.deploy - a.deploy);
    console.log("  deployed(runtime) bytes / creation bytes   [EIP-170 limit 24576]");
    for (const r of rows) {
      console.log(
        `  ${r.name.padEnd(22)} ${String(r.deploy).padStart(7)} / ${String(r.create).padStart(7)}` +
          (r.deploy > 24576 ? "   <-- OVER LIMIT" : ""),
      );
    }
  }
  return errs.length === 0;
}

const okNoIR = run(false);
const okIR = run(true);
console.log(`\nRESULT  no-viaIR=${okNoIR ? "PASS" : "FAIL"}   viaIR=${okIR ? "PASS" : "FAIL"}`);
