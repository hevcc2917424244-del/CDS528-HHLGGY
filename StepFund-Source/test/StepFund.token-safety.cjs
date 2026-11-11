const { expect } = require("chai");
const { ethers, network } = require("hardhat");
describe("StepFund hostile token callbacks", function () {
  let token, factory, c, owner, other, args;
  beforeEach(async () => {
    [owner, other] = await ethers.getSigners();
    token = await ethers.deployContract("HostileToken");
    factory = await ethers.deployContract("StepFundFactory", [token.target]);
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    args = [
      "Token checks",
      "No transfer fees",
      0,
      now + 86400,
      3600,
      ["One"],
      [1000],
      [now + 3 * 86400],
    ];
    await token.approve(factory.target, 50);
  });
  async function create() {
    await factory.createCampaign(args);
    c = await ethers.getContractAt(
      "MilestoneCampaign",
      await factory.campaignAt(0),
    );
  }
  it("rejects fee-on-transfer bond tokens and leaves no registered campaign", async () => {
    await token.configure(true, ethers.ZeroAddress, "0x");
    await expect(factory.createCampaign(args)).revertedWithCustomError(
      factory,
      "UnsupportedToken",
    );
    expect(await factory.campaignCount()).eq(0);
    expect(await token.balanceOf(owner.address)).eq(1000000);
  });
  it("rolls back contribution accounting when a token takes a transfer fee", async () => {
    await create();
    await token.approve(c.target, 100);
    await token.configure(true, ethers.ZeroAddress, "0x");
    await expect(c.contribute(100)).revertedWithCustomError(
      c,
      "UnsupportedToken",
    );
    expect(await c.totalRaised()).eq(0);
    expect(await c.contributorCount()).eq(0);
    expect(await token.balanceOf(c.target)).eq(50);
  });
  it("blocks nested factory creation during bond transfer", async () => {
    await token.configure(
      false,
      factory.target,
      factory.interface.encodeFunctionData("createCampaign", [args]),
    );
    await create();
    expect(await token.callbackSucceeded()).eq(false);
    expect(await token.callbackError()).eq(
      ethers.id("ReentrancyGuardReentrantCall()").slice(0, 10),
    );
    expect(await factory.campaignCount()).eq(1);
  });
  it("blocks reentry during contributions, principal refunds and bond withdrawals", async () => {
    await create();
    await token.approve(c.target, 100);
    await token.configure(
      false,
      c.target,
      c.interface.encodeFunctionData("contribute", [1]),
    );
    await c.contribute(100);
    expect(await token.callbackError()).eq(
      ethers.id("ReentrancyGuardReentrantCall()").slice(0, 10),
    );
    await network.provider.send("evm_setNextBlockTimestamp", [
      Number(await c.fundingEnds()),
    ]);
    await c.finalizeFunding();
    await token.configure(
      false,
      c.target,
      c.interface.encodeFunctionData("claimRefund"),
    );
    await c.claimRefund();
    expect(await token.callbackSucceeded()).eq(false);
    expect(await c.totalRefunded()).eq(100);
    await token.configure(
      false,
      c.target,
      c.interface.encodeFunctionData("withdrawBond"),
    );
    await c.withdrawBond();
    expect(await token.callbackError()).eq(
      ethers.id("ReentrancyGuardReentrantCall()").slice(0, 10),
    );
    expect(await token.balanceOf(c.target)).eq(0);
  });
});
