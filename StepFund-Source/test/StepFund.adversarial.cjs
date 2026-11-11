const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const DAY = 86400,
  U = 1000000n;
describe("StepFund concurrent operations and seeded conservation", function () {
  this.timeout(120000);
  async function setup(budgets) {
    const [owner, ...backers] = await ethers.getSigners();
    const token = await ethers.deployContract("TestUSD"),
      factory = await ethers.deployContract("StepFundFactory", [token.target]);
    await token.faucet();
    await token.approve(factory.target, ethers.MaxUint256);
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    await factory.createCampaign([
      "Adversarial",
      "Concurrent and randomized funding",
      0,
      now + DAY,
      DAY,
      budgets.map((_, i) => "Stage " + i),
      budgets,
      budgets.map((_, i) => now + (4 + 4 * i) * DAY),
    ]);
    const c = await ethers.getContractAt(
      "MilestoneCampaign",
      await factory.campaignAt(0),
    );
    for (const b of backers.slice(0, 4)) {
      await token.connect(b).faucet();
      await token.connect(b).approve(c.target, 1000n * U);
    }
    return { owner, backers: backers.slice(0, 4), token, c };
  }
  async function jump(t) {
    await network.provider.send("evm_setNextBlockTimestamp", [Number(t)]);
    await network.provider.send("evm_mine");
  }
  it("mines competing last-slot contributions in the same block without exceeding the goal", async () => {
    const {
      backers: [a, b, c],
      token,
      c: campaign,
    } = await setup([1000n * U]);
    await campaign.connect(a).contribute(800n * U);
    await network.provider.send("evm_setAutomine", [false]);
    try {
      const sent = await Promise.all([
        campaign.connect(b).contribute(200n * U, { gasLimit: 300000 }),
        campaign.connect(c).contribute(200n * U, { gasLimit: 300000 }),
      ]);
      await network.provider.send("evm_mine");
      const receipts = await Promise.all(
        sent.map((t) => ethers.provider.getTransactionReceipt(t.hash)),
      );
      expect(receipts.map((r) => r.status).sort()).deep.eq([0, 1]);
      expect(receipts[0].blockNumber).eq(receipts[1].blockNumber);
      expect(await campaign.totalRaised()).eq(1000n * U);
      expect(await token.balanceOf(campaign.target)).eq(1050n * U);
      expect(await campaign.contributorCount()).eq(2);
    } finally {
      await network.provider.send("evm_setAutomine", [true]);
      await network.provider.send("evm_mine");
    }
  });
  it("settles simultaneous refunds from independent accounts exactly once", async () => {
    const { backers, token, c } = await setup([1000n * U]);
    for (let i = 0; i < 4; i++)
      await c.connect(backers[i]).contribute(BigInt(10 + i) * U);
    await jump(await c.fundingEnds());
    await c.finalizeFunding();
    await network.provider.send("evm_setAutomine", [false]);
    try {
      const sent = await Promise.all(
        backers.map((b) => c.connect(b).claimRefund({ gasLimit: 300000 })),
      );
      await network.provider.send("evm_mine");
      const receipts = await Promise.all(
        sent.map((t) => ethers.provider.getTransactionReceipt(t.hash)),
      );
      expect(receipts.every((r) => r.status === 1)).eq(true);
    } finally {
      await network.provider.send("evm_setAutomine", [true]);
      await network.provider.send("evm_mine");
    }
    if ((await c.bondCredit()) > 0n) await c.withdrawBond();
    expect(await token.balanceOf(c.target)).eq(0);
    expect(await c.totalRefunded()).eq(await c.totalRaised());
    expect(await c.refundClaimCount()).eq(4);
    await expect(c.connect(backers[0]).claimRefund()).revertedWithCustomError(
      c,
      "NothingToClaim",
    );
  });
  it("conserves every micro-token over 16 seeded amounts, claim orders and creator-withdrawal positions", async () => {
    let randomState = 52817;
    const random = () => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState;
    };
    for (let round = 0; round < 16; round++) {
      const shares = Array.from({ length: 4 }, () =>
        BigInt((random() % 10000000) + 1),
      );
      const total = shares.reduce((a, b) => a + b, 0n);
      const approved =
        round === 0 ? total - 1n : (BigInt(random()) % (total - 1n)) + 1n;
      const { backers, token, c } = await setup([approved, total - approved]);
      for (let i = 0; i < 4; i++)
        await c.connect(backers[i]).contribute(shares[i]);
      await c.finalizeFunding();
      await c.submitEvidence(
        "https://example.com/seeded-proof",
        ethers.id("seed " + round),
      );
      for (const b of backers) await c.connect(b).vote(true);
      await jump((await c.getStages())[0].votingEnds);
      await c.settleStage();
      await jump((await c.getStages())[1].due);
      await c.expireStage();
      const order = [...backers];
      for (let i = order.length - 1; i > 0; i--) {
        const j = random() % (i + 1);
        [order[i], order[j]] = [order[j], order[i]];
      }
      const withdrawAt = random() % 5;
      let payouts = 0n;
      for (let i = 0; i <= 4; i++) {
        if (i === withdrawAt) await c.withdrawCreator();
        if (i < 4) {
          const expected =
              (await c.claimableRefund(order[i].address)) +
              (await c.claimableBondShare(order[i].address)),
            before = await token.balanceOf(order[i].address);
          await c.connect(order[i]).claimRefund();
          expect((await token.balanceOf(order[i].address)) - before).eq(
            expected,
          );
          payouts += expected;
          expect(await c.claimableRefund(order[i].address)).eq(0);
        }
        expect(
          (await token.balanceOf(c.target)) +
            (await c.withdrawn()) +
            (await c.totalRefunded()) +
            (await c.bondDistributed()),
        ).eq(total + (await c.bondRequired()));
      }
      expect(payouts).eq(total - approved + (await c.bondRequired()));
      expect(await c.withdrawn()).eq(approved);
      expect(await c.refundClaimCount()).eq(4);
      if ((await c.bondCredit()) > 0n) await c.withdrawBond();
      expect(await token.balanceOf(c.target)).eq(0);
    }
  });
});
