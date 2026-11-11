import {
  claimable,
  bondShare,
  votingWeight,
  participated,
  type Project,
} from "./model";

export function funds(p: Project) {
  const credit = p.released - p.withdrawn;
  const refundable = p.status === "refunding" ? p.refundPool - p.refunded : 0;
  const loss = p.advanced?.loss || 0;
  const invested = p.advanced?.principal || 0;
  const escrow = p.raised - p.withdrawn - p.refunded - loss;
  return {
    raised: p.raised,
    approved: p.released,
    escrow,
    credit,
    refundable,
    locked: escrow - credit - refundable - invested,
    invested,
    loss,
    withdrawn: p.withdrawn,
    refunded: p.refunded,
  };
}
export type TaskKind =
  | "vote"
  | "refund"
  | "withdraw"
  | "withdrawBond"
  | "claimYield"
  | "attestPrivate"
  | "rescueTreasury"
  | "evidence"
  | "settle"
  | "finalize"
  | "expire";
export type Task = {
  id: string;
  project: Project;
  kind: TaskKind;
  deadline?: number;
  availableSince?: number;
  amount?: number;
};
export function tasksFor(
  projects: Project[],
  actor: string,
  now: number,
): Task[] {
  if (!actor) return [];
  const result: Task[] = [];
  for (const p of projects) {
    const add = (kind: TaskKind, more: Partial<Task> = {}) =>
      result.push({ id: `${p.id}-${kind}`, project: p, kind, ...more });
    if (p.creator === actor && p.released > p.withdrawn)
      add("withdraw", { amount: p.released - p.withdrawn });
    if (p.creator === actor && p.bondCredit > 0)
      add("withdrawBond", { amount: p.bondCredit });
    if (p.advanced) {
      const a = p.advanced;
      if (p.status !== "funding" && p.contributions[actor] > 0 && !a.yieldClaimed && (a.yieldPool > 0 || a.rescueShares !== "0")) add("claimYield", { amount: Number(a.reward) });
      if (p.status === "funding" && a.principal > 0 && now >= p.fundingEnds + 7 * 86400) add("rescueTreasury", { availableSince: p.fundingEnds + 7 * 86400 });
      if (p.status === "active" && p.stages[p.current]?.state === "pending" && now < p.stages[p.current].due && a.assessor === actor && a.commitments[p.current] === "0") add("attestPrivate", { deadline: p.stages[p.current].due });
    }
    // A zero-rounded claim still advances the last-claimant dust allocation.
    if (
      p.status === "refunding" &&
      p.contributions[actor] > 0 &&
      !p.claims.includes(actor)
    )
      add("refund", { amount: claimable(p, actor) + bondShare(p, actor) });
    if (p.status === "funding" && (p.raised >= p.goal || now >= p.fundingEnds))
      add("finalize", {
        availableSince: now >= p.fundingEnds ? p.fundingEnds : undefined,
      });
    const stage = p.stages[p.current];
    if (p.status !== "active" || !stage) continue;
    if (stage.state === "voting") {
      if (now >= stage.votingEnds)
        add("settle", { availableSince: stage.votingEnds });
      else if (votingWeight(p, actor) > 0 && !participated(p, actor))
        add("vote", { deadline: stage.votingEnds });
    }
    if (stage.state === "pending") {
      if (now >= stage.due) add("expire", { availableSince: stage.due });
      else if (p.creator === actor) add("evidence", { deadline: stage.due });
    }
  }
  return result.sort(
    (a, b) =>
      (a.deadline ?? a.availableSince ?? Infinity) -
        (b.deadline ?? b.availableSince ?? Infinity) ||
      a.id.localeCompare(b.id),
  );
}
