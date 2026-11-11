const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const U = 1_000_000n,
  DAY = 86400;
describe("StepFund escrow and lifecycle", function () {
  let token, factory, c, owner, alice, bob, carol, outsider, now;
  const jump = async (t) => {
    await network.provider.send("evm_setNextBlockTimestamp", [Number(t)]);
    await network.provider.send("evm_mine");
  };
  const contribute = async (signer, n) => {
    await token.connect(signer).approve(c.target, n);
    await c.connect(signer).contribute(n);
  };
  const fund = async () => {
    await contribute(alice, 600n * U);
    await contribute(bob, 400n * U);
    await c.finalizeFunding();
  };
  const evidence = async () =>
    c.submitEvidence(
      "https://example.com/evidence",
      ethers.id("file contents"),
    );
  const settle = async () => {
    const s = (await c.getStages())[Number(await c.currentStage())];
    await jump(s.votingEnds);
    await c.connect(outsider).settleStage();
  };
  beforeEach(async () => {
    [owner, alice, bob, carol, outsider] = await ethers.getSigners();
    token = await ethers.deployContract("TestUSD");
    factory = await ethers.deployContract("StepFundFactory", [token.target]);
    await token.faucet();
    await token.approve(factory.target, ethers.MaxUint256);
    now = (await ethers.provider.getBlock("latest")).timestamp;
    await factory.createCampaign([
      "Project",
      "A testable community project",
      0,
      now + 5 * DAY,
      DAY,
      ["Prototype", "Build", "Launch"],
      [200n * U, 300n * U, 500n * U],
      [now + 8 * DAY, now + 12 * DAY, now + 16 * DAY],
    ]);
    c = await ethers.getContractAt(
      "MilestoneCampaign",
      await factory.campaignAt(0),
    );
    for (const s of [alice, bob, carol]) await token.connect(s).faucet();
  });
  it("registers immutable creator, token, budgets, goal and deadlines", async () => {
    expect(await factory.campaignCount()).eq(1);
    expect(await factory.isCampaign(c.target)).eq(true);
    expect(await c.creator()).eq(owner.address);
    expect(await c.asset()).eq(token.target);
    expect(await c.goal()).eq(1000n * U);
    expect(await c.stageCount()).eq(3);
    expect(await c.status()).eq(0);
  });
  it("uses a six-decimal faucet with a per-address cooldown", async () => {
    expect(await token.decimals()).eq(6);
    expect(await token.balanceOf(alice.address)).eq(1000n * U);
    await expect(token.connect(alice).faucet()).revertedWithCustomError(
      token,
      "FaucetCooldown",
    );
    await jump(await token.nextFaucet(alice.address));
    await token.connect(alice).faucet();
    expect(await token.balanceOf(alice.address)).eq(2000n * U);
  });
  it("escrows exact contributions and counts distinct contributors", async () => {
    await contribute(alice, 100n * U);
    await contribute(alice, 50n * U);
    expect(await c.contributorCount()).eq(1);
    expect(await c.contributions(alice.address)).eq(150n * U);
    expect(await token.balanceOf(c.target)).eq(200n * U);
  });
  it("rejects zero, over-goal and unapproved contributions", async () => {
    await expect(c.connect(alice).contribute(0)).revertedWithCustomError(
      c,
      "InvalidAmount",
    );
    await expect(
      c.connect(alice).contribute(1001n * U),
    ).revertedWithCustomError(c, "InvalidAmount");
    await expect(c.connect(alice).contribute(U)).reverted;
  });
  it("cannot withdraw escrow before an approved milestone", async () => {
    await contribute(alice, 600n * U);
    await expect(c.withdrawCreator()).revertedWithCustomError(
      c,
      "NothingToClaim",
    );
    await expect(c.connect(alice).claimRefund()).revertedWithCustomError(
      c,
      "WrongState",
    );
  });
  it("rejects early finalization and closes contributions at the deadline", async () => {
    await expect(c.finalizeFunding()).revertedWithCustomError(c, "TooEarly");
    await jump(await c.fundingEnds());
    await expect(c.connect(alice).contribute(U)).revertedWithCustomError(
      c,
      "Expired",
    );
  });
  it("allows anyone to activate a fully funded campaign before its deadline", async () => {
    await contribute(alice, 1000n * U);
    await c.connect(outsider).finalizeFunding();
    expect(await c.status()).eq(1);
    await expect(c.finalizeFunding()).revertedWithCustomError(c, "WrongState");
    await expect(c.connect(bob).contribute(U)).revertedWithCustomError(
      c,
      "WrongState",
    );
  });
  it("refunds unsuccessful funding without creator cooperation", async () => {
    await contribute(alice, 123n * U);
    await contribute(bob, 456n * U);
    await jump(await c.fundingEnds());
    await c.connect(outsider).finalizeFunding();
    expect(await c.status()).eq(2);
    await c.connect(alice).claimRefund();
    await c.connect(bob).claimRefund();
    if ((await c.bondCredit()) > 0n) await c.withdrawBond();
    expect(await token.balanceOf(c.target)).eq(0);
    expect(await token.balanceOf(alice.address)).eq(1000n * U);
    expect(await c.totalRefunded()).eq(579n * U);
  });
  it("finalizes an empty campaign safely", async () => {
    await jump(await c.fundingEnds());
    await c.finalizeFunding();
    expect(await c.refundPool()).eq(0);
    expect(await c.claimableRefund(alice.address)).eq(0);
    await expect(c.connect(alice).claimRefund()).revertedWithCustomError(
      c,
      "NothingToClaim",
    );
  });
  it("requires creator evidence with a valid URI scheme and nonzero digest", async () => {
    await fund();
    await expect(
      c
        .connect(alice)
        .submitEvidence("https://example.com", ethers.id("proof")),
    ).revertedWithCustomError(c, "Unauthorized");
    await expect(
      c.submitEvidence("javascript:bad", ethers.id("proof")),
    ).revertedWithCustomError(c, "InvalidEvidence");
    await expect(
      c.submitEvidence("https://example.com", ethers.ZeroHash),
    ).revertedWithCustomError(c, "InvalidEvidence");
    await c.submitEvidence("ipfs://bafyexample", ethers.id("proof"));
    expect((await c.getStages())[0].evidenceHash).eq(ethers.id("proof"));
    await expect(evidence()).revertedWithCustomError(c, "WrongState");
  });
  it("does not accept evidence before activation", async () => {
    await expect(evidence()).revertedWithCustomError(c, "WrongState");
  });
  it("fixes voting power to original contributions and blocks duplicate votes", async () => {
    await fund();
    await evidence();
    await expect(c.connect(outsider).vote(true)).revertedWithCustomError(
      c,
      "NotContributor",
    );
    await c.connect(alice).vote(true);
    expect((await c.getStages())[0].yes).eq(600n * U);
    await expect(c.connect(alice).vote(false)).revertedWithCustomError(
      c,
      "AlreadyVoted",
    );
    expect(await c.hasVoted(0, alice.address)).eq(true);
  });
  it("does not settle early or accept votes after voting closes", async () => {
    await fund();
    await evidence();
    await expect(c.settleStage()).revertedWithCustomError(c, "TooEarly");
    await jump((await c.getStages())[0].votingEnds);
    await expect(c.connect(alice).vote(true)).revertedWithCustomError(
      c,
      "Expired",
    );
  });
  it("approves at exactly 60% of total stake and uses pull payments", async () => {
    await fund();
    await evidence();
    await c.connect(alice).vote(true);
    await c.connect(bob).vote(false);
    await settle();
    expect(await c.released()).eq(200n * U);
    expect(await c.creatorCredit()).eq(200n * U);
    expect(await token.balanceOf(c.target)).eq(1050n * U);
    await expect(c.connect(alice).withdrawCreator()).revertedWithCustomError(
      c,
      "Unauthorized",
    );
    await c.withdrawCreator();
    expect(await token.balanceOf(c.target)).eq(850n * U);
    expect(await c.withdrawn()).eq(200n * U);
    await expect(c.withdrawCreator()).revertedWithCustomError(
      c,
      "NothingToClaim",
    );
  });
  it("does not pass 40% yes merely because all cast votes favor approval", async () => {
    await fund();
    await evidence();
    await c.connect(bob).vote(true);
    await settle();
    expect(await c.status()).eq(2);
    expect(await c.refundPool()).eq(1000n * U);
    expect((await c.getStages())[0].state).eq(3);
  });
  it("opens refunds if nobody votes", async () => {
    await fund();
    await evidence();
    await settle();
    expect(await c.status()).eq(2);
    expect(await c.claimableRefund(alice.address)).eq(600n * U);
  });
  it("refunds only unreleased money after a later rejection", async () => {
    await fund();
    await evidence();
    await c.connect(alice).vote(true);
    await c.connect(bob).vote(false);
    await settle();
    await evidence();
    await c.connect(alice).vote(false);
    await c.connect(bob).vote(false);
    await settle();
    expect(await c.refundPool()).eq(800n * U);
    expect(await c.claimableRefund(alice.address)).eq(480n * U);
    await c.connect(alice).claimRefund();
    await c.connect(bob).claimRefund();
    expect(await token.balanceOf(c.target)).eq(200n * U);
    await c.withdrawCreator();
    if ((await c.bondCredit()) > 0n) await c.withdrawBond();
    expect(await token.balanceOf(c.target)).eq(0);
    expect((await c.totalRefunded()) + (await c.withdrawn())).eq(
      await c.totalRaised(),
    );
  });
  it("blocks repeated refunds and non-contributor claims", async () => {
    await contribute(alice, 100n * U);
    await jump(await c.fundingEnds());
    await c.finalizeFunding();
    await c.connect(alice).claimRefund();
    expect(await c.claimableRefund(alice.address)).eq(0);
    await expect(c.connect(alice).claimRefund()).revertedWithCustomError(
      c,
      "NothingToClaim",
    );
    await expect(c.connect(outsider).claimRefund()).revertedWithCustomError(
      c,
      "NothingToClaim",
    );
  });
  it("expires missing evidence permissionlessly, but never expires an open vote", async () => {
    await fund();
    await expect(c.expireStage()).revertedWithCustomError(c, "TooEarly");
    await jump((await c.getStages())[0].due);
    await expect(evidence()).revertedWithCustomError(c, "Expired");
    await c.connect(outsider).expireStage();
    expect(await c.refundPool()).eq(1000n * U);
    await expect(c.expireStage()).revertedWithCustomError(c, "WrongState");
  });
  it("lets a vote finish even when its submission deadline has passed", async () => {
    await fund();
    await jump((await c.getStages())[0].due - 2n);
    await evidence();
    await c.connect(alice).vote(true);
    await c.connect(bob).vote(false);
    await expect(c.expireStage()).revertedWithCustomError(c, "WrongState");
    await settle();
    expect(await c.currentStage()).eq(1);
  });
  it("completes all milestones, allowing a fresh vote at each stage", async () => {
    await fund();
    for (let i = 0; i < 3; i++) {
      await evidence();
      await c.connect(alice).vote(true);
      await c.connect(bob).vote(false);
      await settle();
    }
    expect(await c.status()).eq(3);
    expect(await c.currentStage()).eq(3);
    expect(await c.released()).eq(1000n * U);
    await c.withdrawCreator();
    if ((await c.bondCredit()) > 0n) await c.withdrawBond();
    expect(await token.balanceOf(c.target)).eq(0);
    await expect(evidence()).revertedWithCustomError(c, "WrongState");
    await expect(c.settleStage()).revertedWithCustomError(c, "WrongState");
    await expect(c.vote(true)).revertedWithCustomError(c, "WrongState");
  });
  it("restricts pause to creator and fundraising, preserving deadline/refund liveness", async () => {
    await contribute(alice, 300n * U);
    await expect(
      c.connect(alice).setFundingPaused(true),
    ).revertedWithCustomError(c, "Unauthorized");
    await c.setFundingPaused(true);
    await expect(c.connect(bob).contribute(U)).revertedWithCustomError(
      c,
      "EnforcedPause",
    );
    await c.setFundingPaused(false);
    await contribute(bob, 100n * U);
    await c.setFundingPaused(true);
    await jump(await c.fundingEnds());
    await c.finalizeFunding();
    await c.connect(alice).claimRefund();
    expect(await token.balanceOf(alice.address)).eq(1000n * U);
    await expect(c.setFundingPaused(false)).revertedWithCustomError(
      c,
      "WrongState",
    );
  });
  it("keeps different campaigns and their treasuries isolated", async () => {
    await contribute(alice, 100n * U);
    await token.connect(bob).approve(factory.target, U);
    await factory
      .connect(bob)
      .createCampaign([
        "Second",
        "Separate escrow",
        1,
        now + DAY,
        DAY,
        ["Only"],
        [U],
        [now + 4 * DAY],
      ]);
    const second = await ethers.getContractAt(
      "MilestoneCampaign",
      await factory.campaignAt(1),
    );
    expect(await second.creator()).eq(bob.address);
    expect(await token.balanceOf(second.target)).eq(U / 20n);
    expect(await second.contributions(alice.address)).eq(0);
    expect(await factory.isCampaign(outsider.address)).eq(false);
  });
  it("rejects invalid deadlines, lengths, empty budgets and excessive goals", async () => {
    const create = (
      names,
      budgets,
      dues,
      end = now + DAY,
      period = DAY,
      title = "Valid",
    ) =>
      factory.createCampaign([
        title,
        "Description",
        0,
        end,
        period,
        names,
        budgets,
        dues,
      ]);
    for (const args of [
      [[], [], []],
      [["a"], [0], [now + 4 * DAY]],
      [["a", "b"], [1], [now + 4 * DAY]],
      [["a"], [1], [now + DAY]],
      [["a"], [1], [now + 4 * DAY], now - 1],
      [["a"], [1], [now + 4 * DAY], now + DAY, 3599],
      [["a"], [1_000_001n * U], [now + 4 * DAY]],
      [["a"], [1], [now + 4 * DAY], now + DAY, DAY, ""],
    ])
      await expect(create(...args)).revertedWithCustomError(c, "InvalidConfig");
  });
  it("assigns rounding dust to the last claimant without leaving funds stuck", async () => {
    await factory.createCampaign([
      "Tiny",
      "Rounding test",
      0,
      now + DAY,
      3600,
      ["First", "Second"],
      [1, 3],
      [now + 2 * DAY, now + 3 * DAY],
    ]);
    c = await ethers.getContractAt(
      "MilestoneCampaign",
      await factory.campaignAt(1),
    );
    await contribute(alice, 1);
    await contribute(bob, 1);
    await contribute(carol, 2);
    await c.finalizeFunding();
    await evidence();
    await c.connect(carol).vote(true);
    await c.connect(alice).vote(true);
    await c.connect(bob).vote(false);
    await settle();
    await evidence();
    await settle();
    expect(await c.refundPool()).eq(3);
    await c.connect(alice).claimRefund();
    await c.connect(bob).claimRefund();
    expect(await c.claimableRefund(carol.address)).eq(3);
    await c.connect(carol).claimRefund();
    await c.withdrawCreator();
    if ((await c.bondCredit()) > 0n) await c.withdrawBond();
    expect(await token.balanceOf(c.target)).eq(0);
    expect(await c.totalRefunded()).eq(3);
  });
  it("direct token donations cannot change voting power or campaign accounting", async () => {
    await fund();
    await token.transfer(c.target, 5n * U);
    expect(await c.totalRaised()).eq(1000n * U);
    expect(await c.contributions(owner.address)).eq(0);
    await evidence();
    await expect(c.vote(true)).revertedWithCustomError(c, "NotContributor");
  });
  it("conserves contributor balances for varied failed-funding allocations", async () => {
    for (let i = 0; i < 10; i++) {
      const x = BigInt(((i * 7919) % 200000000) + 1);
      const y = BigInt(((i * 104729) % 200000000) + 1);
      await contribute(alice, x);
      await contribute(bob, y);
    }
    const total = await c.totalRaised();
    await jump(await c.fundingEnds());
    await c.finalizeFunding();
    await c.connect(bob).claimRefund();
    await c.connect(alice).claimRefund();
    expect(await c.totalRefunded()).eq(total);
    if ((await c.bondCredit()) > 0n) await c.withdrawBond();
    expect(await token.balanceOf(c.target)).eq(0);
    expect(await token.balanceOf(alice.address)).eq(1000n * U);
    expect(await token.balanceOf(bob.address)).eq(1000n * U);
  });
});
