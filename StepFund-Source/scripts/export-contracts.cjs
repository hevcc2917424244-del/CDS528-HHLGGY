const hre = require("hardhat");
const fs = require("node:fs");
async function main() {
  fs.mkdirSync("public/contracts", { recursive: true });
  for (const name of ["TestUSD", "StepFundFactory", "MilestoneCampaign", "AcceptanceVerifier", "ResearchVault", "AaveV3Vault"]) {
    const artifact = await hre.artifacts.readArtifact(name);
    const build = await hre.artifacts.getBuildInfo(
      `${artifact.sourceName}:${name}`,
    );
    if (!build) throw Error(`Missing build information for ${name}`);
    fs.writeFileSync(
      `public/contracts/${name}.json`,
      JSON.stringify(
        { contractName: name, abi: artifact.abi, bytecode: artifact.bytecode },
        null,
        2,
      ) + "\n",
    );
    fs.writeFileSync(
      `public/contracts/${name}.verification.json`,
      JSON.stringify({
        stdJsonInput: build.input,
        compilerVersion: build.solcLongVersion.replace(
          /\.Emscripten\.clang$/,
          "",
        ),
        contractIdentifier: `${artifact.sourceName}:${name}`,
      }) + "\n",
    );
  }
  console.log("Exported compiled contract ABIs and deployment bytecode.");
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
