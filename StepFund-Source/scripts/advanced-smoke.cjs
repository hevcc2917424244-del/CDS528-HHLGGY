// Isolated browser contexts + an EIP-1193 test adapter. Real transactions and
// PLONK verification on local Ethereum; never a real MetaMask/public-chain test.
const { chromium } = require('playwright');
const { JsonRpcProvider, ContractFactory, Contract, keccak256 } = require('ethers');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const base = process.env.STEPFUND_URL || 'http://127.0.0.1:5294';
const rpc = new JsonRpcProvider(process.env.STEPFUND_TEST_RPC || 'http://127.0.0.1:18545');
async function main() {
  assert.equal((await rpc.getNetwork()).chainId, 31337n);
  const accounts = await rpc.send('eth_accounts', []);
  const signers = await Promise.all(accounts.slice(0, 5).map(a => rpc.getSigner(a)));
  const artifact = name => JSON.parse(fs.readFileSync(`public/contracts/${name}.json`));
  async function deploy(name, args = []) { const a = artifact(name); const c = await new ContractFactory(a.abi, a.bytecode, signers[0]).deploy(...args); await c.waitForDeployment(); return c; }
  const token = await deploy('TestUSD'); const factory = await deploy('StepFundFactory', [token.target]);
  const vault = await deploy('ResearchVault', [token.target]);
  for (const signer of signers.slice(0, 3)) await (await token.connect(signer).faucet()).wait();
  const browser = await chromium.launch({ headless: true });
  const errors = [], checks = [];
  let creator;
  async function connect(account) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(e.message));
    await page.exposeFunction('testRpc', ({ method, params = [] }) => ['eth_accounts', 'eth_requestAccounts'].includes(method) ? [account] : rpc.send(method, params));
    await page.addInitScript(() => { window.ethereum = { request: args => window.testRpc(args), on: () => {}, removeListener: () => {} }; });
    await page.goto(base); await page.locator('[data-ready=true]').waitFor();
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
    await page.getByLabel('Factory contract address', { exact: true }).fill(factory.target);
    await page.getByRole('dialog').getByRole('button', { name: 'Connect wallet', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    return page;
  }
  try {
    creator = await connect(accounts[0]);
    const button = (p, name) => p.getByRole('button', { name, exact: true });
    await button(creator, 'Create project').first().click();
    await creator.getByLabel('Project title', { exact: true }).fill('Private quality review');
    await creator.getByLabel('What will this project deliver?', { exact: true }).fill('Independent quality score, inclusive range 80 through 100. Reward-funded research treasury.');
    await button(creator, 'Remove milestone 3').click(); await button(creator, 'Remove milestone 2').click();
    await creator.getByLabel('Milestone title 1', { exact: true }).fill('Quality score');
    await creator.getByLabel('Budget 1', { exact: true }).fill('100');
    await creator.getByLabel('Use an ERC4626 treasury vault', { exact: true }).check();
    await creator.getByLabel('Vault address', { exact: true }).fill(vault.target);
    await creator.getByLabel('Require a private range proof for every milestone', { exact: true }).check();
    assert.equal((await creator.getByLabel('Factory-pinned acceptance verifier').inputValue()).toLowerCase(), (await factory.acceptanceVerifier()).toLowerCase());
    await creator.getByLabel('Independent assessor wallet', { exact: true }).fill(accounts[3]);
    await button(creator, 'Review project').click();
    await creator.locator('.summary-panel').getByRole('button', { name: 'Create project', exact: true }).click();
    await button(creator, 'Confirm').click();
    await creator.getByRole('heading', { name: 'Private quality review', exact: true }).waitFor({ timeout: 45000 });
    const c = new Contract(await factory.campaignAt(0), artifact('MilestoneCampaign').abi, signers[0]);
    assert.equal((await c.verifier()).toLowerCase(), (await factory.acceptanceVerifier()).toLowerCase());
    checks.push('Creates an immutable vault + factory-pinned ZK campaign through the bilingual UI');
    for (const [index, n] of [[1,60n],[2,40n]]) { await (await token.connect(signers[index]).approve(c.target, n * 1000000n)).wait(); await (await c.connect(signers[index]).contribute(n * 1000000n)).wait(); }
    await button(creator, 'Explore projects').click(); await button(creator, 'Refresh').click(); await button(creator, 'View project').click();
    await creator.getByLabel('Deposit amount (tUSD)', { exact: true }).fill('10');
    await button(creator, 'Deposit into vault').click(); await button(creator, 'Confirm').click();
    await creator.waitForFunction(() => document.querySelector('.advanced-panel')?.textContent.includes('10 tUSD'));
    assert.equal(await c.treasuryPrincipal(), 10000000n);
    await (await token.transfer(vault.target, 2000000n)).wait();
    await button(creator, 'Activate project').click();
    await button(creator, 'Generate proof locally').waitFor();
    assert.equal(await c.status(), 1n); assert.ok(await c.yieldPool() > 1900000n);
    checks.push('Deposits real project principal, redeems before activation and exposes externally funded yield');
    // Create private encrypted evidence through the UI, then reopen it locally.
    await creator.getByText('Encrypt evidence / open a private file', { exact: true }).click();
    await button(creator, 'Generate file key').click();
    const key = await creator.getByLabel('Private file key (64 hex characters)', { exact: true }).inputValue();
    const download = creator.waitForEvent('download');
    await creator.getByLabel('Encrypt an original file', { exact: true }).setInputFiles({ name: 'private-quality.txt', mimeType: 'text/plain', buffer: Buffer.from('Private quality score: 90') });
    const encrypted = await download; const bytes = fs.readFileSync(await encrypted.path());
    const digest = keccak256(bytes);
    assert.equal(await creator.getByLabel('Committed ciphertext hash', { exact: true }).inputValue(), digest);
    await creator.getByLabel('Verify & decrypt downloaded .sfe', { exact: true }).setInputFiles({ name: 'private-evidence.sfe', mimeType: 'application/octet-stream', buffer: bytes });
    await creator.getByText('Ciphertext hash and authentication passed.', { exact: true }).waitFor();
    assert.match(await creator.locator('.ipfs-preview pre').innerText(), /90/); assert.equal(key.length,64);
    checks.push('Encrypts actual evidence bytes with AES-GCM, hash-checks ciphertext and previews the decrypted file');
    await creator.getByLabel('Evidence file hash (Keccak-256)', { exact: true }).fill(digest);
    await creator.getByLabel('Private measurement', { exact: true }).fill('90');
    await button(creator, 'Generate a new salt').click();
    const salt = await creator.getByLabel('Private random salt', { exact: true }).inputValue();
    await creator.getByLabel('Published evidence URL', { exact: true }).fill('https://example.com/private-evidence.sfe');
    await button(creator, 'Generate proof locally').click();
    await creator.getByText('Proof verified locally. The private measurement is not included in the transaction.', { exact: true }).waitFor({ timeout: 120000 });
    assert.equal(await button(creator,'Submit proof & open vote').isEnabled(), false);
    const assessor = await connect(accounts[3]); await button(assessor, 'View project').click();
    await assessor.getByLabel('Evidence file hash (Keccak-256)', { exact: true }).fill(digest);
    await assessor.getByLabel('Private measurement', { exact: true }).fill('90');
    await assessor.getByLabel('Private random salt', { exact: true }).fill(salt);
    await button(assessor, 'Attest reviewed evidence').click(); await button(assessor, 'Confirm').click();
    await assessor.getByText('Milestone 1: 80 ≤ private value ≤ 100 · Assessor attested', { exact: true }).waitFor();
    // Navigating back refreshes chain state. Recreate proof on the same device;
    // the private salt is intentionally not persisted across panel unmounts.
    await button(creator, 'Explore projects').click(); await button(creator, 'Refresh').click(); await button(creator, 'View project').click();
    await creator.getByLabel('Evidence file hash (Keccak-256)', { exact: true }).fill(digest);
    await creator.getByLabel('Private measurement', { exact: true }).fill('90');
    await creator.getByLabel('Private random salt', { exact: true }).fill(salt);
    await creator.getByLabel('Published evidence URL', { exact: true }).fill('https://example.com/private-evidence.sfe');
    await button(creator, 'Generate proof locally').click();
    await creator.getByText('Proof verified locally. The private measurement is not included in the transaction.', { exact: true }).waitFor({ timeout: 120000 });
    await button(creator, 'Submit proof & open vote').click(); await button(creator, 'Confirm').click();
    await creator.getByText('Milestone 1: 80 ≤ private value ≤ 100 · Proof verified on chain', { exact: true }).waitFor({ timeout: 45000 });
    assert.equal(await c.privacyVerified(0), true); assert.equal((await c.getStages())[0].state,1n);
    checks.push('Browser worker creates a real PLONK proof; a different assessor attests and the chain verifies it before voting');
    await creator.screenshot({ path: 'reports/browser/advanced-en.png', fullPage: true });
    await button(creator, 'Switch to Chinese').click();
    await creator.getByRole('heading', { name: '证明约定条件', exact: true }).waitFor();
    await creator.setViewportSize({ width: 390, height: 844 });
    assert.equal(await creator.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await creator.screenshot({ path: 'reports/browser/advanced-zh-mobile.png', fullPage: true });
    checks.push('Advanced project renders in English and Chinese without 390px horizontal overflow');
    assert.deepEqual(errors, []);
    fs.writeFileSync('reports/browser/advanced.json', JSON.stringify({ base, chain:31337, method:'Local Ethereum + injected test adapter; example evidence URI, not a live upload', checks, errors, at:new Date().toISOString() },null,2));
    console.log(JSON.stringify({ checks, errors },null,2));
  } catch(e) { if(creator) { await creator.screenshot({path:'reports/browser/advanced-failure.png',fullPage:true}); console.error((await creator.locator('body').innerText()).slice(-2400)); } throw e; }
  finally { await browser.close(); rpc.destroy(); }
}
main().catch(e=>{ console.error(e); process.exitCode=1; });
