const fs = require('node:fs');
const assert = require('node:assert/strict');
const pkg = JSON.parse(fs.readFileSync('package.json'));
const lock = JSON.parse(fs.readFileSync('package-lock.json'));
assert.equal(pkg.version, lock.version); assert.equal(pkg.version, lock.packages[''].version);
for (const file of ['.github/workflows/ci.yml','contracts/MilestoneCampaign.sol','contracts/StepFundFactory.sol','contracts/AaveV3Vault.sol','contracts/AcceptanceVerifier.sol','circuits/Acceptance.circom','public/zk/manifest.json','public/zk/proof-worker.js','scripts/deploy-release.cjs','scripts/verify.cjs','docs/RELEASE-GUIDE.zh.md','docs/USER-GUIDE.zh.md','vendor/snarkjs-source/COPYING']) assert.ok(fs.existsSync(file), `Missing deliverable: ${file}`);
const example = fs.readFileSync('.env.example','utf8');
assert.ok(example.split(/\r?\n/).filter(x => x && !x.startsWith('#')).every(x => /^[A-Z_]+=$/.test(x)), 'Environment template must have empty values.');
for (const file of fs.readdirSync('public/deployments')) {
  if (!file.endsWith('.json') || file.includes('progress')) continue;
  const data = JSON.parse(fs.readFileSync('public/deployments/'+file));
  assert.ok([31337,11155111].includes(data.chainId), 'Unexpected public network.');
  for (const field of Object.keys(data)) assert.ok(!/private|secret|mnemonic|api.?key/i.test(field), 'Deployment records must contain public data only.');
}
console.log(`StepFund ${pkg.version}: source handoff, blank environment template, ZK assets and publisher scripts present. This is not a GitHub upload or Sepolia deployment.`);
