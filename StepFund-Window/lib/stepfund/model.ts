import { isAddress } from "ethers";
import { parseIPFS } from "./ipfs";
export const APPROVAL_PERCENT = 60,
  QUORUM_PERCENT = 70,
  BOND_PERCENT = 5;
export const requiredBond = (goal: number) =>
  Math.ceil((goal * BOND_PERCENT) / 100);
export type Lang = "en" | "zh";
export type Text = { en: string; zh: string };
export const text = (en: string, zh = en): Text => ({ en, zh });
export const UNIT = 1_000_000,
  DAY = 86400;
export type Category = "education" | "community" | "technology";
export type Stage = {
  title: Text;
  budget: number;
  due: number;
  state: "pending" | "voting" | "approved" | "rejected";
  evidence: string;
  digest: string;
  votingEnds: number;
  yes: number;
  no: number;
  voters: string[];
  delegates?: Record<string, string>;
  weights?: Record<string, number>;
};
export type Project = {
  advanced?: {
    vault: string; principal: number; loss: number; yieldPool: number;
    yieldDistributed: number; reward: string; shares: string; yieldClaimed: boolean;
    rescueShares: string; verifier: string; assessor: string;
    minimums: string[]; maximums: string[]; commitments: string[];
    digests: string[]; verified: boolean[];
  };
  id: string;
  title: Text;
  summary: Text;
  category: Category;
  creator: string;
  createdAt: number;
  fundingEnds: number;
  votingPeriod: number;
  goal: number;
  raised: number;
  released: number;
  withdrawn: number;
  refunded: number;
  refundPool: number;
  bondRequired: number;
  bondLocked: number;
  bondCredit: number;
  bondReturned: number;
  bondRefundPool: number;
  bondDistributed: number;
  contributorCount: number;
  claimCount: number;
  current: number;
  status: "funding" | "active" | "refunding" | "completed";
  paused: boolean;
  contributions: Record<string, number>;
  claims: string[];
  stages: Stage[];
};
export type Activity = {
  id: string;
  projectId: string;
  actor: string;
  kind: string;
  amount: number;
  time: number;
  hash?: string;
};
export type State = {
  version: 2;
  now: number;
  projects: Project[];
  balances: Record<string, number>;
  activity: Activity[];
  sequence: number;
};
export type Draft = {
  advanced?: { vault: string; verifier: string; assessor: string; minimums: string[]; maximums: string[] };
  title: string;
  summary: string;
  category: Category;
  fundingDays: number;
  votingDays: number;
  stages: { title: string; amount: string; days: number }[];
};
export const ACCOUNTS = [
  { address: "0x1000000000000000000000000000000000000001", name: "Alex" },
  { address: "0x2000000000000000000000000000000000000002", name: "Morgan" },
  { address: "0x3000000000000000000000000000000000000003", name: "Jordan" },
  { address: "0x4000000000000000000000000000000000000004", name: "Riley" },
];
export function amount(value: string): number {
  if (!/^(0|[1-9]\d{0,6})(\.\d{1,6})?$/.test(value.trim()))
    throw Error("invalidAmount");
  const [whole, frac = ""] = value.trim().split(".");
  const n = Number(BigInt(whole) * BigInt(UNIT) + BigInt(frac.padEnd(6, "0")));
  if (n <= 0 || n > 1_000_000 * UNIT) throw Error("invalidAmount");
  return n;
}
export const money = (n: number, lang: Lang = "en") =>
  new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-US", {
    maximumFractionDigits: 6,
  }).format(n / UNIT);
export const short = (s: string) =>
  s ? s.slice(0, 6) + "…" + s.slice(-4) : "—";
export const accountName = (s: string) =>
  ACCOUNTS.find((a) => a.address === s)?.name || short(s);
