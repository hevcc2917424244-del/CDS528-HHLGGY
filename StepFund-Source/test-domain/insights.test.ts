import test from "node:test";
import assert from "node:assert/strict";
import { seed, ACCOUNTS, transition, UNIT } from "../lib/stepfund/model";
import { funds, tasksFor } from "../lib/stepfund/insights";
import { previewType } from "../lib/stepfund/attachments";
const [alex, morgan] = ACCOUNTS.map((a) => a.address);
test("fund partition conserves raised tokens without double-counting approved escrow", () => {
  const state = seed();
  for (const p of state.projects) {
    const f = funds(p);
    assert.equal(
      f.locked + f.credit + f.refundable + f.withdrawn + f.refunded,
      p.raised,
    );
    assert.equal(f.escrow, f.locked + f.credit + f.refundable);
    assert.equal(f.approved, f.credit + f.withdrawn);
  }
  const p = { ...state.projects[2], withdrawn: 0, refunded: 150 * UNIT };
  const f = funds(p);
  assert.equal(f.credit, 200 * UNIT);
  assert.equal(f.refundable, 450 * UNIT);
  assert.equal(f.locked, 0);
});
test("tasks respect role, voted/claimed state, and exact deadline boundaries", () => {
  let state = seed(1000000);
  let tasks = tasksFor(state.projects, alex, state.now);
  assert.deepEqual(tasks.map((t) => t.kind).sort(), ["refund", "vote"]);
  assert.equal(tasksFor(state.projects, "", state.now).length, 0);
  state = transition(state, alex, {
    kind: "voteYes",
    projectId: "practice-maker",
  });
  state = transition(state, alex, {
    kind: "refund",
    projectId: "practice-air",
  });
  assert.equal(tasksFor(state.projects, alex, state.now).length, 0);
  const close = state.projects[0].stages[1].votingEnds;
  assert.ok(
    tasksFor(state.projects, alex, close).some((t) => t.kind === "settle"),
  );
  state.now = close;
  state = transition(state, alex, {
    kind: "settle",
    projectId: "practice-maker",
  });
  tasks = tasksFor(state.projects, morgan, state.now);
  assert.ok(
    tasks.some((t) => t.kind === "withdraw" && t.amount === 300 * UNIT),
  );
  assert.ok(tasks.some((t) => t.kind === "evidence"));
  const due = state.projects[0].stages[2].due;
  tasks = tasksFor(state.projects, morgan, due);
  assert.ok(tasks.some((t) => t.kind === "expire"));
  assert.ok(!tasks.some((t) => t.kind === "evidence"));
});
test("zero-rounded refunds are actionable and withdrawal/claims have no invented deadline", () => {
  const p = seed().projects[2];
  p.refundPool = 1;
  p.bondRefundPool = 0;
  p.refunded = 0;
  p.claimCount = 0;
  p.claims = [];
  const task = tasksFor([p], alex, Date.now() / 1000)[0];
  assert.equal(task.kind, "refund");
  assert.equal(task.amount, 0);
  assert.equal(task.deadline, undefined);
});
test("attachment preview refuses active HTML/SVG and sniffs raster signatures", () => {
  const b = new TextEncoder().encode('<svg onload="alert(1)"></svg>');
  assert.equal(previewType("proof.svg", b), null);
  assert.equal(previewType("fake.png", b), null);
  assert.equal(previewType("proof.html", b), null);
  assert.equal(previewType("proof.txt", b), "text");
  assert.equal(
    previewType("proof", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/png",
  );
});
