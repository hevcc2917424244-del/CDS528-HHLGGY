import {
  BrowserProvider,
  Contract,
  ContractFactory,
  isAddress,
  keccak256,
  toUtf8Bytes,
  type InterfaceAbi,
} from "ethers";
import { walletProvider, assertWalletNetwork } from "./wallet";
import {
  requireJournal,
  journalTransaction,
  waitRecorded,
  pendingFor,
  checkRecorded,
  transactionRecords,
  type TxRecord,
} from "./transactions";
import {
  amount,
  DAY,
  text,
  validateDraft,
  requiredBond,
  type Action,
  type Activity,
  type Project,
} from "./model";
export const TOKEN_ABI = [
  "function symbol() view returns(string)",
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address,address) view returns(uint256)",
  "function approve(address,uint256) returns(bool)",
  "function faucet()",
  "function nextFaucet(address) view returns(uint256)",
  "function decimals() view returns(uint8)",
];
export const FACTORY_ABI = [
  "function createAdvancedCampaign(tuple(string title,string summary,uint8 category,uint256 fundingEnds,uint256 votingPeriod,string[] names,uint256[] budgets,uint256[] dues),tuple(address vault,address verifier,address assessor,uint64[] minimums,uint64[] maximums)) returns(address)",
  "function protocolVersion() view returns(uint256)",
  "function asset() view returns(address)",
  "function acceptanceVerifier() view returns(address)",
  "function campaignCount() view returns(uint256)",
  "function campaignAt(uint256) view returns(address)",
  "function isCampaign(address) view returns(bool)",
  "function createCampaign(tuple(string title,string summary,uint8 category,uint256 fundingEnds,uint256 votingPeriod,string[] names,uint256[] budgets,uint256[] dues)) returns(address)",
  "event CampaignCreated(address indexed campaign,address indexed creator,string title)",
];
export const CAMPAIGN_ABI = [
  ...["treasuryVault", "verifier", "assessor"].map(x => `function ${x}() view returns(address)`),
  ...["treasuryPrincipal", "treasuryLoss", "yieldPool", "yieldDistributed", "rescueShares"].map(x => `function ${x}() view returns(uint256)`),
  ...["minimums", "maximums", "acceptedCommitment"].map(x => `function ${x}(uint256) view returns(uint256)`),
  "function acceptedDigest(uint256) view returns(bytes32)",
  "function privacyVerified(uint256) view returns(bool)",
  "function yieldClaimed(address) view returns(bool)",
  "function claimableYield(address) view returns(uint256,uint256)",
  "function investTreasury(uint256,uint256)",
  "function rescueTreasury()",
  "function claimYield()",
  "function attestPrivate(uint256,uint256,bytes32)",
  "function submitPrivateEvidence(string,bytes32,uint256[24],uint256[4])",
  "error InvalidProof()",
  ...["title", "summary"].map((x) => `function ${x}() view returns(string)`),
  "function creator() view returns(address)",
  "function asset() view returns(address)",
  ...[
    "category",
    "createdAt",
    "fundingEnds",
    "votingPeriod",
    "goal",
    "totalRaised",
    "released",
    "withdrawn",
    "totalRefunded",
    "refundPool",
    "contributorCount",
    "refundClaimCount",
    "currentStage",
    "status",
    "bondRequired",
    "bondLocked",
    "bondCredit",
    "bondReturned",
    "bondRefundPool",
    "bondDistributed",
  ].map((x) => `function ${x}() view returns(uint256)`),
  "function paused() view returns(bool)",
  "function contributions(address) view returns(uint256)",
  "function refundClaimed(address) view returns(bool)",
  "function hasVoted(uint256,address) view returns(bool)",
  "function hasParticipated(uint256,address) view returns(bool)",
  "function delegates(uint256,address) view returns(address)",
  "function votingWeight(uint256,address) view returns(uint256)",
  "function delegateVote(address)",
  "function withdrawBond()",
  "function getStages() view returns(tuple(string title,uint256 budget,uint256 due,uint8 state,string evidenceURI,bytes32 evidenceHash,uint256 votingEnds,uint256 yes,uint256 no)[])",
  "function contribute(uint256)",
  "function finalizeFunding()",
  "function submitEvidence(string,bytes32)",
  "function vote(bool)",
  "function settleStage()",
  "function expireStage()",
  "function claimRefund()",
  "function withdrawCreator()",
  "function setFundingPaused(bool)",
  ...[
    "Unauthorized",
    "InvalidConfig",
    "WrongState",
    "InvalidAmount",
    "TooEarly",
    "Expired",
    "AlreadyVoted",
    "NotContributor",
    "NothingToClaim",
    "InvalidEvidence",
    "UnsupportedToken",
    "InvalidDelegate",
    "EnforcedPause",
    "ExpectedPause",
  ].map((x) => `error ${x}()`),
];
export type { WalletProvider } from "./wallet";
export type Connection = {
  protocolVersion?: number;
  verifier?: string;
  unit?: string;
  faucet?: boolean;
  provider: BrowserProvider;
  account: string;
  chainId: number;
  factoryAddress: string;
  tokenAddress: string;
};
export async function connect(factoryAddress: string): Promise<Connection> {
  const provider = new BrowserProvider(walletProvider());
  await provider.send("eth_requestAccounts", []);
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  assertWalletNetwork(chainId);
  if (!isAddress(factoryAddress)) throw Error("invalidFactory");
  if ((await provider.getCode(factoryAddress)) === "0x")
    throw Error("invalidFactory");
  const factory = new Contract(factoryAddress, FACTORY_ABI, provider);
  let protocolVersion;
  try {
    protocolVersion = Number(await factory.protocolVersion());
    if (![2, 3].includes(protocolVersion)) throw Error();
  } catch {
    throw Error("legacyFactory");
  }
  const tokenAddress = await factory.asset();
  if (
    Number(await new Contract(tokenAddress, TOKEN_ABI, provider).decimals()) !==
    6
  )
    throw Error("invalidFactory");
  const assetContract = new Contract(tokenAddress, TOKEN_ABI, provider);
  const symbol = String(await assetContract.symbol());
  let faucet = false;
  try { await assetContract.nextFaucet((await provider.getSigner()).address); faucet = true; } catch { /* external supported reserve */ }
  return {
    protocolVersion,
    unit: /^[a-zA-Z0-9._-]{1,18}$/.test(symbol) ? symbol : "TOKEN",
    faucet,
    verifier: protocolVersion === 3 ? await factory.acceptanceVerifier() : undefined,
    provider,
    account: (await provider.getSigner()).address.toLowerCase(),
    chainId,
    factoryAddress,
    tokenAddress,
  };
}
export async function walletChain() {
  return Number(await walletProvider().request({ method: "eth_chainId" }));
}
export async function deployFromWallet(
  expectedChain: number,
  onPhase: (phase: string) => void,
) {
  assertWalletNetwork(expectedChain);
  const provider = new BrowserProvider(walletProvider());
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const check = async () => {
    if (Number((await provider.getNetwork()).chainId) !== expectedChain)
      throw Error("wrongNetwork");
    const accounts = await provider.send("eth_accounts", []);
    if (String(accounts[0]).toLowerCase() !== signer.address.toLowerCase())
      throw Error("walletChanged");
  };
  await check();
  const [tokenArtifact, factoryArtifact] = await Promise.all(
    ["TestUSD", "StepFundFactory"].map(async (name) => {
      const r = await fetch(`/contracts/${name}.json`);
      if (!r.ok) throw Error("rpcError");
      return (await r.json()) as { abi: InterfaceAbi; bytecode: string };
    }),
  );
  requireJournal();
  const key = `stepfund-deployment-progress-v3-${expectedChain}-${signer.address.toLowerCase()}`;
  type Step = { address: string; hash: string };
  let progress: { token?: Step; factory?: Step } = JSON.parse(
    localStorage.getItem(key) || "{}",
  );
  const persist = () => localStorage.setItem(key, JSON.stringify(progress));
  async function deployStep(name: "token" | "factory") {
    await check();
    const previous = progress[name];
    if (previous) {
      if (!isAddress(previous.address)) throw Error("deploymentRecovery");
      const recorded = transactionRecords().find(
        (r) =>
          r.hash === previous.hash &&
          r.chainId === expectedChain &&
          r.account === signer.address.toLowerCase(),
      );
      if (!recorded) throw Error("deploymentRecovery");
      onPhase("recovering");
      const status = await checkRecorded(provider, recorded);
      if (status.status === "pending") throw Error("transactionPending");
      if (status.status === "confirmed") {
        if ((await provider.getCode(previous.address)) === "0x")
          throw Error("deploymentRecovery");
        return previous.address;
      }
      delete progress[name];
      persist();
    }
    requireJournal();
    onPhase(name === "token" ? "deployToken" : "deployFactory");
    const artifact = name === "token" ? tokenArtifact : factoryArtifact;
    const contract = await new ContractFactory(
      artifact.abi,
      artifact.bytecode,
      signer,
    ).deploy(...(name === "token" ? [] : [progress.token!.address]));
    const tx = contract.deploymentTransaction()!;
    const record = journalTransaction(tx, {
      chainId: expectedChain,
      account: signer.address,
      kind: name === "token" ? "deployToken" : "deployFactory",
    });
    progress[name] = { address: await contract.getAddress(), hash: tx.hash };
    persist();
    onPhase("confirming");
    await waitRecorded(tx, record);
    return progress[name]!.address;
  }
  const token = await deployStep("token");
  if (Number(await new Contract(token, TOKEN_ABI, provider).decimals()) !== 6)
    throw Error("deploymentRecovery");
  const factory = await deployStep("factory");
  if (
    String(
      await new Contract(factory, FACTORY_ABI, provider).asset(),
    ).toLowerCase() !== token.toLowerCase()
  )
    throw Error("deploymentRecovery");
  const result = {
    chainId: expectedChain,
    protocolVersion: 3,
    verifier: await new Contract(factory, FACTORY_ABI, provider).acceptanceVerifier(),
    token,
    factory,
    deployer: signer.address,
    blockNumber: await provider.getBlockNumber(),
    deployedAt: new Date().toISOString(),
    tokenTransaction: progress.token!.hash,
    factoryTransaction: progress.factory!.hash,
  };
  localStorage.setItem("stepfund-factory-" + expectedChain, factory);
  localStorage.setItem(
    "stepfund-last-deployment-" + expectedChain,
    JSON.stringify(result),
  );
  localStorage.removeItem(key);
  return result;
}
export async function switchNetwork(chainId: number) {
  const raw = walletProvider();
  assertWalletNetwork(chainId);
  try {
    await raw.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x" + chainId.toString(16) }],
    });
  } catch (e) {
    if ((e as { code: number }).code !== 4902) throw e;
    await raw.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: "0x" + chainId.toString(16),
          chainName: chainId === 31337 ? "Hardhat Local" : "Sepolia",
          nativeCurrency: { name: "Test Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [
            chainId === 31337
              ? "http://127.0.0.1:8545"
              : "https://ethereum-sepolia-rpc.publicnode.com",
          ],
          ...(chainId === 11155111
            ? { blockExplorerUrls: ["https://sepolia.etherscan.io"] }
            : {}),
        },
      ],
    });
  }
}
export async function readChain(c: Connection, limit = 24) {
  const factory = new Contract(c.factoryAddress, FACTORY_ABI, c.provider);
  const token = new Contract(c.tokenAddress, TOKEN_ABI, c.provider);
  const [countRaw, balanceRaw, block] = await Promise.all([
    factory.campaignCount(),
    token.balanceOf(c.account),
    c.provider.getBlock("latest"),
  ]);
  const count = Number(countRaw);
  const addresses = await Promise.all(
    Array.from({ length: Math.min(count, limit) }, (_, i) =>
      factory.campaignAt(count - 1 - i),
    ),
  );
  const projects: Project[] = [];
  // Bound concurrency to keep public RPC endpoints usable.
  for (let offset = 0; offset < addresses.length; offset += 4) {
    projects.push(
      ...(await Promise.all(
        addresses.slice(offset, offset + 4).map(async (address: string) => {
          const contract = new Contract(address, CAMPAIGN_ABI, c.provider);
          const keys = [
            "title",
            "summary",
            "creator",
            "category",
            "createdAt",
            "fundingEnds",
            "votingPeriod",
            "goal",
            "totalRaised",
            "released",
            "withdrawn",
            "totalRefunded",
            "refundPool",
            "contributorCount",
            "refundClaimCount",
            "currentStage",
            "status",
            "paused",
            "getStages",
            "bondRequired",
            "bondLocked",
            "bondCredit",
            "bondReturned",
            "bondRefundPool",
            "bondDistributed",
          ] as const;
          const values = await Promise.all(keys.map((k) => contract[k]()));
          const v = Object.fromEntries(keys.map((k, i) => [k, values[i]]));
          const [stake, claimed, voted, delegate, weight] = await Promise.all([
            contract.contributions(c.account),
            contract.refundClaimed(c.account),
            contract.hasParticipated(v.currentStage, c.account),
            contract.delegates(v.currentStage, c.account),
            contract.votingWeight(v.currentStage, c.account),
          ]);
          let advanced: Project["advanced"];
          if (c.protocolVersion === 3) {
            const fields = ["treasuryVault", "treasuryPrincipal", "treasuryLoss", "yieldPool", "yieldDistributed", "rescueShares", "verifier", "assessor"];
            const vals = await Promise.all(fields.map(k => contract[k]()));
            const extras = Object.fromEntries(fields.map((k, i) => [k, vals[i]]));
            const [claim, claimedYield] = await Promise.all([contract.claimableYield(c.account), contract.yieldClaimed(c.account)]);
            const privateStages = /^0x0{40}$/i.test(extras.verifier) ? [] : await Promise.all(v.getStages.map((_: unknown, i: number) => Promise.all([contract.minimums(i), contract.maximums(i), contract.acceptedCommitment(i), contract.acceptedDigest(i), contract.privacyVerified(i)])));
            advanced = { vault: String(extras.treasuryVault), principal: Number(extras.treasuryPrincipal), loss: Number(extras.treasuryLoss), yieldPool: Number(extras.yieldPool), yieldDistributed: Number(extras.yieldDistributed), rescueShares: String(extras.rescueShares), reward: String(claim[0]), shares: String(claim[1]), yieldClaimed: claimedYield, verifier: String(extras.verifier), assessor: String(extras.assessor).toLowerCase(), minimums: privateStages.map(x => String(x[0])), maximums: privateStages.map(x => String(x[1])), commitments: privateStages.map(x => String(x[2])), digests: privateStages.map(x => String(x[3])), verified: privateStages.map(x => Boolean(x[4])) };
          }
          return {
            advanced,
            id: address.toLowerCase(),
            title: text(v.title),
            summary: text(v.summary),
            creator: String(v.creator).toLowerCase(),
            category: (["education", "community", "technology"] as const)[
              Number(v.category)
            ],
            createdAt: Number(v.createdAt),
            fundingEnds: Number(v.fundingEnds),
            votingPeriod: Number(v.votingPeriod),
            goal: Number(v.goal),
            raised: Number(v.totalRaised),
            released: Number(v.released),
            withdrawn: Number(v.withdrawn),
            refunded: Number(v.totalRefunded),
            refundPool: Number(v.refundPool),
            bondRequired: Number(v.bondRequired),
            bondLocked: Number(v.bondLocked),
            bondCredit: Number(v.bondCredit),
            bondReturned: Number(v.bondReturned),
            bondRefundPool: Number(v.bondRefundPool),
            bondDistributed: Number(v.bondDistributed),
            contributorCount: Number(v.contributorCount),
            claimCount: Number(v.refundClaimCount),
            current: Number(v.currentStage),
            status: (["funding", "active", "refunding", "completed"] as const)[
              Number(v.status)
            ],
            paused: v.paused,
            contributions: { [c.account]: Number(stake) },
            claims: claimed ? [c.account] : [],
            stages: v.getStages.map(
              (
                s: {
                  title: string;
                  budget: bigint;
                  due: bigint;
                  state: bigint;
                  evidenceURI: string;
                  evidenceHash: string;
                  votingEnds: bigint;
                  yes: bigint;
                  no: bigint;
                },
                i: number,
              ) => ({
                title: text(s.title),
                budget: Number(s.budget),
                due: Number(s.due),
                state: (["pending", "voting", "approved", "rejected"] as const)[
                  Number(s.state)
                ],
                evidence: s.evidenceURI,
                digest: s.evidenceHash,
                votingEnds: Number(s.votingEnds),
                yes: Number(s.yes),
                no: Number(s.no),
                voters:
                  i === Number(v.currentStage) && voted ? [c.account] : [],
                delegates:
                  i === Number(v.currentStage) && !/^0x0{40}$/i.test(delegate)
                    ? { [c.account]: String(delegate).toLowerCase() }
                    : {},
                weights:
                  i === Number(v.currentStage)
                    ? { [c.account]: Number(weight) }
                    : {},
              }),
            ),
          } satisfies Project;
        }),
      )),
    );
  }
  return {
    projects,
    balance: Number(balanceRaw),
    now: block?.timestamp || Math.floor(Date.now() / 1000),
    count,
  };
}
export async function transact(
  c: Connection,
  action: Action,
  onPhase: (phase: string) => void,
): Promise<{ activity: Activity; createdId?: string }> {
  // Recheck signer/network after every wallet event before sending funds.
  const signer = await c.provider.getSigner();
  const net = await c.provider.getNetwork();
  if (
    Number(net.chainId) !== c.chainId ||
    ![31337, 11155111].includes(Number(net.chainId)) ||
    signer.address.toLowerCase() !== c.account
  )
    throw Error("walletChanged");
  const ensureCurrentWallet = async () => {
    const currentNetwork = await c.provider.getNetwork();
    const accounts = await c.provider.send("eth_accounts", []);
    if (
      Number(currentNetwork.chainId) !== c.chainId ||
      String(accounts[0]).toLowerCase() !== c.account
    )
      throw Error("walletChanged");
  };
  const factory = new Contract(c.factoryAddress, FACTORY_ABI, signer);
  const token = new Contract(c.tokenAddress, TOKEN_ABI, signer);
  requireJournal();
  const unresolved = pendingFor(
    c.chainId,
    c.account,
    action.kind,
    action.projectId || "",
    c.factoryAddress,
  );
  if (unresolved) {
    const checked = await checkRecorded(c.provider, unresolved);
    if (checked.status === "pending") throw Error("transactionPending");
    if (checked.status === "confirmed")
      throw Error("transactionAlreadyConfirmed");
  }
  const record = (
    tx: Parameters<typeof journalTransaction>[0],
    kind = action.kind as string,
  ) =>
    journalTransaction(tx, {
      chainId: c.chainId,
      account: c.account,
      kind,
      projectId: action.projectId,
      factory: c.factoryAddress,
    });
  let tx;
  onPhase("walletConfirm");
  if (action.kind === "create") {
    const d = action.draft!;
    const bond = requiredBond(validateDraft(d));
    const previousApproval = pendingFor(
      c.chainId,
      c.account,
      "approveBond",
      "",
      c.factoryAddress,
    );
    if (
      previousApproval &&
      (await checkRecorded(c.provider, previousApproval)).status === "pending"
    )
      throw Error("transactionPending");
    if ((await token.balanceOf(c.account)) < BigInt(bond))
      throw Error("balanceLow");
    if ((await token.allowance(c.account, c.factoryAddress)) < BigInt(bond)) {
      onPhase("approveToken");
      await ensureCurrentWallet();
      const approval = await token.approve(c.factoryAddress, bond);
      const saved = record(approval, "approveBond");
      onPhase("confirming");
      await waitRecorded(approval, saved);
      onPhase("walletConfirm");
    }
    const block = await c.provider.getBlock("latest");
    if (!block) throw Error("rpcError");
    const now = block.timestamp;
    await ensureCurrentWallet();
    const createArgs = [
      d.title.trim(),
      d.summary.trim(),
      ["education", "community", "technology"].indexOf(d.category),
      now + d.fundingDays * DAY,
      d.votingDays * DAY,
      d.stages.map((s) => s.title.trim()),
      d.stages.map((s) => amount(s.amount)),
      d.stages.map((s) => now + s.days * DAY),
    ];
    if (d.advanced) {
      if (c.protocolVersion !== 3) throw Error("chainFeature");
      tx = await factory.createAdvancedCampaign(createArgs, d.advanced);
    } else tx = await factory.createCampaign(createArgs);
  } else if (action.kind === "faucet") {
    if (c.faucet === false) throw Error("externalFaucet");
    await ensureCurrentWallet();
    tx = await token.faucet();
  } else {
    if (!action.projectId || !(await factory.isCampaign(action.projectId)))
      throw Error("invalidFactory");
    const campaign = new Contract(action.projectId, CAMPAIGN_ABI, signer);
    await ensureCurrentWallet();
    switch (action.kind) {
      case "investTreasury": {
        const vault = new Contract(await campaign.treasuryVault(), ["function previewDeposit(uint256) view returns(uint256)"], c.provider);
        const quote = BigInt(await vault.previewDeposit(action.value!));
        const minShares = quote * BigInt(99) / BigInt(100);
        if (minShares === BigInt(0)) throw Error("invalidAmount");
        await ensureCurrentWallet();
        tx = await campaign.investTreasury(action.value!, minShares);
        break;
      }
      case "rescueTreasury": tx = await campaign.rescueTreasury(); break;
      case "claimYield": tx = await campaign.claimYield(); break;
      case "attestPrivate": tx = await campaign.attestPrivate(action.stage, action.commitment, action.digest); break;
      case "privateEvidence": tx = await campaign.submitPrivateEvidence(action.uri, action.digest, action.proof, action.signals); break;
      case "delegate":
        tx = await campaign.delegateVote(
          action.recipient || "0x0000000000000000000000000000000000000000",
        );
        break;
      case "withdrawBond":
        tx = await campaign.withdrawBond();
        break;
      case "contribute": {
        const value = action.value!;
        const oldApproval = pendingFor(
          c.chainId,
          c.account,
          "approve",
          action.projectId,
          c.factoryAddress,
        );
        if (
          oldApproval &&
          (await checkRecorded(c.provider, oldApproval)).status === "pending"
        )
          throw Error("transactionPending");
        const allowance = await token.allowance(c.account, action.projectId);
        if (allowance < BigInt(value)) {
          onPhase("approveToken");
          await ensureCurrentWallet();
          const approve = await token.approve(action.projectId, value);
          const recorded = record(approve, "approve");
          onPhase("confirming");
          await waitRecorded(approve, recorded);
          onPhase("walletConfirm");
        }
        await ensureCurrentWallet();
        tx = await campaign.contribute(value);
        break;
      }
      case "finalize":
        tx = await campaign.finalizeFunding();
        break;
      case "evidence":
        tx = await campaign.submitEvidence(action.uri, action.digest);
        break;
      case "voteYes":
      case "voteNo":
        tx = await campaign.vote(action.kind === "voteYes");
        break;
      case "settle":
        tx = await campaign.settleStage();
        break;
      case "expire":
        tx = await campaign.expireStage();
        break;
      case "refund":
        tx = await campaign.claimRefund();
        break;
      case "withdraw":
        tx = await campaign.withdrawCreator();
        break;
      case "pause":
      case "unpause":
        tx = await campaign.setFundingPaused(action.kind === "pause");
        break;
      default:
        throw Error("wrongState");
    }
  }
  onPhase("confirming");
  const receipt = await waitRecorded(tx, record(tx));
  if (!receipt || receipt.status !== 1) throw Error("transactionFailed");
  let createdId: string | undefined;
  if (action.kind === "create") {
    for (const log of receipt.logs) {
      try {
        const event = factory.interface.parseLog(log);
        if (event?.name === "CampaignCreated")
          createdId = String(event.args.campaign).toLowerCase();
      } catch {
        /* Other contracts may emit logs. */
      }
    }
  }
  const block = await c.provider.getBlock(receipt.blockNumber);
  return {
    activity: {
      id: receipt.hash,
      hash: receipt.hash,
      projectId: createdId || action.projectId || "",
      actor: c.account,
      kind: action.kind,
      amount: action.value || 0,
      time: block?.timestamp || Math.floor(Date.now() / 1000),
    },
    createdId,
  };
}
export const hashEvidence = (content: Uint8Array | string) =>
  keccak256(typeof content === "string" ? toUtf8Bytes(content) : content);
