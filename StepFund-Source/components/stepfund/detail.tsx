"use client";
import { CurrencyUnit } from "./currency";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Clock,
  FileCheck2,
  LockKeyhole,
  ShieldCheck,
  Users,
  Vote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  amount,
  money,
  claimable,
  bondShare,
  votingWeight,
  participated,
  short,
  accountName,
  type Project,
} from "@/lib/stepfund/model";
import { hashEvidence } from "@/lib/stepfund/chain";
import { saveAttachment } from "@/lib/stepfund/attachments";
import { Attachments, evidenceScope } from "./attachments";
import { FundChart } from "./insights";
import { IPFSPreview } from "./ipfs";
import { ProjectCover } from "./identity";
import { AdvancedProject } from "./advanced";
import {
  type Context,
  Amount,
  ConfirmButton,
  dateTime,
  remaining,
  statusLabel,
  categoryLabel,
  stageLabel,
  evidenceLink,
} from "./shared";
export function ProjectDetail({
  project: p,
  ctx,
  onBack,
}: {
  project: Project;
  ctx: Context;
  onBack: () => void;
}) {
  const { s, lang, now, actor, busy } = ctx;
  const [value, setValue] = useState("100");
  const [uri, setUri] = useState("");
  const [digest, setDigest] = useState("");
  const [verification, setVerification] = useState("");
  const [hashing, setHashing] = useState(false);
  const [recipient, setRecipient] = useState("");
  const stage = p.stages[p.current];
  const mine = p.creator === actor;
  const stake = p.contributions[actor] || 0;
  const refundable = claimable(p, actor) + bondShare(p, actor);
  const weight = votingWeight(p, actor);
  const voting = p.status === "active" && stage?.state === "voting";
  const hasVoted = participated(p, actor);
  const canVote = voting && now < stage.votingEnds && weight > 0 && !hasVoted;
  const act = (kind: Parameters<Context["act"]>[0]["kind"]) =>
    void ctx.act({ kind, projectId: p.id });
  async function fileHash(file: File | undefined, verify = false) {
    if (!file) return;
    setHashing(true);
    if (!verify) setDigest("");
    try {
      if (file.size > 20 * 1024 * 1024) throw Error("fileTooLarge");
      if (verify) {
        const result = hashEvidence(new Uint8Array(await file.arrayBuffer()));
        setVerification(
          result.toLowerCase() === stage?.digest.toLowerCase()
            ? "match"
            : "mismatch",
        );
      } else {
        const row = await saveAttachment(
          evidenceScope(p, ctx),
          p.current,
          file,
        );
        setDigest(row.digest);
      }
    } catch (e) {
      ctx.notifyError((e as Error).message);
    } finally {
      setHashing(false);
    }
  }
  return (
    <>
      <Button variant="ghost" className="back-button" onClick={onBack}>
        <ArrowLeft size={16} />
        {s("Back to projects", "返回项目列表")}
      </Button>
      <div className="page-heading detail-heading">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="eyebrow !m-0">{categoryLabel(p.category, s)}</span>
            <span className={"badge status-" + p.status}>
              {statusLabel(p, s)}
            </span>
          </div>
          <h1>{p.title[lang]}</h1>
          <p className="flex items-center gap-2">
            <span className="avatar">{accountName(p.creator).slice(0, 1)}</span>
            {s("Created by", "创建者")}{" "}
            {ctx.mode === "practice"
              ? accountName(p.creator)
              : short(p.creator)}
            <span>·</span>
            {p.stages.length} {s("milestones", "个阶段")}
          </p>
        </div>
        {ctx.mode === "chain" && (
          <a
            className="subtle-link"
            href={
              ctx.chainId === 11155111
                ? "https://sepolia.etherscan.io/address/" + p.id
                : undefined
            }
            target="_blank"
            rel="noreferrer"
          >
            {short(p.id)}
          </a>
        )}
      </div>
      <div className="detail-grid">
        <div className="space-y-6">
          <section className="panel project-introduction">
            <div className="detail-cover">
              <ProjectCover category={p.category} />
            </div>
            <h2>{s("The project", "项目介绍")}</h2>
            <p className="project-summary">{p.summary[lang]}</p>
            <div className="money-flow">
              <div>
                <small>{s("Contributed", "已出资")}</small>
                <strong>
                  <Amount value={p.raised} lang={lang} />
                </strong>
              </div>
              <span>→</span>
              <div>
                <small>{s("Still in escrow", "仍在托管")}</small>
                <strong>
                  <Amount
                    value={p.raised - p.withdrawn - p.refunded - (p.advanced?.loss || 0)}
                    lang={lang}
                  />
                </strong>
              </div>
              <span>→</span>
              <div>
                <small>{s("Released for milestones", "阶段已批准")}</small>
                <strong>
                  <Amount value={p.released} lang={lang} />
                </strong>
              </div>
            </div>
            <p className="muted text-xs mt-3">
              {s(
                "Escrow includes approved funds not yet withdrawn. Direct token donations are excluded from project accounting.",
                "托管余额包含已批准但尚未提取的资金，直接转入合约的非出资代币不计入项目账目。",
              )}
            </p>
          </section>
          <FundChart projects={[p]} ctx={ctx} />
          <AdvancedProject project={p} ctx={ctx} />
          <Tabs defaultValue="milestones">
            <TabsList variant="line">
              <TabsTrigger value="milestones">
                {s("Milestone roadmap", "阶段路线")}
              </TabsTrigger>
              <TabsTrigger value="rules">
                {s("Rules & safeguards", "规则与保障")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="milestones" className="mt-4">
              <section className="panel timeline">
                {p.stages.map((m, i) => (
                  <div
                    className={
                      "timeline-item " + (i === p.current ? "current" : "")
                    }
                    key={i}
                  >
                    <div className={"timeline-dot " + m.state}>
                      {m.state === "approved" ? (
                        <Check size={17} />
                      ) : (
                        String(i + 1).padStart(2, "0")
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <span className="muted text-xs">
                            {s("MILESTONE", "阶段")} {i + 1}
                          </span>
                          <h3>{m.title[lang]}</h3>
                        </div>
                        <strong className="whitespace-nowrap">
                          {money(m.budget, lang)}{" "}
                          <span className="unit"><CurrencyUnit /></span>
                        </strong>
                      </div>
                      <div className="flex flex-wrap gap-3 items-center mt-2">
                        <span className={"stage-label " + m.state}>
                          {stageLabel(m.state, s)}
                        </span>
                        <span className="muted text-xs">
                          {s("Evidence due", "成果截止")} ·{" "}
                          {dateTime(m.due, lang)}
                        </span>
                      </div>
                      {m.evidence && (
                        <div className="evidence-row">
                          <FileCheck2 size={16} />
                          <a
                            href={evidenceLink(m.evidence)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {s("View submitted evidence", "查看已提交成果")}
                            <ArrowUpRight size={13} />
                          </a>
                          {ctx.mode === "practice" && (
                            <span className="muted text-xs">
                              {s("Sample link", "示例链接")}
                            </span>
                          )}
                        </div>
                      )}
                      {m.evidence.startsWith("ipfs://") && (
                        <IPFSPreview
                          key={m.evidence + m.digest}
                          uri={m.evidence}
                          digest={m.digest}
                          ctx={ctx}
                        />
                      )}
                      {i === p.current &&
                        p.status === "active" &&
                        m.state === "pending" && (
                          <p className="muted mt-3">
                            {s(
                              "The creator must submit evidence before the deadline to start the vote.",
                              "创建者须在截止前提交成果，以开启本阶段投票。",
                            )}
                          </p>
                        )}
                    </div>
                  </div>
                ))}
              </section>
            </TabsContent>
            <TabsContent value="rules" className="mt-4">
              <section className="panel rules">
                <h2>
                  <ShieldCheck size={21} />
                  {s("Rules set at creation", "创建时已确定的规则")}
                </h2>
                {[
                  [
                    s("Funding must reach 100%", "募资须达到 100%"),
                    s(
                      "Contributions are capped at the goal. Anyone can finalize once the goal is reached or the funding deadline passes. If underfunded, contributors can claim a full refund.",
                      "出资总额不得超过目标。达到目标或募资到期后，任何人都能结算；未达目标则支持者可领取全额退款。",
                    ),
                  ],
                  [
                    s(
                      "At least 60% approval AND 70% participation",
                      "赞成权重至少 60%，且投票参与率至少 70%",
                    ),
                    s(
                      "Both percentages use total contributions, not just votes cast. Yes + no determines participation. Single-hop delegation is stage-specific and freezes when voting starts. Neither bonds nor token transfers add votes.",
                      "两项比例均以总出资为分母，参与率为赞成加反对权重。委托仅一层、每阶段单独设置，投票开启后冻结。保证金和直接转币不增加投票权。",
                    ),
                  ],
                  [
                    s("Creator bond: 5% of goal", "项目方保证金：目标的 5%"),
                    s(
                      "Held separately; returned after completion, failed fundraising or insufficient turnout. Missed evidence or rejection with quorum distributes the bond pro rata to contributors. Approved budgets remain irreversible.",
                      "保证金独立托管；完成全部阶段、募资失败或参与率不足时退给创建者。成果逾期或达到参与率但未获批准时按出资比例补偿支持者；已批准预算无法追回。",
                    ),
                  ],
                  [
                    s(
                      "Only unreleased funds are refundable",
                      "仅退回尚未释放的资金",
                    ),
                    s(
                      "Rejection, no quorum, or missing evidence ends the project. Contributors claim a proportional share of the remaining funds. Previously approved budgets cannot be recovered.",
                      "阶段未通过、赞成权重不足或成果逾期将终止项目，支持者按比例领取剩余资金；先前已批准的阶段预算无法追回。",
                    ),
                  ],
                  [
                    s(
                      "Bounded pause, immutable contracts",
                      "有限暂停，不可升级",
                    ),
                    s(
                      "The creator can pause only new contributions. Finalization, voting, refunds and withdrawals remain live. There is no administrator sweep, upgrade key or editable budget.",
                      "创建者只能暂停新增出资；结算、投票、退款和提款仍可进行。没有管理员划转资金、升级密钥或修改预算的权限。",
                    ),
                  ],
                  [
                    s("Evidence is checked by people", "成果由支持者审查"),
                    s(
                      "The file hash detects changed bytes; it does not prove quality, ownership or delivery. Review the linked evidence before voting. Test tokens have no monetary value.",
                      "文件哈希可检查内容是否变化，但不能证明质量、所有权或实际交付。投票前请审查成果，测试代币不具有货币价值。",
                    ),
                  ],
                ].map(([title, body]) => (
                  <div key={title}>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                ))}
              </section>
            </TabsContent>
          </Tabs>
          {voting && (
            <section className="panel vote-panel">
              <div className="flex items-center gap-3">
                <Vote size={24} />
                <div>
                  <p className="eyebrow !mb-1">
                    {s("YOUR CONTRIBUTION, YOUR VOICE", "你的出资，你的决定")}
                  </p>
                  <h2 className="!mb-0">
                    {s("Review this milestone", "审查当前阶段")}
                  </h2>
                </div>
              </div>
              <div className="vote-count">
                <strong>{Math.round((stage.yes / p.raised) * 100)}%</strong>
                <span>
                  {s("of total stake approves", "总出资权重已赞成")}
                  <small>{s("60% required", "需要达到 60%")}</small>
                </span>
              </div>
              <div className="threshold-bar">
                <Progress value={(stage.yes / p.raised) * 100} />
                <span style={{ left: "60%" }} />
              </div>
              <p className="mt-3">
                {s("Participation", "投票参与率")}:{" "}
                {(((stage.yes + stage.no) / p.raised) * 100).toFixed(2)}% / 70%
              </p>
              <Progress
                value={((stage.yes + stage.no) / p.raised) * 100}
                aria-label={s("Participation", "投票参与率")}
              />
              <p className="muted text-sm mt-2">
                {stage.yes * 100 >= p.raised * 60 &&
                (stage.yes + stage.no) * 100 >= p.raised * 70
                  ? s(
                      "Both thresholds are met. Settlement is available after the deadline.",
                      "两项门槛均已达到，截止后可结算。",
                    )
                  : s(
                      "Both thresholds must be met; displayed percentages are rounded.",
                      "须同时满足两项门槛；显示的百分比经过四舍五入。",
                    )}
              </p>
              <div className="flex justify-between text-sm muted mt-3">
                <span>
                  {s("Yes", "赞成")}: {money(stage.yes, lang)} <CurrencyUnit />
                </span>
                <span>
                  {s("No", "反对")}: {money(stage.no, lang)} <CurrencyUnit />
                </span>
              </div>
              <p className="muted mt-4">
                <Clock size={14} className="inline mr-2" />
                {remaining(stage.votingEnds, now, s)} ·{" "}
                {dateTime(stage.votingEnds, lang)}
              </p>
              <div className="hash-box">
                <span>
                  {s(
                    "Evidence file hash (Keccak-256)",
                    "成果文件哈希（Keccak-256）",
                  )}
                </span>
                <code>{stage.digest}</code>
                <label className="file-label">
                  {s(
                    "Verify a downloaded evidence file",
                    "选择已下载的成果文件进行校验",
                  )}
                  <Input
                    type="file"
                    aria-label={s("Verify evidence file", "校验成果文件")}
                    onChange={(e) => void fileHash(e.target.files?.[0], true)}
                  />
                </label>
                {verification && (
                  <p
                    role="status"
                    className={
                      verification === "match" ? "success-text" : "error-text"
                    }
                  >
                    {verification === "match"
                      ? s(
                          "Hash matches: the file bytes are unchanged.",
                          "哈希一致：文件内容未发生变化。",
                        )
                      : s(
                          "Hash mismatch: this file differs from the committed evidence.",
                          "哈希不一致：此文件与提交记录不符。",
                        )}
                  </p>
                )}
              </div>
              <p className="muted my-4">
                {s("Your voting weight", "你的投票权重")}:{" "}
                {p.raised ? ((weight / p.raised) * 100).toFixed(2) : 0}% ·{" "}
                {money(weight, lang)} <CurrencyUnit />
              </p>
              <div className="action-row">
                {now < stage.votingEnds ? (
                  <>
                    <ConfirmButton
                      s={s}
                      disabled={busy || !canVote}
                      label={s("Approve milestone", "赞成此阶段")}
                      description={s(
                        "Your vote cannot be changed. If enough backers approve, this milestone budget becomes withdrawable after the vote closes.",
                        "投票后不可更改。如果赞成权重达标，投票结束后本阶段预算将可由创建者提取。",
                      )}
                      onConfirm={() => act("voteYes")}
                    />
                    <ConfirmButton
                      s={s}
                      variant="outline"
                      disabled={busy || !canVote}
                      label={s("Reject milestone", "反对此阶段")}
                      description={s(
                        "Your vote cannot be changed. A failed milestone opens refunds for the unreleased funds.",
                        "投票后不可更改。阶段未通过将开放未释放资金的退款。",
                      )}
                      onConfirm={() => act("voteNo")}
                    />
                  </>
                ) : (
                  <Button disabled={busy} onClick={() => act("settle")}>
                    {s("Settle vote", "结算投票")}
                  </Button>
                )}
              </div>
              {hasVoted && (
                <p className="success-text mt-3">
                  {s("Your vote has been recorded.", "你的投票已记录。")}
                </p>
              )}
              {!weight && (
                <p className="muted mt-3">
                  {s(
                    "You need contribution weight or incoming delegated weight. An outgoing delegation disables your direct vote for this stage.",
                    "需要自有出资或他人委托权重；将权重委托给他人后，本阶段无法直接投票。",
                  )}
                </p>
              )}
            </section>
          )}
          {stage && (p.status === "funding" || p.status === "active") && (
            <section className="panel">
              <h2>{s("Milestone voting delegation", "阶段投票委托")}</h2>
              <p className="muted">
                {s(
                  "Delegate to one reviewer before voting opens, or revoke to vote yourself. Delegation ends with this milestone; refund ownership never changes. Reviewers cannot re-delegate received weight.",
                  "投票开始前，可将权重委托给一位审查人或撤回委托。委托仅适用于本阶段，退款归属不变；审查人无法再次转委托收到的权重。",
                )}
              </p>
              <p>
                {s("Current delegate", "当前委托人")}:{" "}
                {stage.delegates?.[actor] || s("Self", "自己")}
              </p>
              {stage.state === "pending" && stake > 0 && now < stage.due && (
                <>
                  <label className="field">
                    {s("Delegate wallet address", "受托钱包地址")}
                    <Input
                      value={recipient}
                      placeholder="0x…"
                      onChange={(e) => setRecipient(e.target.value)}
                    />
                  </label>
                  <div className="action-row">
                    <ConfirmButton
                      s={s}
                      disabled={busy || !recipient.trim()}
                      label={s("Delegate voting weight", "委托投票权重")}
                      description={s(
                        "This address will cast your entire contribution weight for this milestone. You can revoke only before voting opens.",
                        "该地址将代为投出你在本阶段的全部出资权重，仅可在投票开始前撤回。 ",
                      )}
                      onConfirm={() =>
                        void ctx.act({
                          kind: "delegate",
                          projectId: p.id,
                          recipient: recipient.trim(),
                        })
                      }
                    />
                    <Button
                      variant="outline"
                      disabled={busy || !stage.delegates?.[actor]}
                      onClick={() =>
                        void ctx.act({
                          kind: "delegate",
                          projectId: p.id,
                          recipient: "",
                        })
                      }
                    >
                      {s("Revoke delegation", "撤回委托")}
                    </Button>
                  </div>
                </>
              )}
            </section>
          )}
          <Attachments
            project={p}
            ctx={ctx}
            onSelect={(hash, address) => {
              setDigest(hash);
              if (address) setUri(address);
            }}
          />
          {mine &&
            (!p.advanced || /^0x0{40}$/i.test(p.advanced.verifier)) &&
            p.status === "active" &&
            stage?.state === "pending" &&
            now < stage.due && (
              <section className="panel">
                <h2>{s("Submit milestone evidence", "提交阶段成果")}</h2>
                <p className="muted">
                  {s(
                    "Publish the primary file using HTTPS or IPFS, then select it here to save a local copy and calculate its hash. You can also select a saved attachment above. Saving locally does not upload it.",
                    "先将主文件通过 HTTPS 或 IPFS 发布，再在这里选择文件以保存本地副本并计算哈希，也可选用上方已保存附件。保存到本地不会上传文件。",
                  )}
                </p>
                <label className="field">
                  {s("Evidence URL", "成果链接")}
                  <Input
                    value={uri}
                    onChange={(e) => setUri(e.target.value)}
                    placeholder="https://… or ipfs://…"
                    maxLength={500}
                  />
                </label>
                <label className="field">
                  {s("Evidence file (max 20 MB)", "成果文件（最大 20 MB）")}
                  <Input
                    type="file"
                    onChange={(e) => void fileHash(e.target.files?.[0])}
                  />
                </label>
                <label className="field">
                  {s("File hash", "文件哈希")}
                  <Input
                    value={digest}
                    onChange={(e) => setDigest(e.target.value)}
                    placeholder="0x…"
                    maxLength={66}
                  />
                </label>
                <ConfirmButton
                  s={s}
                  disabled={busy || hashing || !uri || !digest}
                  label={s("Submit & open vote", "提交并开启投票")}
                  description={s(
                    "The evidence link and hash cannot be changed after submission. Backers will vote on this evidence.",
                    "提交后成果链接和哈希不可修改，支持者将据此投票。",
                  )}
                  onConfirm={() =>
                    void ctx.act({
                      kind: "evidence",
                      projectId: p.id,
                      uri,
                      digest,
                    })
                  }
                />
              </section>
            )}
        </div>
        <aside className="space-y-5">
          <section className="panel funding-panel">
            <h2>{s("Funding overview", "募资概况")}</h2>
            <div className="large-amount">
              {money(p.raised, lang)} <small><CurrencyUnit /></small>
            </div>
            <p className="muted mb-4">
              {s("of", "目标")} {money(p.goal, lang)} <CurrencyUnit />
            </p>
            <Progress value={(p.raised / p.goal) * 100} />
            <div className="flex justify-between my-4 text-sm">
              <span>
                <Users size={14} className="inline mr-1" />
                {p.contributorCount} {s("backers", "位支持者")}
              </span>
              <strong>{Math.round((p.raised / p.goal) * 100)}%</strong>
            </div>
            <dl className="facts">
              <div>
                <dt>{s("Your contribution", "你的出资")}</dt>
                <dd>{money(stake, lang)} <CurrencyUnit /></dd>
              </div>
              <div>
                <dt>{s("Funding deadline", "募资截止")}</dt>
                <dd>{dateTime(p.fundingEnds, lang)}</dd>
              </div>
            </dl>
            {p.status === "funding" && (
              <>
                {now < p.fundingEnds && p.raised < p.goal ? (
                  <>
                    <label className="field">
                      {s("Contribution (tUSD)", "出资金额（tUSD）")}
                      <Input
                        value={value}
                        inputMode="decimal"
                        onChange={(e) => setValue(e.target.value)}
                      />
                    </label>
                    <Button
                      className="w-full"
                      disabled={busy || p.paused}
                      onClick={() => {
                        try {
                          void ctx.act({
                            kind: "contribute",
                            projectId: p.id,
                            value: amount(value),
                          });
                        } catch (e) {
                          ctx.notifyError((e as Error).message);
                        }
                      }}
                    >
                      {s("Back this project", "支持此项目")}
                    </Button>
                    <p className="muted text-xs mt-3">
                      {s("Available to fund", "尚可出资")}:{" "}
                      {money(p.goal - p.raised, lang)} <CurrencyUnit />
                    </p>
                  </>
                ) : (
                  <Button
                    className="w-full"
                    disabled={busy}
                    onClick={() => act("finalize")}
                  >
                    {p.raised === p.goal
                      ? s("Activate project", "启动项目")
                      : s("Finalize & open refunds", "结算并开放退款")}
                  </Button>
                )}
                {mine && (
                  <Button
                    variant="outline"
                    className="w-full mt-3"
                    disabled={busy}
                    onClick={() => act(p.paused ? "unpause" : "pause")}
                  >
                    {p.paused
                      ? s("Resume contributions", "恢复出资")
                      : s("Pause new contributions", "暂停新增出资")}
                  </Button>
                )}
              </>
            )}
            {p.status === "refunding" && (
              <div className="refund-box">
                <h3>{s("Your refund", "你的可退金额")}</h3>
                <strong>{money(refundable, lang)} <CurrencyUnit /></strong>
                <p>
                  {s(
                    "Includes your unreleased principal and any forfeited bond compensation.",
                    "包含你应退的未释放本金及应分得的保证金补偿。",
                  )}
                </p>
                <Button
                  disabled={busy || !stake || p.claims.includes(actor)}
                  className="w-full"
                  onClick={() => act("refund")}
                >
                  {p.claims.includes(actor)
                    ? s("Refund claimed", "已领取退款")
                    : s("Claim refund", "领取退款")}
                </Button>
              </div>
            )}
            {p.status === "completed" && (
              <p className="success-text">
                <Check size={16} className="inline mr-2" />
                {s("All milestones approved.", "全部阶段已批准。")}
              </p>
            )}
            {mine && p.released - p.withdrawn > 0 && (
              <div className="refund-box">
                <h3>{s("Creator withdrawal", "创建者提款")}</h3>
                <strong>{money(p.released - p.withdrawn, lang)} <CurrencyUnit /></strong>
                <Button
                  disabled={busy}
                  className="w-full mt-3"
                  onClick={() => act("withdraw")}
                >
                  {s("Withdraw approved funds", "提取已批准资金")}
                </Button>
              </div>
            )}
            {p.status === "active" &&
              stage?.state === "pending" &&
              now >= stage.due && (
                <div className="refund-box">
                  <p>
                    {s(
                      "Evidence is overdue. Anyone can end this project and open refunds.",
                      "成果已逾期，任何人都可终止项目并开放退款。",
                    )}
                  </p>
                  <Button disabled={busy} onClick={() => act("expire")}>
                    {s("End overdue project", "终止逾期项目")}
                  </Button>
                </div>
              )}
          </section>
          <section className="panel">
            <h3>{s("Creator bond", "项目方保证金")}</h3>
            <dl className="project-facts">
              <div>
                <dt>{s("Required (5%)", "应缴（5%）")}</dt>
                <dd>{money(p.bondRequired, lang)} <CurrencyUnit /></dd>
              </div>
              <div>
                <dt>{s("Locked", "锁定中")}</dt>
                <dd>{money(p.bondLocked, lang)} <CurrencyUnit /></dd>
              </div>
              <div>
                <dt>{s("Returnable", "可退给项目方")}</dt>
                <dd>{money(p.bondCredit, lang)} <CurrencyUnit /></dd>
              </div>
              <div>
                <dt>{s("Returned", "已退项目方")}</dt>
                <dd>{money(p.bondReturned, lang)} <CurrencyUnit /></dd>
              </div>
              <div>
                <dt>{s("Compensation remaining", "待领取补偿")}</dt>
                <dd>
                  {money(p.bondRefundPool - p.bondDistributed, lang)} <CurrencyUnit />
                </dd>
              </div>
              <div>
                <dt>{s("Compensation paid", "已领取补偿")}</dt>
                <dd>{money(p.bondDistributed, lang)} <CurrencyUnit /></dd>
              </div>
            </dl>
            <p className="muted text-sm">
              {s(
                "Separate from contributions and voting weight. It is not included in the principal distribution chart.",
                "独立于出资和投票权重，不计入本金分布图。",
              )}
            </p>
            {mine && p.bondCredit > 0 && (
              <Button disabled={busy} onClick={() => act("withdrawBond")}>
                {s("Withdraw returned bond", "提取退还保证金")}
              </Button>
            )}
          </section>
          <section className="secure-note">
            <LockKeyhole size={21} />
            <strong>
              {s("Funding follows verified progress", "资金随核准进展释放")}
            </strong>
            <p>
              {s(
                "Backers approve each budget separately. A hash proves consistency, not quality. Review evidence before voting.",
                "支持者逐阶段批准预算。哈希能证明内容一致性，不能证明质量，投票前请审查成果。",
              )}
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
