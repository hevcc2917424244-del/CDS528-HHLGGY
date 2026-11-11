// Run after hardhat compile. Checks bundled deployment files against this source.
const hre = require("hardhat");
const fs = require("node:fs");
const assert = require("node:assert/strict");

async function main() {
  for (const name of ["TestUSD", "StepFundFactory", "MilestoneCampaign", "AcceptanceVerifier", "ResearchVault", "AaveV3Vault"]) {
    const compiled = await hre.artifacts.readArtifact(name);
    const build = await hre.artifacts.getBuildInfo(`${compiled.sourceName}:${name}`);
    assert.ok(build, `Missing build information for ${name}`);
    assert.ok((compiled.deployedBytecode.length - 2) / 2 <= 24576, `${name}: exceeds EIP-170 runtime size`);
    assert.ok((compiled.bytecode.length - 2) / 2 <= 49152, `${name}: exceeds EIP-3860 initcode size`);
    const bundled = JSON.parse(fs.readFileSync(`public/contracts/${name}.json`, "utf8"));
    const verification = JSON.parse(fs.readFileSync(`public/contracts/${name}.verification.json`, "utf8"));
    assert.equal(bundled.bytecode, compiled.bytecode, `${name}: stale bytecode; run npm run export:contracts`);
    assert.deepEqual(bundled.abi, compiled.abi, `${name}: stale ABI`);
    assert.deepEqual(verification.stdJsonInput, build.input, `${name}: verification input differs from current source`);
    assert.equal(verification.compilerVersion, build.solcLongVersion.replace(/\.Emscripten\.clang$/, ""));
    console.log(`${name}: ABI, bytecode and verification input match current source`);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
