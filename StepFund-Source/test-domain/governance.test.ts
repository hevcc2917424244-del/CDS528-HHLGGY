import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNTS,
  seed,
  transition,
  votingWeight,
  bondShare,
  UNIT,
  type Action,
  type State,
} from "../lib/stepfund/model";
import { tasksFor } from "../lib/stepfund/insights";
const [a, creator, c, d] = ACCOUNTS.map((x) => x.address);
function apply(
  state: State,
  actor: string,
  kind: Action["kind"],
  more: Partial<Action> = {},
) {
  return transition(state, actor, {
    kind,
    projectId: state.projects[1].id,
    ...more,
  });
}
test("practice creation charges the 5% bond separately and refuses insufficient balance", () => {
  const state = seed();
  const draft = {
    title: "Test",
    summary: "Evidence",
    category: "community" as const,
    fundingDays: 1,
    votingDays: 1,
    stages: [{ title: "One", amount: "100", days: 4 }],
  };
  const next = transition(state, creator, { kind: "create", draft });
  assert.equal(next.balances[creator], state.balances[creator] - 5 * UNIT);
  assert.equal(next.projects[0].raised, 0);
  assert.equal(next.projects[0].bondLocked, 5 * UNIT);
  state.balances[creator] = 0;
  assert.throws(
    () => transition(state, creator, { kind: "create", draft }),
    /balanceLow/,
  );
});
test("practice delegation follows new contributions, blocks chains and permits revocation", () => {
  let state = seed();
  state = apply(state, a, "delegate", { recipient: d });
  assert.equal(votingWeight(state.projects[1], a), 0);
  assert.equal(votingWeight(state.projects[1], d), 240 * UNIT);
  state = apply(state, a, "contribute", { value: 10 * UNIT });
  assert.equal(votingWeight(state.projects[1], d), 250 * UNIT);
  assert.throws(
    () => apply(state, c, "delegate", { recipient: a }),
    /invalidDelegate/,
  );
  state = apply(state, a, "delegate", { recipient: "" });
  assert.equal(votingWeight(state.projects[1], a), 250 * UNIT);
  assert.equal(votingWeight(state.projects[1], d), 0);
});
test("practice participation gates approval and abstention returns the bond", () => {
  let state = seed();
  const p = state.projects[0];
  p.stages[1].yes = 600 * UNIT;
  p.stages[1].no = 0;
  state.now = p.stages[1].votingEnds;
  state = transition(state, a, { kind: "settle", projectId: p.id });
  assert.equal(state.projects[0].status, "refunding");
  assert.equal(state.projects[0].bondCredit, 50 * UNIT);
  assert.equal(state.projects[0].bondRefundPool, 0);
  assert.ok(
    tasksFor(state.projects, creator, state.now).some(
      (t) => t.kind === "withdrawBond",
    ),
  );
  state = transition(state, creator, { kind: "withdrawBond", projectId: p.id });
  assert.equal(state.projects[0].bondReturned, 50 * UNIT);
});
test("practice claims conserve principal and bond compensation separately", () => {
  let state = seed();
  const id = state.projects[2].id;
  assert.equal(bondShare(state.projects[2], a), 10 * UNIT);
  for (const actor of [c, a, d])
    state = transition(state, actor, { kind: "refund", projectId: id });
  assert.equal(state.projects[2].refunded, 600 * UNIT);
  assert.equal(state.projects[2].bondDistributed, 40 * UNIT);
});
