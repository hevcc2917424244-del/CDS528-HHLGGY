"use client";
import { CurrencyUnit } from "./currency";
import { useState } from "react";
import { ArrowUpRight, CheckCircle2, Clock, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { funds, tasksFor, type TaskKind } from "@/lib/stepfund/insights";
import { money, type Project } from "@/lib/stepfund/model";
import { dateTime, remaining, type Context, Empty } from "./shared";

const labels = {
  locked: ["Awaiting approval", "待批准资金"],
  credit: ["Ready to withdraw", "已批准待提取"],
  refundable: ["Ready to refund", "可退未领取"],
  withdrawn: ["Withdrawn", "已提取"],
  refunded: ["Refunded", "已退款"],
  invested: ["Principal in vault", "资金库本金"],
  loss: ["Loss / in-kind rescue", "亏损 / 转为救济份额"],
} as const;
const colors = {
  locked: "#748768",
  credit: "#817563",
  refundable: "#ba744b",
  withdrawn: "#294e3a",
  refunded: "#b4c09e",
  invested: "#548081",
  loss: "#a0473f",
};
const taskLabels: Record<TaskKind, [string, string]> = {
  vote: ["Review & vote", "审查并投票"],
  refund: ["Claim refund", "领取退款"],
  withdraw: ["Withdraw approved funds", "提取已批准资金"],
  withdrawBond: ["Withdraw returned bond", "提取退还保证金"],
  claimYield: ["Claim yield / rescue shares", "领取收益 / 救济份额"],
  attestPrivate: ["Review private evidence", "核查私密成果"],
  rescueTreasury: ["Review treasury recovery", "检查资金库救济"],
  evidence: ["Submit evidence", "提交阶段成果"],
  settle: ["Settle closed vote", "结算已结束投票"],
  finalize: ["Finalize funding", "结算募集结果"],
  expire: ["Open overdue refunds", "开放逾期退款"],
};

export function FundChart({
  projects,
  ctx,
}: {
  projects: Project[];
  ctx: Context;
}) {
  const { s, lang } = ctx;
  const total = projects
    .map(funds)
    .reduce(
      (a, b) =>
        Object.fromEntries(
          Object.keys(a).map((k) => [
            k,
            a[k as keyof typeof a] + b[k as keyof typeof b],
          ]),
        ) as ReturnType<typeof funds>,
      {
        raised: 0,
        approved: 0,
        escrow: 0,
        credit: 0,
        refundable: 0,
        locked: 0,
        withdrawn: 0,
        refunded: 0,
        invested: 0,
        loss: 0,
      },
    );
  return (
    <section
      className="panel fund-chart"
      aria-label={s("Fund distribution", "资金分布")}
    >
      <div className="insight-title">
        <div>
          <p className="eyebrow">
            {s("EVERY TOKEN ACCOUNTED FOR", "每一笔资金都有去向")}
          </p>
          <h2>{s("Where the funds are", "资金现在在哪里")}</h2>
        </div>
        <strong>
          {money(total.raised, lang)} <small><CurrencyUnit /></small>
        </strong>
      </div>
      <div
        className="fund-stack"
        role="img"
        aria-label={Object.entries(labels)
          .map(
            ([key, label]) =>
              `${s(label[0], label[1])}: ${money(total[key as keyof typeof total], lang)} tUSD`,
          )
          .join("; ")}
      >
        {total.raised === 0 ? (
          <span className="fund-zero" />
        ) : (
          Object.keys(labels).map((key) => (
            <span
              key={key}
              style={{
                width: `${(total[key as keyof typeof total] / total.raised) * 100}%`,
                background: colors[key as keyof typeof colors],
              }}
            />
          ))
        )}
      </div>
      <div className="fund-legend">
        {Object.entries(labels).map(([key, label]) => (
          <div key={key}>
            <span
              className="legend-dot"
              style={{ background: colors[key as keyof typeof colors] }}
            />
            <span>{s(label[0], label[1])}</span>
            <strong>
              {money(total[key as keyof typeof total], lang)}{" "}
              <small><CurrencyUnit /></small>
            </strong>
          </div>
        ))}
      </div>
      <div className="fund-equation">
        <span>
          {s("Still in escrow", "仍在托管")}{" "}
          <b>{money(total.escrow, lang)} <CurrencyUnit /></b>
        </span>
        <span>
          {s("Approved in total", "累计已批准")}{" "}
          <b>{money(total.approved, lang)} <CurrencyUnit /></b>
        </span>
      </div>
      <p className="muted text-sm">
        {s(
          "Escrow includes vault principal; it is not all immediately liquid. Chart segments partition the original contribution principal, including realized losses or principal exchanged for rescue shares. Yield and bonds have separate ledgers. Direct token donations are excluded.",
          "托管本金包括资金库内本金，并非全部可立即支取。图中区段划分原始出资本金，包括已实现亏损或转为救济份额的本金。收益与保证金另行记账，非出资的直接转账不计入。",
        )}
      </p>
      <p className="muted text-sm mt-2">
        {s(
          "This chart covers contribution principal. Bonds held separately",
          "图表统计出资本金。另行托管的保证金余额",
        )}
        :{" "}
        {money(
          projects.reduce(
            (n, p) =>
              n +
              p.bondLocked +
              p.bondCredit +
              p.bondRefundPool -
              p.bondDistributed,
            0,
          ),
          lang,
        )}{" "}
        <CurrencyUnit />.
        {s(
          " Open a project for its bond ledger.",
          " 打开项目可查看保证金明细。",
        )}
      </p>
    </section>
  );
}
export function Finance({
  projects,
  ctx,
  onOpen,
  totalCount,
}: {
  projects: Project[];
  ctx: Context;
  onOpen: (id: string) => void;
  totalCount: number;
}) {
  const { s, lang } = ctx;
  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {s("TRANSPARENT BY DESIGN", "看清每一笔去向")}
          </p>
          <h1>{s("Fund transparency", "资金透明看板")}</h1>
          <p>
            {s(
              "Follow contributions from escrow to an approved payout or a refund.",
              "从募集、托管到批准支付与退款，完整查看资金流向。",
            )}
          </p>
        </div>
      </div>
      <p className="scope-note">
        {ctx.mode === "chain"
          ? s(
              `Covers ${projects.length} of ${totalCount} projects loaded from this factory. Load more in Explore projects for a wider view.`,
              `统计当前工厂已加载的 ${projects.length} / ${totalCount} 个项目，可在发现项目中加载更多。`,
            )
          : s(
              "Practice data · all projects in this browser",
              "演示数据 · 当前浏览器中的全部项目",
            )}
      </p>
      <FundChart projects={projects} ctx={ctx} />
      <section className="panel">
        <h2>{s("Project balances", "项目资金明细")}</h2>
        <div className="table-scroll">
          <table className="insight-table">
            <thead>
              <tr>
                {[
                  s("Project", "项目"),
                  s("Raised", "已募集"),
                  s("Escrow", "托管"),
                  s("Approved", "累计批准"),
                  s("Withdrawn", "已提取"),
                  s("Refundable", "可退款"),
                  s("Refunded", "已退款"),
                ].map((t) => (
                  <th key={t}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const f = funds(p);
                return (
                  <tr key={p.id}>
                    <td>
                      <button
                        className="subtle-link"
                        onClick={() => onOpen(p.id)}
                      >
                        {p.title[lang]} <ArrowUpRight size={14} />
                      </button>
                    </td>
                    {[
                      f.raised,
                      f.escrow,
                      f.approved,
                      f.withdrawn,
                      f.refundable,
                      f.refunded,
                    ].map((n, i) => (
                      <td key={i}>{money(n, lang)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted text-xs mt-3">
          {s(
            "All amounts in tUSD. Only approved credit can be withdrawn by the creator; refunds are claimed by each eligible contributor.",
            "金额单位为 tUSD。创建者只能提取已批准额度，支持者分别领取各自可退金额。",
          )}
        </p>
      </section>
    </div>
  );
}
export function TaskCenter({
  projects,
  ctx,
  onOpen,
  totalCount,
}: {
  projects: Project[];
  ctx: Context;
  onOpen: (id: string) => void;
  totalCount: number;
}) {
  const { s, lang, actor, now } = ctx;
  const [filter, setFilter] = useState("all");
  const tasks = tasksFor(projects, actor, now);
  const visible = tasks.filter(
    (t) =>
      filter === "all" ||
      (filter === "deadline"
        ? !!t.deadline
        : t.kind === "refund" || t.kind === "withdraw"),
  );
  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{s("YOUR NEXT STEP", "你的下一步")}</p>
          <h1>{s("Action center", "统一待办中心")}</h1>
          <p>
            {s(
              "Tasks for the selected account, updated from project state. Open a project to review and confirm an action.",
              "按当前账户和项目状态更新；进入项目审查后再确认操作。",
            )}
          </p>
        </div>
        <div className="task-counter">
          <ListChecks />
          <strong>{tasks.length}</strong>
          <span>{s("available tasks", "项待办")}</span>
        </div>
      </div>
      {ctx.mode === "chain" && (
        <p className="scope-note">
          {s(
            `Based on ${projects.length} of ${totalCount} loaded projects. Times follow the latest read block.`,
            `基于已加载的 ${projects.length} / ${totalCount} 个项目，时间以最近读取的区块为准。`,
          )}
        </p>
      )}
      <div
        className="flex flex-wrap gap-2"
        aria-label={s("Task filters", "待办筛选")}
      >
        {[
          ["all", s("All tasks", "全部待办")],
          ["deadline", s("With a deadline", "有截止时间")],
          ["funds", s("Funds to claim", "待领取资金")],
        ].map(([key, label]) => (
          <Button
            key={key}
            variant={filter === key ? "default" : "outline"}
            onClick={() => setFilter(key)}
          >
            {label}
          </Button>
        ))}
      </div>
      {visible.length === 0 ? (
        <Empty
          title={s("You're all caught up", "当前筛选下没有待办")}
          description={s(
            "New tasks appear when your projects advance or deadlines pass.",
            "项目进入新阶段或到达截止时间后，相关待办将自动出现。",
          )}
        />
      ) : (
        <div className="task-list">
          {visible.map((t) => (
            <article className="panel task-card" key={t.id}>
              <div className="task-symbol">
                {t.deadline ? <Clock /> : <CheckCircle2 />}
              </div>
              <div>
                <h3>{s(...taskLabels[t.kind])}</h3>
                <p>{t.project.title[lang]}</p>
                <small
                  className={
                    t.deadline && t.deadline - now < 86400
                      ? "task-urgent"
                      : "muted"
                  }
                >
                  {t.deadline
                    ? `${s("Due", "截止")} ${dateTime(t.deadline, lang)} · ${remaining(t.deadline, now, s)}`
                    : t.availableSince
                      ? `${s("Available since", "可操作时间")} ${dateTime(t.availableSince, lang)}`
                      : s(
                          "Available now · no claim deadline",
                          "现在可操作 · 无领取截止时间",
                        )}
                </small>
                {t.amount !== undefined && (
                  <p className="task-value">{money(t.amount, lang)} <CurrencyUnit /></p>
                )}
                {["settle", "finalize", "expire"].includes(t.kind) && (
                  <small className="muted">
                    {s(
                      "Anyone can execute this settlement.",
                      "任何账户均可执行此结算。",
                    )}
                  </small>
                )}
              </div>
              <Button variant="outline" onClick={() => onOpen(t.project.id)}>
                {s("Review task", "查看并处理")}
                <ArrowUpRight size={15} />
              </Button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
