// Compiles the whole contracts/ tree with the plain (non via-IR) pipeline and
// reports errors plus deployed-bytecode sizes. Mirrors Remix defaults: 0.8.30,
// optimizer on, runs 200, evmVersion paris.
const fs = require("fs");
const path = require("path");
const solc = require("solc");

const root = path.resolve(__dirname, "..");
const sources = {};

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full);
    else if (name.endsWith(".sol")) {
      sources[path.relative(root, full).split(path.sep).join("/")] = {
        content: fs.readFileSync(full, "utf8").replace(/^\uFEFF/, ""),
      };
    }
  }
}
walk(path.join(root, "contracts"));

const viaIR = process.argv.includes("--via-ir");
const runsArg = process.argv.find((a) => a.startsWith("--runs="));
const evmArg = process.argv.find((a) => a.startsWith("--evm="));
const runs = runsArg ? Number(runsArg.split("=")[1]) : 200;
const evmVersion = evmArg ? evmArg.split("=")[1] : "paris";
const optEnabled = !process.argv.includes("--no-opt");

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: optEnabled, runs },
    viaIR,
    evmVersion,
    outputSelection: { "*": { "*": ["evm.deployedBytecode.object", "evm.bytecode.object", "abi"] } },
  },
};

function findImport(importPath) {
  const candidates = [
    path.join(root, importPath),
    path.join(root, "node_modules", importPath),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return { contents: fs.readFileSync(c, "utf8") };
  }
  return { error: "not found: " + importPath };
}

const out = JSON.parse(
  solc.compile(JSON.stringify(input), { import: findImport })
);

const errors = (out.errors || []).filter((e) => e.severity === "error");
const warnings = (out.errors || []).filter((e) => e.severity === "warning");

function locOf(e) {
  const s = e.sourceLocation;
  if (!s || !s.file) return "(no source location)";
  const lines = (sources[s.file] ? sources[s.file].content : "").split("\n");
  let acc = 0;
  for (let i = 0; i < lines.length; i++) {
    const next = acc + lines[i].length + 1;
    if (s.start >= acc && s.start < next) {
      return `${s.file}:${i + 1}:${s.start - acc + 1}  |  ${lines[i].trim().slice(0, 110)}`;
    }
    acc = next;
  }
  return s.file;
}

console.log(`solc ${solc.version()}  viaIR=${viaIR}  runs=${runs}  evm=${evmVersion}  files=${Object.keys(sources).length}`);
console.log(`errors=${errors.length} warnings=${warnings.length}`);
for (const e of errors) {
  console.log("---- ERROR ----");
  console.log(String(e.message).split("\n").slice(0, 3).join("\n"));
  const walk = (x) => {
    if (!x) return;
    console.log("   at " + locOf(x));
    if (x.secondarySourceLocations) for (const s of x.secondarySourceLocations) walk(s);
  };
  walk(e);
}

if (!errors.length && out.contracts) {
  const rows = [];
  for (const [file, cs] of Object.entries(out.contracts)) {
    for (const [name, c] of Object.entries(cs)) {
      const obj = c.evm.deployedBytecode.object || "";
      const init = c.evm.bytecode.object || "";
      const size = obj.length / 2;
      if (size > 0) rows.push({ name, file, size, init: init.length / 2 });
    }
  }
  rows.sort((a, b) => b.size - a.size);
  console.log("---- deployed / creation bytecode (runtime limit 24576) ----");
  for (const r of rows) {
    if (r.size < 1000) continue;
    const pct = ((r.size / 24576) * 100).toFixed(1);
    const mark = r.size > 24576 ? "  <-- OVER LIMIT" : "";
    console.log(`${String(r.size).padStart(6)}  ${pct.padStart(5)}%  init=${String(r.init).padStart(6)}  ${r.name}${mark}`);
  }
}
for (const w of warnings) console.log(`WARN: ${String(w.message).split("\n")[0].slice(0, 120)}`);