export function validEvidence(uri: string) {
  try {
    if (uri.startsWith("ipfs://")) {
      parseIPFS(uri);
      return true;
    }
    const u = new URL(uri);
    return (
      u.protocol === "https:" && !!u.hostname && !u.username && !u.password
    );
  } catch {
    return false;
  }
}
export function validateDraft(d: Draft) {
  const size = (s: string) => new TextEncoder().encode(s.trim()).length;
  if (
    size(d.title) === 0 ||
    size(d.title) > 120 ||
    size(d.summary) === 0 ||
    size(d.summary) > 1200 ||
    !["education", "community", "technology"].includes(d.category) ||
    !Number.isInteger(d.fundingDays) ||
    d.fundingDays < 1 ||
    d.fundingDays > 90 ||
    !Number.isInteger(d.votingDays) ||
    d.votingDays < 1 ||
    d.votingDays > 14 ||
    d.stages.length < 1 ||
    d.stages.length > 8
  )
    throw Error("invalidProject");
  let last = d.fundingDays;
  let total = 0;
  for (const s of d.stages) {
    if (
      size(s.title) === 0 ||
      size(s.title) > 120 ||
      !Number.isInteger(s.days) ||
      s.days < last + d.votingDays + 1 ||
      s.days > 729
    )
      throw Error("invalidSchedule");
    total += amount(s.amount);
    last = s.days;
  }
  if (total > 1_000_000 * UNIT) throw Error("invalidAmount");
  return total;
}
export function claimable(p: Project, actor: string) {
  if (
    p.status !== "refunding" ||
    p.claims.includes(actor) ||
    !p.contributions[actor]
  )
    return 0;
  if (p.claimCount + 1 === p.contributorCount) return p.refundPool - p.refunded;
  return Number(
    (BigInt(p.contributions[actor]) * BigInt(p.refundPool)) / BigInt(p.raised),
  );
}
export function bondShare(p: Project, actor: string) {
  if (
    p.status !== "refunding" ||
    p.claims.includes(actor) ||
    !p.contributions[actor]
  )
    return 0;
  if (p.claimCount + 1 === p.contributorCount)
    return p.bondRefundPool - p.bondDistributed;
  return Number(
    (BigInt(p.contributions[actor]) * BigInt(p.bondRefundPool)) /
      BigInt(p.raised),
  );
}
export function votingWeight(p: Project, actor: string) {
  const stage = p.stages[p.current];
  if (!stage || stage.delegates?.[actor]) return 0;
  if (stage.weights) return stage.weights[actor] || 0;
  return (
    (p.contributions[actor] || 0) +
    Object.entries(stage.delegates || {}).reduce(
      (n, [from, to]) => n + (to === actor ? p.contributions[from] || 0 : 0),
      0,
    )
  );
}
export function participated(p: Project, actor: string) {
  const stage = p.stages[p.current];
  return (
    !!stage &&
    (stage.voters.includes(actor) ||
      stage.voters.includes(stage.delegates?.[actor] || ""))
  );
}
export function seed(now = Math.floor(Date.now() / 1000)): State {
  const [a, b, c, d] = ACCOUNTS.map((x) => x.address);
  const stage = (
    en: string,
    zh: string,
    budget: number,
    days: number,
  ): Stage => ({
    title: text(en, zh),
    budget: budget * UNIT,
    due: now + days * DAY,
    state: "pending",
    evidence: "",
    digest: "",
    votingEnds: 0,
    yes: 0,
    no: 0,
    voters: [],
  });
  const base = {
    creator: b,
    createdAt: now - 7 * DAY,
    votingPeriod: 2 * DAY,
    refunded: 0,
    refundPool: 0,
    contributorCount: 3,
    claimCount: 0,
    current: 0,
    paused: false,
    claims: [] as string[],
    bondCredit: 0,
    bondReturned: 0,
    bondRefundPool: 0,
    bondDistributed: 0,
  };
  const p1: Project = {
    ...base,
    id: "practice-maker",
    title: text("Campus Maker Space", "校园共享创客空间"),
    summary: text(
      "A shared workshop where students turn ideas into working prototypes. Funding covers essential tools, safe workstations, and open community sessions.",
      "让学生将创意转化为实物的共享工作室。资金用于基础工具、安全工作台和社区开放课程。",
    ),
    category: "technology",
    fundingEnds: now - DAY,
    goal: 1000 * UNIT,
    bondRequired: 50 * UNIT,
    bondLocked: 50 * UNIT,
    raised: 1000 * UNIT,
    released: 200 * UNIT,
    withdrawn: 200 * UNIT,
    current: 1,
    status: "active",
    contributions: { [a]: 400 * UNIT, [c]: 350 * UNIT, [d]: 250 * UNIT },
    stages: [
      stage("Workspace & safety plan", "空间与安全方案", 200, 1),
      stage("Tools & workstations", "工具与工作台", 300, 7),
      stage("Community launch", "社区开放日", 500, 14),
    ],
  };
  p1.stages[0] = {
    ...p1.stages[0],
    state: "approved",
    yes: 750 * UNIT,
    voters: [a, c],
  };
  p1.stages[1] = {
    ...p1.stages[1],
    state: "voting",
    evidence: "https://example.com/",
    digest: "0x" + "11".repeat(32),
    votingEnds: now + DAY,
    yes: 350 * UNIT,
    voters: [c],
  };
  const p2: Project = {
    ...base,
    id: "practice-library",
    title: text("Open Community Library", "社区开放图书馆"),
    summary: text(
      "A welcoming space for books, learning, and stronger neighborhoods. Help equip reading areas, build a shared collection, and host the first workshops.",
      "为阅读、学习和邻里交流打造开放空间。一起建设阅读区、共享藏书并举办第一批工作坊。",
    ),
    category: "education",
    fundingEnds: now + 5 * DAY,
    goal: 2400 * UNIT,
    bondRequired: 120 * UNIT,
    bondLocked: 120 * UNIT,
    raised: 960 * UNIT,
    released: 0,
    withdrawn: 0,
    status: "funding",
    contributorCount: 2,
    contributions: { [a]: 240 * UNIT, [c]: 720 * UNIT },
    stages: [
      stage("Reading room", "阅读空间", 600, 10),
      stage("Books & equipment", "图书与设备", 1000, 17),
      stage("Learning workshops", "学习工作坊", 800, 24),
    ],
  };
  const p3: Project = {
    ...base,
    id: "practice-air",
    title: text("Open Air Quality Network", "开放空气质量网络"),
    summary: text(
      "Community-owned sensors making neighborhood air quality visible. The second milestone was rejected. Backers can recover their share of the unreleased balance.",
      "通过社区共建的传感器了解空气质量。第二阶段未通过投票，支持者可以领取未释放余额中的应退部分。",
    ),
    category: "community",
    fundingEnds: now - 5 * DAY,
    goal: 800 * UNIT,
    bondRequired: 40 * UNIT,
    bondLocked: 0,
    bondRefundPool: 40 * UNIT,
    raised: 800 * UNIT,
    released: 200 * UNIT,
    withdrawn: 200 * UNIT,
    refundPool: 600 * UNIT,
    current: 1,
    status: "refunding",
    contributions: { [a]: 200 * UNIT, [c]: 400 * UNIT, [d]: 200 * UNIT },
    stages: [
      stage("Sensor prototype", "传感器原型", 200, -3),
      stage("Pilot installation", "试点安装", 300, 3),
      stage("Public data portal", "公开数据平台", 300, 10),
    ],
  };
  p3.stages[0].state = "approved";
  p3.stages[1].state = "rejected";
  return {
    version: 2,
    now,
    projects: [p1, p2, p3],
    balances: Object.fromEntries(ACCOUNTS.map((x) => [x.address, 5000 * UNIT])),
    activity: [
      {
        id: "sample",
        projectId: p1.id,
        actor: c,
        kind: "voteYes",
        amount: 350 * UNIT,
        time: now - 3600,
      },
    ],
    sequence: 1,
  };
}
export type Action = {
  kind:
    | "contribute"
    | "finalize"
    | "evidence"
    | "voteYes"
    | "voteNo"
    | "settle"
    | "expire"
    | "refund"
    | "withdraw"
    | "withdrawBond"
    | "delegate"
    | "investTreasury"
    | "rescueTreasury"
    | "claimYield"
    | "attestPrivate"
    | "privateEvidence"
    | "pause"
    | "unpause"
    | "create"
    | "faucet"
    | "advance";
  projectId?: string;
  value?: number;
  uri?: string;
  digest?: string;
  recipient?: string;
  draft?: Draft;
  commitment?: string;
  proof?: string[];
  signals?: string[];
  stage?: number;
};
export function transition(state: State, actor: string, action: Action): State {
  if (["investTreasury", "rescueTreasury", "claimYield", "attestPrivate", "privateEvidence"].includes(action.kind) || action.draft?.advanced) throw Error("chainFeature");
  const n = structuredClone(state);
  const { kind } = action;
  const requireThat = (condition: unknown, key = "wrongState") => {
    if (!condition) throw Error(key);
  };
  if (kind === "advance") {
    n.now += DAY;
    return n;
  }
  if (kind === "faucet") {
    n.balances[actor] = (n.balances[actor] || 0) + 1000 * UNIT;
    return n;
  }
  if (kind === "create") {
    const d = action.draft!;
    const goal = validateDraft(d);
    const bond = requiredBond(goal);
    requireThat((n.balances[actor] || 0) >= bond, "balanceLow");
    n.balances[actor] -= bond;
    const id = "practice-" + ++n.sequence;
    n.projects.unshift({
      id,
      title: text(d.title.trim()),
      summary: text(d.summary.trim()),
      creator: actor,
      category: d.category,
      createdAt: n.now,
      fundingEnds: n.now + d.fundingDays * DAY,
      votingPeriod: d.votingDays * DAY,
      goal,
      raised: 0,
      released: 0,
      withdrawn: 0,
      refunded: 0,
      refundPool: 0,
      bondRequired: bond,
      bondLocked: bond,
      bondCredit: 0,
      bondReturned: 0,
      bondRefundPool: 0,
      bondDistributed: 0,
      contributorCount: 0,
      claimCount: 0,
      current: 0,
      status: "funding",
      paused: false,
      contributions: {},
      claims: [],
      stages: d.stages.map((s) => ({
        title: text(s.title.trim()),
        budget: amount(s.amount),
        due: n.now + s.days * DAY,
        state: "pending",
        evidence: "",
        digest: "",
        votingEnds: 0,
        yes: 0,
        no: 0,
        voters: [],
      })),
    });
    n.activity.unshift({
      id: String(++n.sequence),
      projectId: id,
      actor,
      kind,
      amount: 0,
      time: n.now,
    });
    return n;
  }
  const p = n.projects.find((p) => p.id === action.projectId);
  requireThat(p, "notFound");
  if (!p) return n;
  const s = p.stages[p.current];
  let moved = 0;
  const resolveBond = (slash: boolean) => {
    if (slash) p.bondRefundPool = p.bondLocked;
    else p.bondCredit = p.bondLocked;
    p.bondLocked = 0;
  };
  const refund = (slash = false) => {
    p.status = "refunding";
    p.refundPool = p.raised - p.released;
    resolveBond(slash);
  };
  if (kind === "contribute") {
    const v = action.value || 0;
    requireThat(p.status === "funding" && !p.paused);
    requireThat(n.now < p.fundingEnds, "expired");
    requireThat(
      Number.isSafeInteger(v) && v > 0 && v <= p.goal - p.raised,
      "invalidAmount",
    );
    requireThat((n.balances[actor] || 0) >= v, "balanceLow");
    if (!p.contributions[actor]) p.contributorCount++;
    p.contributions[actor] = (p.contributions[actor] || 0) + v;
    p.raised += v;
    n.balances[actor] -= v;
    moved = v;
  }
  if (kind === "finalize") {
    requireThat(p.status === "funding");
    requireThat(p.raised === p.goal || n.now >= p.fundingEnds, "tooEarly");
    if (p.raised === p.goal) p.status = "active";
    else refund();
  }
  if (kind === "evidence") {
    requireThat(actor === p.creator, "unauthorized");
    requireThat(p.status === "active" && s.state === "pending");
    requireThat(n.now < s.due, "expired");
    requireThat(
      action.uri &&
        validEvidence(action.uri) &&
        new TextEncoder().encode(action.uri).length <= 500 &&
        /^0x[0-9a-fA-F]{64}$/.test(action.digest || "") &&
        action.digest !== "0x" + "0".repeat(64),
      "invalidEvidence",
    );
    s.evidence = action.uri!;
    s.digest = action.digest!;
    s.state = "voting";
    s.votingEnds = n.now + p.votingPeriod;
  }
  if (kind === "voteYes" || kind === "voteNo") {
    requireThat(p.status === "active" && s.state === "voting");
    requireThat(n.now < s.votingEnds, "expired");
    requireThat(votingWeight(p, actor) > 0, "notContributor");
    requireThat(!s.voters.includes(actor), "alreadyVoted");
    s.voters.push(actor);
    moved = votingWeight(p, actor);
    if (kind === "voteYes") s.yes += moved;
    else s.no += moved;
  }
  if (kind === "settle") {
    requireThat(p.status === "active" && s.state === "voting");
    requireThat(n.now >= s.votingEnds, "tooEarly");
    const quorum = (s.yes + s.no) * 100 >= p.raised * QUORUM_PERCENT;
    if (quorum && s.yes * 100 >= p.raised * APPROVAL_PERCENT) {
      s.state = "approved";
      p.released += s.budget;
      p.current++;
      moved = s.budget;
      if (p.current === p.stages.length) {
        p.status = "completed";
        resolveBond(false);
      }
    } else {
      s.state = "rejected";
      refund(quorum);
    }
  }
  if (kind === "expire") {
    requireThat(p.status === "active" && s.state === "pending");
    requireThat(n.now >= s.due, "tooEarly");
    s.state = "rejected";
    refund(true);
  }
  if (kind === "refund") {
    requireThat(p.status === "refunding");
    requireThat(
      p.contributions[actor] > 0 && !p.claims.includes(actor),
      "nothingToClaim",
    );
    moved = claimable(p, actor);
    const bonus = bondShare(p, actor);
    p.claims.push(actor);
    p.claimCount++;
    p.refunded += moved;
    p.bondDistributed += bonus;
    moved += bonus;
    n.balances[actor] = (n.balances[actor] || 0) + moved;
  }
  if (kind === "withdraw") {
    requireThat(actor === p.creator, "unauthorized");
    moved = p.released - p.withdrawn;
    requireThat(moved > 0, "nothingToClaim");
    p.withdrawn += moved;
    n.balances[actor] = (n.balances[actor] || 0) + moved;
  }
  if (kind === "withdrawBond") {
    requireThat(actor === p.creator, "unauthorized");
    moved = p.bondCredit;
    requireThat(moved > 0, "nothingToClaim");
    p.bondCredit = 0;
    p.bondReturned += moved;
    n.balances[actor] = (n.balances[actor] || 0) + moved;
  }
  if (kind === "delegate") {
    requireThat(
      (p.status === "funding" || p.status === "active") &&
        s.state === "pending",
    );
    requireThat(n.now < s.due, "expired");
    requireThat(p.contributions[actor] > 0, "notContributor");
    const to = (action.recipient || "").toLowerCase();
    requireThat(!to || isAddress(to), "invalidDelegate");
    const target = /^0x0{40}$/.test(to) ? "" : to;
    const delegates = (s.delegates ||= {});
    requireThat(
      target !== actor &&
        !Object.values(delegates).includes(actor) &&
        (!target || !delegates[target]),
      "invalidDelegate",
    );
    if (target) delegates[actor] = target;
    else delete delegates[actor];
  }
  if (kind === "pause" || kind === "unpause") {
    requireThat(actor === p.creator, "unauthorized");
    requireThat(p.status === "funding");
    p.paused = kind === "pause";
  }
  n.activity.unshift({
    id: String(++n.sequence),
    projectId: p.id,
    actor,
    kind,
    amount: moved,
    time: n.now,
  });
  return n;
}
