// Durable, explicit Sepolia deployment. No private keys are written to outputs.
const hre = require('hardhat');
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const { ethers } = hre;
  const net = await ethers.provider.getNetwork();
  if (net.chainId !== 11155111n) throw Error('Sepolia only. Use deploy:local for local demonstrations.');
  const [signer] = await ethers.getSigners();
  if (!signer) throw Error('Set a fresh testnet-only DEPLOYER_PRIVATE_KEY in the ignored .env file.');
  const folder = path.resolve('public/deployments'); fs.mkdirSync(folder, { recursive: true });
  const progressFile = path.join(folder, '11155111-progress.json');
  const progress = fs.existsSync(progressFile) ? JSON.parse(fs.readFileSync(progressFile)) : { chainId: 11155111, deployer: signer.address, steps: {} };
  if (progress.deployer.toLowerCase() !== signer.address.toLowerCase()) throw Error('Saved deployment belongs to another wallet. Review its receipts before starting another deployment.');
  const save = () => fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2) + '\n');
  async function deploy(name, args = []) {
    const factory = await ethers.getContractFactory(name, signer);
    const expected = await factory.getDeployTransaction(...args);
    let step = progress.steps[name];
    if (!step) {
      const instance = await factory.deploy(...args);
      step = { hash: instance.deploymentTransaction().hash };
      progress.steps[name] = step; save();
    }
    const tx = await ethers.provider.getTransaction(step.hash);
    if (!tx || tx.from.toLowerCase() !== signer.address.toLowerCase() || tx.to !== null || tx.data.toLowerCase() !== expected.data.toLowerCase()) throw Error(`${name}: saved transaction differs from this source/configuration. Stop and inspect the receipt.`);
    console.log(`${name}: waiting for ${step.hash}`);
    const receipt = await ethers.provider.waitForTransaction(step.hash, 2, 180000);
    if (!receipt) throw Error(`${name}: still pending. Run the same command later to resume; do not delete the progress file.`);
    if (receipt.status !== 1 || !receipt.contractAddress) throw Error(`${name}: transaction failed. Inspect the hash before removing only this failed step from the progress file.`);
    if (await ethers.provider.getCode(receipt.contractAddress) === '0x') throw Error(`${name}: missing runtime code.`);
    step.address = receipt.contractAddress; save();
    return ethers.getContractAt(name, step.address, signer);
  }
  let token;
  if (process.env.ASSET_ADDRESS) {
    if (!ethers.isAddress(process.env.ASSET_ADDRESS)) throw Error('Invalid ASSET_ADDRESS');
    token = new ethers.Contract(process.env.ASSET_ADDRESS, ['function decimals() view returns(uint8)', 'function symbol() view returns(string)'], signer);
    if (await token.decimals() !== 6n) throw Error('StepFund requires six decimal token units.');
  } else token = await deploy('TestUSD');
  const factory = await deploy('StepFundFactory', [token.target]);
  const researchVault = await deploy('ResearchVault', [token.target]);
  let aaveVault;
  if (process.env.AAVE_POOL || process.env.AAVE_ATOKEN) {
    if (!process.env.ASSET_ADDRESS) throw Error('Aave cannot use the custom TestUSD faucet token. Set its supported reserve as ASSET_ADDRESS.');
    if (!ethers.isAddress(process.env.AAVE_POOL || '') || !ethers.isAddress(process.env.AAVE_ATOKEN || '')) throw Error('Set both AAVE_POOL and AAVE_ATOKEN from the official address book for Sepolia.');
    aaveVault = await deploy('AaveV3Vault', [token.target, process.env.AAVE_POOL, process.env.AAVE_ATOKEN]);
  }
  const data = { chainId: 11155111, protocolVersion: 3, token: token.target, factory: factory.target, verifier: await factory.acceptanceVerifier(), researchVault: researchVault.target, ...(aaveVault ? { aaveVault: aaveVault.target, aavePool: process.env.AAVE_POOL, aaveAToken: process.env.AAVE_ATOKEN } : {}), customTestToken: !process.env.ASSET_ADDRESS, assetSymbol: await token.symbol(), deployer: signer.address, deployedAt: new Date().toISOString(), blockNumber: await ethers.provider.getBlockNumber(), compiler: require('solc').version() };
  fs.writeFileSync(path.join(folder, '11155111.json'), JSON.stringify(data, null, 2) + '\n');
  console.log(JSON.stringify(data, null, 2));
  console.log('Deployment confirmed. Next: npm run verify:sepolia; then rebuild the portable package to include this public connection record.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
