"use client";
import { CurrencyUnit } from "./currency";
import { useState } from "react";
import { Plus, Trash2, LockKeyhole, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  amount,
  money,
  validateDraft,
  requiredBond,
  type Draft,
  type Category,
} from "@/lib/stepfund/model";
import { type Context, Picker, ConfirmButton } from "./shared";
import { AdvancedFields } from "./advanced";
import { validateAdvanced } from "@/lib/stepfund/privacy";
export function CreateProject({ ctx }: { ctx: Context }) {
  const { s, lang, busy } = ctx;
  const [draft, setDraft] = useState<Draft>({
    title: "",
    summary: "",
    category: "community",
    fundingDays: 5,
    votingDays: 2,
    stages: [
      { title: "", amount: "200", days: 10 },
      { title: "", amount: "300", days: 17 },
      { title: "", amount: "500", days: 24 },
    ],
  });
  const [review, setReview] = useState(false);
  const update = (key: keyof Draft, value: unknown) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setReview(false);
  };
  const stage = (i: number, key: string, value: unknown) => {
    setDraft((d) => ({
      ...d,
      stages: d.stages.map((m, j) => (j === i ? { ...m, [key]: value } : m)),
    }));
    setReview(false);
  };
  const total = draft.stages.reduce((sum, m) => {
    try {
      return sum + amount(m.amount);
    } catch {
      return sum;
    }
  }, 0);
  const check = () => {
    try {
      validateDraft(draft);
      validateAdvanced(draft.advanced, draft.stages.length, ctx.actor);
      setReview(true);
    } catch (e) {
      ctx.notifyError((e as Error).message);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {s("SET CLEAR EXPECTATIONS", "清晰约定，共同监督")}
          </p>
          <h1>
            {s("Build your project, step by step.", "逐步构建你的项目。")}
          </h1>
          <p>
            {s(
              "Define the budget and evidence deadlines before accepting contributions.",
              "在接受出资之前，明确每阶段预算与成果提交截止时间。",
            )}
          </p>
        </div>
      </div>
      <div className="detail-grid">
        <div className="space-y-6">
          <section className="panel">
            <h2>{s("01 · Project basics", "01 · 项目基本信息")}</h2>
            <label className="field">
              {s("Project title", "项目名称")}
              <Input
                value={draft.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder={s(
                  "Give your idea a clear name",
                  "为你的创意取一个清晰的名称",
                )}
                maxLength={120}
              />
            </label>
            <label className="field">
              {s("What will this project deliver?", "项目计划实现什么？")}
              <Textarea
                rows={4}
                value={draft.summary}
                onChange={(e) => update("summary", e.target.value)}
                placeholder={s(
                  "Describe the problem, the outcome, and who benefits.",
                  "说明要解决的问题、预期成果和受益人群。",
                )}
                maxLength={1200}
              />
            </label>
            <div className="form-grid">
              <div className="field">
                <span>{s("Category", "类别")}</span>
                <Picker
                  label={s("Category", "类别")}
                  value={draft.category}
                  onChange={(v) => update("category", v as Category)}
                  items={[
                    { value: "community", label: s("Community", "社区") },
                    { value: "education", label: s("Education", "教育") },
                    { value: "technology", label: s("Technology", "科技") },
                  ]}
                />
              </div>
              <label className="field">
                {s("Funding window (days)", "募资期限（天）")}
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={draft.fundingDays}
                  onChange={(e) =>
                    update("fundingDays", Number(e.target.value))
                  }
                />
              </label>
            </div>
          </section>
          <section className="panel">
            <div className="flex items-center justify-between gap-3">
              <h2>{s("02 · Milestones", "02 · 阶段规划")}</h2>
              <span className="muted">{draft.stages.length} / 8</span>
            </div>
            <p className="muted mb-5">
              {s(
                "Due days count from creation. Leave at least voting days + 1 between deadlines.",
                "截止天数从项目创建时起算，相邻截止日至少间隔“投票天数＋1”天。",
              )}
            </p>
            <label className="field max-w-64">
              {s("Voting window per milestone (days)", "每阶段投票期（天）")}
              <Input
                type="number"
                min={1}
                max={14}
                value={draft.votingDays}
                onChange={(e) => update("votingDays", Number(e.target.value))}
              />
            </label>
            {draft.stages.map((m, i) => (
              <div className="stage-editor" key={i}>
                <div className="stage-index">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="flex-1 min-w-0">
                  <label className="field">
                    {s("Milestone title", "阶段名称")} {i + 1}
                    <Input
                      aria-label={`${s("Milestone title", "阶段名称")} ${i + 1}`}
                      value={m.title}
                      onChange={(e) => stage(i, "title", e.target.value)}
                      maxLength={120}
                    />
                  </label>
                  <div className="form-grid">
                    <label className="field">
                      {s("Budget (tUSD)", "预算（tUSD）")}
                      <Input
                        aria-label={`${s("Budget", "预算")} ${i + 1}`}
                        inputMode="decimal"
                        value={m.amount}
                        onChange={(e) => stage(i, "amount", e.target.value)}
                      />
                    </label>
                    <label className="field">
                      {s("Evidence due (day)", "成果截止（第几天）")}
                      <Input
                        aria-label={`${s("Evidence due day", "成果截止天数")} ${i + 1}`}
                        type="number"
                        min={1}
                        max={729}
                        value={m.days}
                        onChange={(e) =>
                          stage(i, "days", Number(e.target.value))
                        }
                      />
                    </label>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${s("Remove milestone", "删除阶段")} ${i + 1}`}
                  disabled={draft.stages.length === 1}
                  onClick={() =>
                    update(
                      "stages",
                      draft.stages.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              disabled={draft.stages.length === 8}
              onClick={() =>
                update("stages", [
                  ...draft.stages,
                  {
                    title: "",
                    amount: "100",
                    days:
                      (draft.stages.at(-1)?.days || draft.fundingDays) +
                      draft.votingDays +
                      5,
                  },
                ])
              }
            >
              <Plus size={16} />
              {s("Add milestone", "添加阶段")}
            </Button>
          </section>
          <AdvancedFields draft={draft} update={update} ctx={ctx} />
        </div>
        <aside className="space-y-5">
          <section className="panel summary-panel">
            <LockKeyhole size={24} />
            <h2>{s("Funding terms", "募资条款")}</h2>
            <div className="large-amount">
              {money(total, lang)} <small><CurrencyUnit /></small>
            </div>
            <p className="muted">
              {s(
                "Total goal = sum of milestone budgets",
                "目标金额＝全部阶段预算之和",
              )}
            </p>
            <dl className="facts">
              <div>
                <dt>{s("Creator bond (5%)", "项目方保证金（5%）")}</dt>
                <dd>{money(requiredBond(total), lang)} <CurrencyUnit /></dd>
              </div>
              <div>
                <dt>{s("Minimum participation", "最低投票参与率")}</dt>
                <dd>70%</dd>
              </div>
              <div>
                <dt>{s("Approval threshold", "批准门槛")}</dt>
                <dd>60%</dd>
              </div>
              <div>
                <dt>{s("Voting weight", "投票权重")}</dt>
                <dd>{s("Original contribution", "原始出资额")}</dd>
              </div>
              <div>
                <dt>{s("Platform fee", "平台费用")}</dt>
                <dd>0%</dd>
              </div>
              <div>
                <dt>{s("Refund scope", "退款范围")}</dt>
                <dd>{s("Unreleased funds", "未释放资金")}</dd>
              </div>
            </dl>
            <p className="callout">
              {s(
                "Budgets, deadlines, and voting rules become immutable after creation. A rejected or expired milestone ends the project and opens refunds.",
                "创建后预算、截止时间和投票规则不可修改。任一阶段未通过或逾期，将终止项目并开放退款。",
              )}
            </p>
            {!review ? (
              <Button className="w-full" disabled={busy} onClick={check}>
                {s("Review project", "检查项目")}
                <ArrowRight size={16} />
              </Button>
            ) : (
              <>
                <p className="success-text">
                  {s(
                    "All fields checked. Ready to create.",
                    "信息检查通过，可以创建。",
                  )}
                </p>
                <ConfirmButton
                  s={s}
                  label={s("Create project", "创建项目")}
                  disabled={busy}
                  description={s(
                    `Create ${draft.title} with a total budget of ${money(total)} tUSD and deposit ${money(requiredBond(total))} tUSD of your own funds as a bond? Missing evidence or a rejection with quorum forfeits the bond. These terms cannot be edited.`,
                    `创建“${draft.title}”，总预算 ${money(total, "zh")} tUSD，并另缴 ${money(requiredBond(total), "zh")} tUSD 保证金？成果逾期或达到参与率但阶段未通过将罚没保证金；创建后条款不可修改。`,
                  )}
                  onConfirm={() => void ctx.act({ kind: "create", draft })}
                />
              </>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
