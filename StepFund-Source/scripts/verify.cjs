const hre = require("hardhat");
const fs = require("node:fs");
async function verify(address, args) {
  try {
    await hre.run("verify:verify", { address, constructorArguments: args });
  } catch (e) {
    if (/already verified/i.test(e.message))
      console.log(address + " already verified.");
    else throw e;
  }
}
async function main() {
  const { chainId } = await hre.ethers.provider.getNetwork();
  if (chainId !== 11155111n) throw Error("Verification is for Sepolia only.");
  const data = JSON.parse(
    fs.readFileSync("public/deployments/11155111.json", "utf8"),
  );
  if (data.customTestToken !== false) await verify(data.token, []);
  await verify(data.factory, [data.token]);
  if (data.verifier) await verify(data.verifier, []);
  if (data.researchVault) await verify(data.researchVault, [data.token]);
  if (data.aaveVault) await verify(data.aaveVault, [data.token, data.aavePool, data.aaveAToken]);
  const factory = await hre.ethers.getContractAt(
    "StepFundFactory",
    data.factory,
  );
  for (let i = 0; i < Number(await factory.campaignCount()); i++) {
    const address = await factory.campaignAt(i);
    const c = await hre.ethers.getContractAt("MilestoneCampaign", address);
    const stages = await c.getStages();
    await verify(address, [
      data.token,
      await c.creator(),
      await c.title(),
      await c.summary(),
      await c.category(),
      await c.fundingEnds(),
      await c.votingPeriod(),
      stages.map((s) => s.title),
      stages.map((s) => s.budget),
      stages.map((s) => s.due),
    ]);
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
