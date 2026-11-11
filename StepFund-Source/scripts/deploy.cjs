const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");
async function main() {
  const { ethers } = hre;
  const { chainId } = await ethers.provider.getNetwork();
  if (![31337n, 11155111n].includes(chainId))
    throw new Error("Only local Hardhat and Sepolia are allowed.");
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set a TESTNET DEPLOYER_PRIVATE_KEY in .env.");
  const token = await ethers.deployContract("TestUSD");
  await token.waitForDeployment();
  const factory = await ethers.deployContract("StepFundFactory", [
    await token.getAddress(),
  ]);
  await factory.waitForDeployment();
  const researchVault = await ethers.deployContract("ResearchVault", [token.target]);
  await researchVault.waitForDeployment();
  const data = {
    chainId: Number(chainId),
    token: await token.getAddress(),
    factory: await factory.getAddress(),
    verifier: await factory.acceptanceVerifier(),
    researchVault: researchVault.target,
    protocolVersion: 3,
    assetSymbol: "tUSD",
    deployer: deployer.address,
    blockNumber: await ethers.provider.getBlockNumber(),
    deployedAt: new Date().toISOString(),
    compiler: require("solc").version(),
  };
  fs.mkdirSync("public/deployments", { recursive: true });
  fs.writeFileSync(
    `public/deployments/${chainId}.json`,
    JSON.stringify(data, null, 2) + "\n",
  );
  for (const name of ["TestUSD", "StepFundFactory", "MilestoneCampaign"]) {
    const artifact = await hre.artifacts.readArtifact(name);
    fs.mkdirSync("public/contracts", { recursive: true });
    fs.writeFileSync(
      path.join("public/contracts", name + ".json"),
      JSON.stringify(
        { contractName: name, abi: artifact.abi, bytecode: artifact.bytecode },
        null,
        2,
      ) + "\n",
    );
  }
  console.log(JSON.stringify(data, null, 2));
  if (chainId === 31337n) {
    const [, backer, other] = await ethers.getSigners();
    for (const signer of [deployer, backer, other])
      await (await token.connect(signer).faucet()).wait();
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const day = 86400;
    const examples = [
      [
        "Campus Maker Space",
        "A shared workshop for students. Each milestone requires evidence and a backer vote.",
        2,
        [200, 300, 500],
      ],
      [
        "Open Community Library",
        "Reading spaces, shared books, and community workshops, funded in three accountable stages.",
        0,
        [600, 1000, 800],
      ],
      [
        "Open Air Quality Network",
        "Community air-quality sensors and an open data portal.",
        1,
        [200, 300, 300],
      ],
    ];
    for (const [title, summary, category, budgets] of examples) {
      const bond =
        budgets.reduce((sum, n) => sum + BigInt(n) * 1000000n, 0n) / 20n;
      await (await token.approve(factory.target, bond)).wait();
      await (
        await factory.createCampaign([
          title,
          summary,
          category,
          now + 5 * day,
          2 * day,
          ["Plan and prototype", "Equipment and pilot", "Community launch"],
          budgets.map((n) => ethers.parseUnits(String(n), 6)),
          [10, 17, 24].map((n) => now + n * day),
        ])
      ).wait();
    }
    const first = await ethers.getContractAt(
      "MilestoneCampaign",
      await factory.campaignAt(0),
    );
    for (const [signer, value] of [
      [backer, 600],
      [other, 400],
    ]) {
      await (
        await token
          .connect(signer)
          .approve(first.target, ethers.parseUnits(String(value), 6))
      ).wait();
      await (
        await first
          .connect(signer)
          .contribute(ethers.parseUnits(String(value), 6))
      ).wait();
    }
    await (await first.finalizeFunding()).wait();
    const uri = "https://example.com/";
    await (
      await first.submitEvidence(
        uri,
        ethers.keccak256(
          ethers.toUtf8Bytes("Sample evidence for local testing only."),
        ),
      )
    ).wait();
    console.log(
      "Created 3 real local-chain projects. The first has an open vote. Local sample evidence is illustrative.",
    );
  }
  if (chainId === 11155111n)
    console.log(
      "Next: npm run verify:sepolia. Contract verification requires ETHERSCAN_API_KEY.",
    );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
