const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const DAY = 86400;
describe("StepFund v2 governance and bond invariants", function () {
  let token, factory, c, owner, a, b, d, reviewer, now;
  const jump = async (t) => {
    await network.provider.send("evm_setNextBlockTimestamp", [Number(t)]);
    await network.provider.send("evm_mine");
  };
  async function create(budgets = [1000], signer = owner) {
    await token.connect(signer).approve(factory.target, 1000000);
    await factory.connect(signer).createCampaign([
      "Governance",
      "Boundary tests",
      0,
      now + DAY,
      DAY,
      budgets.map((_, i) => `Stage ${i}`),
      budgets,
      budgets.map((_, i) => now + (4 + 4 * i) * DAY),
    ]);
    return ethers.getContractAt(
      "MilestoneCampaign",
      await factory.campaignAt((await factory.campaignCount()) - 1n),
    );
  }
  async function contribute(signer, value) {
    await token.connect(signer).approve(c.target, value);
    await c.connect(signer).contribute(value);
  }
  async function fund(shares = [600, 100, 300]) {
    for (const [i, s] of [a, b, d].entries()) await contribute(s, shares[i]);
    await c.finalizeFunding();
  }
  const evidence = () =>
    c.submitEvidence("https://example.com/file", ethers.id("file"));
  async function settle() {
    await jump(
      (await c.getStages())[Number(await c.currentStage())].votingEnds,
    );
    await c.settleStage();
  }
  async function conserved() {
    expect(await token.balanceOf(c.target)).eq(
      (await c.totalRaised()) -
        (await c.withdrawn()) -
        (await c.totalRefunded()) +
        (await c.bondRequired()) -
        (await c.bondReturned()) -
        (await c.bondDistributed()),
    );
  }
  beforeEach(async () => {
    [owner, a, b, d, reviewer] = await ethers.getSigners();
    token = await ethers.deployContract("TestUSD");
    factory = await ethers.deployContract("StepFundFactory", [token.target]);
    for (const s of [owner, a, b, d]) await token.connect(s).faucet();
    now = (await ethers.provider.getBlock("latest")).timestamp;
    c = await create();
  });
  it("atomically collects exactly 5%, excludes it from votes, and rolls back unfunded creation", async () => {
    expect(await factory.protocolVersion()).eq(3);
    expect(await c.bondRequired()).eq(50);
    expect(await c.bondLocked()).eq(50);
    expect(await c.totalRaised()).eq(0);
    expect(await c.votingWeight(0, owner.address)).eq(0);
    expect(await c.bondFunded()).eq(true);
    await expect(c.initializeBond()).revertedWithCustomError(c, "Unauthorized");
    await token.approve(factory.target, 0);
    const count = await factory.campaignCount();
    await expect(
      factory.createCampaign([
        "Unfunded",
        "Must revert",
        0,
        now + DAY,
        DAY,
        ["One"],
        [1000],
        [now + 4 * DAY],
      ]),
    ).reverted;
    expect(await factory.campaignCount()).eq(count);
    await conserved();
  });
  it("rounds the bond upward even for a one-unit campaign", async () => {
    c = await create([1]);
    expect(await c.bondRequired()).eq(1);
    await conserved();
  });
  it("rejects 60% yes with only 60% turnout and returns the bond", async () => {
    await fund();
    await evidence();
    await c.connect(a).vote(true);
    await settle();
    expect(await c.status()).eq(2);
    expect(await c.bondCredit()).eq(50);
    expect(await c.bondRefundPool()).eq(0);
    await c.withdrawBond();
    await expect(c.withdrawBond()).revertedWithCustomError(c, "NothingToClaim");
    await conserved();
  });
  it("passes exactly 60% yes and 70% turnout, including no votes in turnout", async () => {
    await fund();
    await evidence();
    await c.connect(a).vote(true);
    await c.connect(b).vote(false);
    await settle();
    expect(await c.status()).eq(3);
    expect(await c.released()).eq(1000);
    expect(await c.bondCredit()).eq(50);
    await c.withdrawCreator();
    await c.withdrawBond();
    await conserved();
    expect(await token.balanceOf(c.target)).eq(0);
  });
  it("fails one base unit below quorum without slashing", async () => {
    await fund([600, 99, 301]);
    await evidence();
    await c.connect(a).vote(true);
    await c.connect(b).vote(false);
    await settle();
    expect(await c.status()).eq(2);
    expect(await c.bondCredit()).eq(50);
  });
  it("fails one base unit below approval at quorum and allocates the bond", async () => {
    await fund([599, 101, 300]);
    await evidence();
    await c.connect(a).vote(true);
    await c.connect(b).vote(false);
    await settle();
    expect(await c.status()).eq(2);
    expect(await c.bondRefundPool()).eq(50);
    expect(await c.bondCredit()).eq(0);
    for (const signer of [b, d, a]) {
      const principal = await c.claimableRefund(signer.address),
        bonus = await c.claimableBondShare(signer.address),
        before = await token.balanceOf(signer.address);
      await c.connect(signer).claimRefund();
      expect((await token.balanceOf(signer.address)) - before).eq(
        principal + bonus,
      );
      await conserved();
    }
    expect(await c.totalRefunded()).eq(1000);
    expect(await c.bondDistributed()).eq(50);
    expect(await token.balanceOf(c.target)).eq(0);
  });
  it("returns the bond for empty/failed fundraising and rejects another account's withdrawal", async () => {
    await jump(await c.fundingEnds());
    await c.finalizeFunding();
    expect(await c.bondCredit()).eq(50);
    await expect(c.connect(a).withdrawBond()).revertedWithCustomError(
      c,
      "Unauthorized",
    );
    await c.withdrawBond();
    await conserved();
  });
  it("slashes an objective missed evidence deadline and pays compensation once", async () => {
    await fund();
    await jump((await c.getStages())[0].due);
    await c.expireStage();
    expect(await c.bondRefundPool()).eq(50);
    expect(await c.claimableBondShare(a.address)).eq(30);
    await c.connect(a).claimRefund();
    expect(await c.claimableBondShare(a.address)).eq(0);
    await expect(c.connect(a).claimRefund()).revertedWithCustomError(
      c,
      "NothingToClaim",
    );
    await expect(c.withdrawBond()).revertedWithCustomError(c, "NothingToClaim");
    await conserved();
  });
  it("delegates to a non-contributor without transferring refund ownership", async () => {
    await fund();
    await c.connect(a).delegateVote(reviewer.address);
    expect(await c.votingWeight(0, a.address)).eq(0);
    expect(await c.votingWeight(0, reviewer.address)).eq(600);
    await evidence();
    await c.connect(reviewer).vote(false);
    await c.connect(b).vote(false);
    expect(await c.hasParticipated(0, a.address)).eq(true);
    await expect(c.connect(a).vote(true)).revertedWithCustomError(
      c,
      "NotContributor",
    );
    await expect(c.connect(reviewer).vote(true)).revertedWithCustomError(
      c,
      "AlreadyVoted",
    );
    await settle();
    expect(await c.claimableRefund(reviewer.address)).eq(0);
    expect(await c.claimableRefund(a.address)).eq(600);
    await conserved();
  });
  it("combines own and incoming weight exactly once and blocks chains/cycles/self-delegation", async () => {
    await fund();
    await c.connect(a).delegateVote(b.address);
    expect(await c.votingWeight(0, b.address)).eq(700);
    for (const [signer, target] of [
      [b, d.address],
      [b, a.address],
      [d, a.address],
      [d, d.address],
    ])
      await expect(
        c.connect(signer).delegateVote(target),
      ).revertedWithCustomError(c, "InvalidDelegate");
    await expect(
      c.connect(reviewer).delegateVote(b.address),
    ).revertedWithCustomError(c, "NotContributor");
    await evidence();
    await c.connect(b).vote(true);
    await c.connect(d).vote(false);
    const stage = (await c.getStages())[0];
    expect(stage.yes + stage.no).eq(await c.totalRaised());
  });
  it("updates incoming weight for later contributions and supports reassignment/revocation", async () => {
    await contribute(a, 100);
    await c.connect(a).delegateVote(reviewer.address);
    await contribute(a, 200);
    expect(await c.delegatedWeight(0, reviewer.address)).eq(300);
    await c.connect(a).delegateVote(b.address);
    expect(await c.delegatedWeight(0, reviewer.address)).eq(0);
    await c.connect(a).delegateVote(ethers.ZeroAddress);
    expect(await c.votingWeight(0, a.address)).eq(300);
    expect(await c.delegatedWeight(0, b.address)).eq(0);
  });
  it("freezes delegation at vote opening and resets authority at the next milestone", async () => {
    c = await create([500, 500]);
    await fund();
    await c.connect(a).delegateVote(reviewer.address);
    await evidence();
    await expect(
      c.connect(a).delegateVote(ethers.ZeroAddress),
    ).revertedWithCustomError(c, "WrongState");
    await c.connect(reviewer).vote(true);
    await c.connect(b).vote(false);
    await settle();
    expect(await c.currentStage()).eq(1);
    expect(await c.votingWeight(1, reviewer.address)).eq(0);
    expect(await c.votingWeight(1, a.address)).eq(600);
    expect(await c.bondLocked()).eq(50);
    await conserved();
  });
  it("prevents delegation after the evidence deadline or after project termination", async () => {
    await fund();
    await jump((await c.getStages())[0].due);
    await expect(
      c.connect(a).delegateVote(reviewer.address),
    ).revertedWithCustomError(c, "Expired");
    await c.expireStage();
    await expect(
      c.connect(a).delegateVote(reviewer.address),
    ).revertedWithCustomError(c, "WrongState");
  });
  it("does not reward splitting a fixed stake across wallets", async () => {
    await fund([300, 300, 400]);
    await c.connect(a).delegateVote(reviewer.address);
    await c.connect(b).delegateVote(reviewer.address);
    expect(await c.votingWeight(0, reviewer.address)).eq(600);
    await evidence();
    await c.connect(reviewer).vote(true);
    await settle();
    expect(await c.status()).eq(2); // still 60%, below quorum; two identities did not make extra weight.
  });
});
