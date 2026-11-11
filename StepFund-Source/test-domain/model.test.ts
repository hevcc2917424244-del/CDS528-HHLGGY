import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  transition,
  ACCOUNTS,
  UNIT,
  amount,
  claimable,
  validateDraft,
  validEvidence,
  type Draft,
} from "../lib/stepfund/model";
const [a, b, c] = ACCOUNTS.map((a) => a.address);
test("six decimal parsing is exact and rejects ambiguous or unsafe values", () => {
  assert.equal(amount("12.000001"), 12000001);
  for (const bad of ["1e3", "-1", "0", "01", "1.1234567", "1000001", "NaN"])
    assert.throws(() => amount(bad));
});
test("practice voting uses the same total-stake threshold and prevents repeats", () => {
  let s = seed(1000000);
  s = transition(s, a, { kind: "voteYes", projectId: "practice-maker" });
  assert.throws(
    () => transition(s, a, { kind: "voteNo", projectId: "practice-maker" }),
    /alreadyVoted/,
  );
  s = transition(s, a, { kind: "advance" });
  s = transition(s, a, { kind: "settle", projectId: "practice-maker" });
  assert.equal(s.projects[0].released, 500 * UNIT);
  assert.equal(s.projects[0].current, 2);
});
test("practice refunds recover only unreleased amounts and persist no repeated claim", () => {
  const s = seed();
  assert.equal(claimable(s.projects[2], a), 150 * UNIT);
  const next = transition(s, a, { kind: "refund", projectId: "practice-air" });
  assert.equal(next.balances[a], 5160 * UNIT); // 150 principal + 10 bond compensation
  assert.equal(claimable(next.projects[2], a), 0);
  assert.throws(() =>
    transition(next, a, { kind: "refund", projectId: "practice-air" }),
  );
  assert.equal(s.balances[a], 5000 * UNIT);
});
test("failed funding can be finalized and refunded after advancing time", () => {
  let s = seed();
  for (let i = 0; i < 5; i++) s = transition(s, a, { kind: "advance" });
  s = transition(s, a, { kind: "finalize", projectId: "practice-library" });
  assert.equal(s.projects[1].status, "refunding");
  s = transition(s, a, { kind: "refund", projectId: "practice-library" });
  assert.equal(s.balances[a], 5240 * UNIT);
});
test("practice role enforcement, evidence validation and no mainnet artifacts", () => {
  const s = seed();
  assert.throws(
    () => transition(s, a, { kind: "withdraw", projectId: "practice-maker" }),
    /unauthorized/,
  );
  assert.equal(s.activity[0].hash, undefined);
  assert.equal(validEvidence("javascript:alert(1)"), false);
  assert.equal(validEvidence("https://user:pass@example.com"), false);
  assert.equal(validEvidence("https://example.com/evidence"), true);
});
test("project validation enforces schedule, amount and byte limits", () => {
  const draft: Draft = {
    title: "Test",
    summary: "A real description",
    category: "community",
    fundingDays: 2,
    votingDays: 1,
    stages: [{ title: "First", amount: "100", days: 5 }],
  };
  assert.equal(validateDraft(draft), 100 * UNIT);
  assert.throws(() => validateDraft({ ...draft, title: "中".repeat(41) }));
  assert.throws(() =>
    validateDraft({
      ...draft,
      stages: [{ title: "bad", amount: "100", days: 3 }],
    }),
  );
  const s = transition(seed(), b, { kind: "create", draft });
  assert.equal(s.projects[0].goal, 100 * UNIT);
  assert.equal(s.projects[0].creator, b);
});
test("practice pause does not obstruct a failed-funding refund", () => {
  let s = transition(seed(), b, {
    kind: "pause",
    projectId: "practice-library",
  });
  assert.throws(() =>
    transition(s, c, {
      kind: "contribute",
      projectId: "practice-library",
      value: UNIT,
    }),
  );
  for (let i = 0; i < 5; i++) s = transition(s, a, { kind: "advance" });
  s = transition(s, a, { kind: "finalize", projectId: "practice-library" });
  s = transition(s, a, { kind: "refund", projectId: "practice-library" });
  assert.equal(s.projects[1].claims.includes(a), true);
});