export function errorKey(error: unknown): string {
  const e = error as {
    code?: string | number;
    shortMessage?: string;
    message?: string;
    revert?: { name: string };
    info?: { error?: { code: number; data?: { message?: string } } };
  };
  if (
    e.code === 4001 ||
    e.code === "ACTION_REJECTED" ||
    e.info?.error?.code === 4001
  )
    return "rejected";
  if (e.code === "INSUFFICIENT_FUNDS") return "gasLow";
  if (["NETWORK_ERROR", "TIMEOUT", "SERVER_ERROR"].includes(String(e.code)))
    return "networkInterrupted";
  const name = e.revert?.name;
  const mappings: Record<string, string> = {
    Unauthorized: "unauthorized",
    InvalidConfig: "invalidProject",
    WrongState: "wrongState",
    InvalidAmount: "invalidAmount",
    TooEarly: "tooEarly",
    Expired: "expired",
    AlreadyVoted: "alreadyVoted",
    NotContributor: "notContributor",
    InvalidDelegate: "invalidDelegate",
    NothingToClaim: "nothingToClaim",
    InvalidEvidence: "invalidEvidence",
    EnforcedPause: "paused",
    FaucetCooldown: "cooldown",
  };
  if (name && mappings[name]) return mappings[name];
  const message = e.message || "";
  if (/FaucetCooldown/.test(message)) return "cooldown";
  if (/^[a-zA-Z]+$/.test(message)) return message;
  return "rpcError";
}
