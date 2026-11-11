const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, ".."),
  visited = new Set(),
  sections = [];
function visit(directory) {
  if (visited.has(directory)) return;
  visited.add(directory);
  const file = path.join(directory, "package.json");
  if (!fs.existsSync(file)) return;
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  const licenses = fs
    .readdirSync(directory)
    .filter(
      (n) =>
        /^(licen[cs]e|copying|notice)(\.|$)/i.test(n) &&
        fs.statSync(path.join(directory, n)).isFile(),
    );
  sections.push(
    `${pkg.name} ${pkg.version}\nLicense: ${typeof pkg.license === "string" ? pkg.license : JSON.stringify(pkg.license || pkg.licenses || "See package source")}\nSource: ${typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url || pkg.homepage || ""}\n${licenses.map((n) => n + "\n" + fs.readFileSync(path.join(directory, n), "utf8")).join("\n")}`,
  );
  for (const dep of Object.keys(pkg.dependencies || {})) {
    let base = directory;
    while (true) {
      const candidate = path.join(base, "node_modules", dep);
      if (fs.existsSync(path.join(candidate, "package.json"))) {
        visit(candidate);
        break;
      }
      const parent = path.dirname(base);
      if (parent === base) break;
      base = parent;
    }
  }
}
for (const name of [
  "react",
  "react-dom",
  "ethers",
  "@metamask/connect-evm",
  "qrcode",
  "fflate",
  "lucide-react",
  "radix-ui",
  "sonner",
  "next-themes",
  "class-variance-authority",
  "clsx",
  "tailwind-merge",
  "@openzeppelin/contracts",
  "@storacha/client",
  "snarkjs",
  "poseidon-lite",
  "circomlib",
])
  visit(path.join(root, "node_modules", name));
const heading =
  "StepFund third-party notices\n\nOriginal application code: MIT. snarkjs and its generated verifier are GPL-3.0; the snarkjs browser distribution retains that license. Corresponding source and build metadata are in vendor/snarkjs-source/. Preserve these notices when redistributing. Node.js runtime: see runtime/NODE-LICENSE.txt in the portable distribution (Node v24.15.0).\nShadcn UI component source: https://github.com/shadcn-ui/ui (MIT).\nSites starter and connector build plugin: see build/sites-vite-plugin.LICENSE and vendor/ for included licenses.\n\n";
fs.writeFileSync(
  path.join(root, "THIRD-PARTY-NOTICES.txt"),
  heading + sections.join("\n\n" + "=".repeat(72) + "\n\n") + "\n",
);
console.log(`Saved notices for ${sections.length} dependency packages.`);
