const { expect } = require('chai');
const { ethers, network, artifacts } = require('hardhat');
const snarkjs = require('snarkjs');
const { poseidon3 } = require('poseidon-lite');
const fs = require('node:fs');
const U = 1000000n, DAY = 86400;
const zero = ethers.ZeroAddress;
async function fixture({ privacy = false, vaultKind = 'StrategyTestVault' } = {}) {
  const [creator, backer, other, assessor, stranger] = await ethers.getSigners();
  const token = await ethers.deployContract('TestUSD');
  for (const person of [creator, backer, other, stranger]) await token.connect(person).faucet();
  const factory = await ethers.deployContract('StepFundFactory', [token.target]);
  const vault = await ethers.deployContract(vaultKind, [token.target]);
  const verifier = privacy ? await ethers.getContractAt('AcceptanceVerifier', await factory.acceptanceVerifier()) : null;
  const now = (await ethers.provider.getBlock('latest')).timestamp;
  const config = [vault.target, verifier?.target || zero, privacy ? assessor.address : zero, privacy ? [80] : [], privacy ? [100] : []];
  await token.approve(factory.target, 5n * U);
  await factory.createAdvancedCampaign(['Advanced', 'Integer quality score from 80 through 100', 2, now + DAY, 3600, ['Delivery'], [100n * U], [now + 4 * DAY]], config);
  const c = await ethers.getContractAt('MilestoneCampaign', await factory.campaignAt(0));
  for (const [person, value] of [[backer, 60n * U], [other, 40n * U]]) { await token.connect(person).approve(c.target, value); await c.connect(person).contribute(value); }
  return { creator, backer, other, assessor, stranger, token, factory, vault, verifier, c, now };
}
async function advance(time) { await network.provider.send('evm_setNextBlockTimestamp', [time]); await network.provider.send('evm_mine'); }
describe('StepFund treasury principal, rewards and liquidity recovery', function () {
  it('rejects hostile vault callbacks during deposit and redemption without losing principal', async () => {
    const {c,vault,token} = await fixture();
    await vault.setCallback(c.target,c.interface.encodeFunctionData('finalizeFunding'));
    await c.investTreasury(20n * U,1);
    expect(await vault.callbackSucceeded()).to.equal(false); expect(await c.status()).to.equal(0);
    await c.finalizeFunding();
    expect(await vault.callbackSucceeded()).to.equal(false); expect(await c.status()).to.equal(1);
    expect(await token.balanceOf(c.target)).to.equal(105n * U);
  });
  it('opts in atomically, excludes the bond, enforces the cap and share slippage', async () => {
    const { c, vault, token, stranger } = await fixture();
    await expect(c.configureAdvanced([zero, zero, zero, [], []])).to.be.revertedWithCustomError(c, 'Unauthorized');
    await expect(c.investTreasury(20n * U + 1n, 1)).to.be.revertedWithCustomError(c, 'InvalidAmount');
    await expect(c.investTreasury(U, 0)).to.be.revertedWithCustomError(c, 'InvalidAmount');
    const shares = await vault.previewDeposit(20n * U);
    await expect(c.investTreasury(20n * U, shares + 1n)).to.be.revertedWithCustomError(c, 'UnsupportedToken');
    await c.connect(stranger).investTreasury(20n * U, shares);
    expect(await c.treasuryPrincipal()).to.equal(20n * U);
    expect(await token.balanceOf(c.target)).to.equal(85n * U);
    expect(await token.allowance(c.target, vault.target)).to.equal(0);
    await expect(c.investTreasury(1, 1)).to.be.revertedWithCustomError(c, 'InvalidAmount');
  });
  it('redeems before activation and distributes only funded yield with exact rounding', async () => {
    const { c, vault, token, backer, other, stranger } = await fixture({ vaultKind: 'ResearchVault' });
    await c.investTreasury(20n * U, 1);
    await token.connect(stranger).transfer(vault.target, 7n * U + 3n);
    await expect(c.connect(backer).claimYield()).to.be.revertedWithCustomError(c, 'NothingToClaim');
    await c.finalizeFunding();
    expect(await c.status()).to.equal(1); expect(await c.treasuryPrincipal()).to.equal(0);
    const pool = await c.yieldPool(); expect(pool).to.be.greaterThan(6n * U);
    await c.connect(other).claimYield(); await c.connect(backer).claimYield();
    expect(await c.yieldDistributed()).to.equal(pool);
    expect(await token.balanceOf(c.target)).to.equal(105n * U);
    await expect(c.connect(backer).claimYield()).to.be.revertedWithCustomError(c, 'NothingToClaim');
    await expect(c.connect(stranger).claimYield()).to.be.revertedWithCustomError(c, 'NothingToClaim');
  });
  it('loss cancels activation, preserves the bond and proportionally refunds available principal', async () => {
    const { c, vault, token, backer, other } = await fixture();
    await c.investTreasury(20n * U, 1); await vault.simulateLoss(5n * U);
    await c.finalizeFunding();
    expect(await c.status()).to.equal(2); expect(await c.treasuryLoss()).to.be.greaterThanOrEqual(5n * U);
    expect(await c.bondCredit()).to.equal(5n * U); expect(await c.bondRefundPool()).to.equal(0);
    expect(await c.refundPool()).to.equal(100n * U - await c.treasuryLoss());
    await c.connect(backer).claimRefund(); await c.withdrawBond(); await c.connect(other).claimRefund();
    expect(await token.balanceOf(c.target)).to.equal(0);
  });
  it('a liquidity outage rolls back finalization; delayed in-kind rescue cannot lock the liquid 80%', async () => {
    const { c, vault, token, backer, other, now } = await fixture();
    await c.investTreasury(20n * U, 1); await vault.setBlocked(true);
    await expect(c.finalizeFunding()).to.be.revertedWith('Test liquidity outage');
    expect(await c.status()).to.equal(0); expect(await c.treasuryPrincipal()).to.equal(20n * U);
    await expect(c.rescueTreasury()).to.be.revertedWithCustomError(c, 'TooEarly');
    await advance(now + 8 * DAY); await c.rescueTreasury();
    expect(await c.refundPool()).to.equal(80n * U);
    const shares = await c.rescueShares();
    for (const signer of [backer, other]) { await c.connect(signer).claimRefund(); await c.connect(signer).claimYield(); }
    await c.withdrawBond();
    expect(await token.balanceOf(c.target)).to.equal(0); expect(await c.sharesDistributed()).to.equal(shares);
    expect(await vault.balanceOf(backer.address) + await vault.balanceOf(other.address)).to.equal(shares);
    await vault.setBlocked(false);
    await vault.connect(backer).redeem(await vault.balanceOf(backer.address), backer.address, backer.address);
    await expect(c.rescueTreasury()).to.be.revertedWithCustomError(c, 'WrongState');
  });
  it('validates configuration and rejects investment after finalization or while paused', async () => {
    const { c, vault, factory, token, now } = await fixture();
    await c.setFundingPaused(true); await expect(c.investTreasury(U, 1)).to.be.revertedWithCustomError(c, 'EnforcedPause');
    await c.setFundingPaused(false); await c.finalizeFunding();
    await expect(c.investTreasury(U, 1)).to.be.revertedWithCustomError(c, 'WrongState');
    const wrong = await ethers.deployContract('TestUSD'); const wrongVault = await ethers.deployContract('ResearchVault', [wrong.target]);
    await token.approve(factory.target, U);
    await expect(factory.createAdvancedCampaign(['Bad', 'Wrong asset', 0, now + DAY, 3600, ['One'], [U], [now + 3 * DAY]], [wrongVault.target, zero, zero, [], []])).to.be.revertedWithCustomError(c, 'InvalidConfig');
    expect(await vault.asset()).to.equal(token.target);
  });
});
describe('Aave V3 adapter (explicitly mocked pool, not a public-fork result)', function () {
  it('supplies and redeems the supported reserve, including externally funded interest', async () => {
    const [owner, donor] = await ethers.getSigners();
    const token = await ethers.deployContract('TestUSD'); await token.faucet(); await token.connect(donor).faucet();
    const pool = await ethers.deployContract('AaveTestPool', [token.target]);
    const aToken = await pool.aToken();
    const vault = await ethers.deployContract('AaveV3Vault', [token.target, pool.target, aToken]);
    await token.approve(vault.target, 100n * U); await vault.deposit(100n * U, owner.address);
    expect(await token.balanceOf(vault.target)).to.equal(0); expect(await token.balanceOf(aToken)).to.equal(100n * U);
    expect(await token.allowance(vault.target, pool.target)).to.equal(0);
    await token.connect(donor).approve(pool.target, 5n * U); await pool.connect(donor).fundedReward(vault.target, 5n * U);
    expect(await vault.totalAssets()).to.equal(105n * U);
    expect(await vault.maxWithdraw(owner.address)).to.be.greaterThan(104n * U);
    await pool.setBlocked(true); await expect(vault.redeem(await vault.balanceOf(owner.address), owner.address, owner.address)).to.be.reverted;
    await pool.setBlocked(false); await vault.redeem(await vault.balanceOf(owner.address), owner.address, owner.address);
    expect(await token.balanceOf(owner.address)).to.be.greaterThan(1004n * U);
    const other = await ethers.deployContract('TestUSD');
    await expect(ethers.deployContract('AaveV3Vault', [other.target, pool.target, aToken])).to.be.revertedWith('Reserve mismatch');
  });
});
describe('Real PLONK acceptance proof and on-chain domain binding', function () {
  this.timeout(180000);
  it('checks private range, assessor responsibility, tampering, replay and the normal voting gates', async () => {
    const { c, token, creator, backer, other, assessor, stranger, verifier } = await fixture({ privacy: true });
    await c.finalizeFunding();
    const digest = ethers.keccak256(ethers.toUtf8Bytes('encrypted deliverable'));
    const context = await c.privacyContext(0, digest);
    const input = { value: '90', salt: '987654321012345678901234567890', minimum: '80', maximum: '100', context: context.toString() };
    const { proof, publicSignals } = await snarkjs.plonk.fullProve(input, 'public/zk/acceptance.wasm', 'public/zk/acceptance.zkey');
    expect(await snarkjs.plonk.verify(JSON.parse(fs.readFileSync('public/zk/verification-key.json')), publicSignals, proof)).to.equal(true);
    const calldata = await snarkjs.plonk.exportSolidityCallData(proof, publicSignals);
    const [solidityProof, signals] = JSON.parse('[' + calldata.replace(/\]\s*\[/, '],[') + ']');
    expect(BigInt(signals[0])).to.equal(poseidon3([90n, BigInt(input.salt), context]));
    expect(await verifier.verifyProof(solidityProof, signals)).to.equal(true);
    const badProof = [...solidityProof]; badProof[0] = '0';
    expect(await verifier.verifyProof(badProof, signals)).to.equal(false);
    await expect(c.submitEvidence('https://example.com/encrypted', digest)).to.be.revertedWithCustomError(c, 'InvalidProof');
    await expect(c.submitPrivateEvidence('https://example.com/encrypted', digest, solidityProof, signals)).to.be.revertedWithCustomError(c, 'InvalidProof');
    await expect(c.connect(stranger).attestPrivate(0, signals[0], digest)).to.be.revertedWithCustomError(c, 'Unauthorized');
    await c.connect(assessor).attestPrivate(0, signals[0], digest);
    await expect(c.connect(other).submitPrivateEvidence('https://example.com/encrypted', digest, solidityProof, signals)).to.be.revertedWithCustomError(c, 'Unauthorized');
    for (const index of [0, 1, 2, 3]) {
      const tampered = [...signals]; tampered[index] = (BigInt(tampered[index]) + 1n).toString();
      await expect(c.submitPrivateEvidence('https://example.com/encrypted', digest, solidityProof, tampered)).to.be.revertedWithCustomError(c, 'InvalidProof');
    }
    await expect(c.submitPrivateEvidence('https://example.com/encrypted', ethers.id('another file'), solidityProof, signals)).to.be.revertedWithCustomError(c, 'InvalidProof');
    await expect(c.submitPrivateEvidence('https://example.com/encrypted', digest, badProof, signals)).to.be.revertedWithCustomError(c, 'InvalidProof');
    await c.submitPrivateEvidence('https://example.com/encrypted', digest, solidityProof, signals);
    expect(await c.privacyVerified(0)).to.equal(true); expect(await c.creatorCredit()).to.equal(0);
    await expect(c.submitPrivateEvidence('https://example.com/encrypted', digest, solidityProof, signals)).to.be.revertedWithCustomError(c, 'WrongState');
    await c.connect(backer).vote(true); await c.connect(other).vote(false);
    await advance(Number((await c.getStages())[0].votingEnds)); await c.settleStage();
    expect(await c.status()).to.equal(3); await c.connect(creator).withdrawCreator(); await c.withdrawBond();
    expect(await token.balanceOf(c.target)).to.equal(0);
    let rejected = false;
    try { await snarkjs.wtns.calculate({ ...input, value: '79' }, 'public/zk/acceptance.wasm', { type: 'mem' }); } catch { rejected = true; }
    expect(rejected).to.equal(true);
  });
  it('keeps all shipped contracts deployable under public Ethereum size limits', async function () {
    // Instrumentation deliberately adds counters and increases bytecode size.
    // The production size assertion still runs in npm test and bundle checks.
    if (require('hardhat').__SOLIDITY_COVERAGE_RUNNING) return this.skip();
    for (const name of ['StepFundFactory', 'MilestoneCampaign', 'AcceptanceVerifier', 'AaveV3Vault', 'ResearchVault']) {
      const a = await artifacts.readArtifact(name);
      expect((a.deployedBytecode.length - 2) / 2, name).to.be.at.most(24576);
      expect((a.bytecode.length - 2) / 2, name).to.be.at.most(49152);
    }
  });
});
