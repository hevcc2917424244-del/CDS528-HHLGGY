"use client";
import { CurrencyUnit } from "./currency";
import { useEffect, useRef, useState } from "react";
import { ZeroAddress } from "ethers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { amount, money, type Draft, type Project } from "@/lib/stepfund/model";
import { generateProof, privateCommitment, privacyContext, randomSalt, type ProofResult } from "@/lib/stepfund/privacy";
import { ConfirmButton, type Context } from "./shared";
import { PrivateFiles } from "./private-files";

export function AdvancedFields({ draft, update, ctx }: { draft: Draft; update: (key: keyof Draft, value: unknown) => void; ctx: Context }) {
  const { s } = ctx;
  const [vault, setVault] = useState("");
  const [verifier, setVerifier] = useState("");
  const [assessor, setAssessor] = useState("");
  const [low, setLow] = useState("80");
  const [high, setHigh] = useState("100");
  const [useVault, setUseVault] = useState(false);
  const [usePrivacy, setUsePrivacy] = useState(false);
  const enabled = ctx.mode === "chain" && ctx.protocolVersion === 3;
  useEffect(() => {
    if (!enabled) return;
    setVerifier(ctx.verifier || "");
    let active = true;
    fetch(`/deployments/${ctx.chainId}.json`).then(r => r.ok ? r.json() : null).then(d => {
      if (active && d) { const addresses = d as { researchVault?: string }; setVault(addresses.researchVault || ""); }
    }).catch(() => {});
    return () => { active = false; };
  }, [ctx.chainId, ctx.verifier, enabled]);
  useEffect(() => {
    update("advanced", enabled && (useVault || usePrivacy) ? {
      vault: useVault ? vault.trim() : ZeroAddress,
      verifier: usePrivacy ? verifier.trim() : ZeroAddress,
      assessor: usePrivacy ? assessor.trim() : ZeroAddress,
      minimums: usePrivacy ? draft.stages.map(() => low) : [],
      maximums: usePrivacy ? draft.stages.map(() => high) : [],
    } : undefined);
    // update is a lightweight parent setter; including it would retrigger every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault, verifier, assessor, low, high, useVault, usePrivacy, draft.stages.length, enabled]);
  return <section className="panel advanced-panel">
    <p className="eyebrow">{s("OPTIONAL · FIXED AT CREATION", "可选条款 · 创建后固定")}</p>
    <h2>{s("Treasury & private acceptance", "资金管理与隐私验收")}</h2>
    {!enabled && <p className="callout">{s("Connect to a v3 testnet factory to enable these features. Local Hardhat also runs the real contracts and proofs.", "连接 v3 测试链工厂后可启用，本地 Hardhat 同样运行真实合约与证明。")}</p>}
    <label className="advanced-check"><input type="checkbox" disabled={!enabled} checked={useVault} onChange={e => setUseVault(e.target.checked)} />{s("Use an ERC4626 treasury vault", "启用 ERC4626 资金库")}</label>
    {useVault && <><label className="field">{s("Vault address", "资金库地址")}<Input value={vault} onChange={e => setVault(e.target.value)} placeholder="0x…" /></label>
      <p className="callout">{s("Up to 20% of contributions may enter this vault during fundraising. Losses can reduce refunds; the creator bond remains separate. The included Research Vault uses externally funded rewards, not market interest. Aave requires its own supported asset and deployment.", "募资期间最多将出资的 20% 存入此资金库。亏损可能减少退款，项目方保证金单独保留。随包研究资金库的收益来自外部奖励，并非市场利息；Aave 需要受支持的资产和独立部署。")}</p></>}
    <label className="advanced-check"><input type="checkbox" disabled={!enabled} checked={usePrivacy} onChange={e => setUsePrivacy(e.target.checked)} />{s("Require a private range proof for every milestone", "每阶段均要求隐私范围证明")}</label>
    {usePrivacy && <>
      <label className="field">{s("Factory-pinned acceptance verifier", "工厂固定的验收验证器")}<Input value={verifier} readOnly placeholder="0x…" /></label>
      <label className="field">{s("Independent assessor wallet", "独立验收人钱包")}<Input value={assessor} onChange={e => setAssessor(e.target.value)} placeholder="0x…" /></label>
      <div className="form-grid"><label className="field">{s("Minimum measurement", "指标下限")}<Input inputMode="numeric" value={low} onChange={e => setLow(e.target.value)} /></label><label className="field">{s("Maximum measurement", "指标上限")}<Input inputMode="numeric" value={high} onChange={e => setHigh(e.target.value)} /></label></div>
      <p className="muted">{s("The inclusive integer range applies to every milestone. Define the metric and units in the project description. An independent assessor checks the private evidence; ZK checks the committed number; backers still vote. Address independence does not prove human independence.", "该闭区间整数范围适用于所有阶段，请在项目描述中明确指标及单位。独立验收人核查私密成果，ZK 检查承诺中的数值，支持者仍需投票。不同地址不代表不同自然人。")}</p>
    </>}
  </section>;
}

export function AdvancedProject({ project: p, ctx }: { project: Project; ctx: Context }) {
  const a = p.advanced;
  if (!a) return null;
  const hasVault = a.vault !== ZeroAddress;
  const hasPrivacy = a.verifier !== ZeroAddress;
  if (!hasVault && !hasPrivacy) return null;
  return <>{hasVault && <TreasuryPanel project={p} ctx={ctx} />}{hasPrivacy && <><PrivateFiles key={`${p.id}-${ctx.actor}`} ctx={ctx} /><PrivatePanel key={`${p.id}-${p.current}-${ctx.actor}`} project={p} ctx={ctx} /></>}</>;
}
function TreasuryPanel({ project: p, ctx }: { project: Project; ctx: Context }) {
  const a = p.advanced!;
  const { s, lang, busy } = ctx;
  const [value, setValue] = useState("10");
  const max = Math.max(0, Math.floor(p.raised / 5) - a.principal);
  return <section className="panel advanced-panel">
    <p className="eyebrow">{s("FUNDRAISING TREASURY", "募资资金管理")}</p><h2>{s("Where the funds are", "资金去向")}</h2>
    <p className="break-all text-xs muted">{s("ERC4626 vault", "ERC4626 资金库")}: {a.vault}</p>
    <dl className="facts">
      <div><dt>{s("Principal in vault", "资金库中的本金")}</dt><dd>{money(a.principal, lang)} <CurrencyUnit /></dd></div>
      <div><dt>{s("Liquid principal", "流动本金")}</dt><dd>{money(Math.max(0, p.raised - p.withdrawn - p.refunded - a.principal - a.loss), lang)} <CurrencyUnit /></dd></div>
      <div><dt>{s("Realized yield", "已实现收益")}</dt><dd>{money(a.yieldPool, lang)} <CurrencyUnit /></dd></div>
      <div><dt>{s(a.rescueShares !== "0" ? "Principal exchanged for rescue shares" : "Realized principal loss", a.rescueShares !== "0" ? "转为救济份额的本金" : "已实现本金亏损")}</dt><dd>{money(a.loss, lang)} <CurrencyUnit /></dd></div>
      <div><dt>{s("Your available yield", "你的可领取收益")}</dt><dd>{money(Number(a.reward), lang)} <CurrencyUnit /></dd></div>
    </dl>
    <p className="callout">{s("Vault terms were fixed before contributions. Deposits are capped at 20%; bonds are never invested. Finalization redeems the vault first. Any principal loss cancels activation and opens proportional refunds. Yield belongs to contributors, independently of milestone payouts.", "资金库在出资前固定，存入上限为 20%，保证金不参与投资。募资结算时先赎回；本金亏损将取消启动并开放按比例退款。收益属于出资者，与阶段款项分开领取。")}</p>
    {p.status === "funding" && ctx.now < p.fundingEnds && <>
      <label className="field">{s("Deposit amount (tUSD)", "存入金额（tUSD）")}<Input value={value} onChange={e => setValue(e.target.value)} inputMode="decimal" /></label>
      <p className="muted">{s("Available under the cap", "额度内尚可存入")}: {money(max, lang)} <CurrencyUnit /></p>
      <ConfirmButton s={s} label={s("Deposit into vault", "存入资金库")} disabled={busy || p.paused || max <= 0} description={s("Deposit this part of project principal into the disclosed vault with a 1% share slippage limit? External vault risk remains.", "将这部分项目本金存入已披露资金库，份额滑点上限为 1%。资金仍承担外部资金库风险，确定继续？")} onConfirm={() => { try { const n = amount(value); if (n > max) throw Error("invalidAmount"); void ctx.act({ kind: "investTreasury", projectId: p.id, value: n }); } catch (e) { ctx.notifyError((e as Error).message); } }} />
    </>}
    {p.status !== "funding" && (p.contributions[ctx.actor] || 0) > 0 && !a.yieldClaimed && (a.yieldPool > 0 || a.rescueShares !== "0") && <Button disabled={busy} onClick={() => void ctx.act({ kind: "claimYield", projectId: p.id })}>{s("Claim yield / rescue shares", "领取收益 / 救济份额")}</Button>}
    {a.rescueShares !== "0" && <p className="callout break-all">{s("Your claimable vault shares (raw units)", "你可领取的资金库份额（原始单位）")}: {a.shares}. {s("After claiming, redeem directly from the vault when liquidity returns; see the user guide.", "领取后，待资金库恢复流动性再自行赎回，详见使用指南。")}</p>}
    {p.status === "funding" && a.principal > 0 && <><p className="muted">{s("If redemption remains blocked seven days after the funding deadline, anyone can cancel the project and distribute liquid refunds plus vault shares. Share redemption still depends on vault liquidity.", "若募资截止七天后仍无法赎回，任何人可取消项目，开放流动本金退款并按比例分发资金库份额；份额赎回仍依赖资金库流动性。")}</p><ConfirmButton s={s} disabled={busy || ctx.now < p.fundingEnds + 7 * 86400} label={s("Cancel & distribute vault shares", "取消并分发资金库份额")} description={s("This permanently cancels the project. Liquid principal and vault shares become separately claimable; the bond returns to the creator.", "这会永久取消项目，流动本金与资金库份额分别领取，保证金退还项目方。确认执行？")} onConfirm={() => void ctx.act({ kind: "rescueTreasury", projectId: p.id })} /></>}
  </section>;
}

function PrivatePanel({ project: p, ctx }: { project: Project; ctx: Context }) {
  const a = p.advanced!;
  const { s } = ctx;
  const [value, setValue] = useState("");
  const [salt, setSalt] = useState("");
  const [digest, setDigest] = useState("");
  const [uri, setUri] = useState("");
  const [proof, setProof] = useState<ProofResult | null>(null);
  const [working, setWorking] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const i = p.current;
  const pending = p.status === "active" && p.stages[i]?.state === "pending" && ctx.now < p.stages[i].due;
  const creator = ctx.actor === p.creator;
  const assessor = ctx.actor === a.assessor;
  const context = () => privacyContext(ctx.chainId!, p.id, i, digest);
  const compute = () => privateCommitment(value, salt, context());
  const changed = () => setProof(null);
  async function prove() {
    try {
      compute();
      if (BigInt(value) < BigInt(a.minimums[i]) || BigInt(value) > BigInt(a.maximums[i])) throw Error("invalidProof");
      controller.current = new AbortController(); setWorking(true);
      const result = await generateProof({ value, salt, minimum: a.minimums[i], maximum: a.maximums[i], context: context() }, digest, controller.current.signal);
      setProof(result);
    } catch (e) { if ((e as Error).message !== "proofCancelled") ctx.notifyError((e as Error).message); }
    finally { setWorking(false); }
  }
  return <section className="panel advanced-panel">
    <p className="eyebrow">{s("PRIVATE ACCEPTANCE · PLONK", "隐私验收 · PLONK")}</p><h2>{s("Prove the agreed condition", "证明约定条件")}</h2>
    <p className="muted break-all">{s("Assessor", "验收人")}: {a.assessor}<br />{s("Verifier", "验证器")}: {a.verifier}</p>
    <p className="callout">{s("The assessor checks the underlying evidence off chain and attests its commitment. The proof hides the number and salt, while binding the agreed range, file hash, chain, project and milestone. It does not prove physical delivery or hide wallet addresses. Backer voting still applies.", "验收人在线下核查实际成果并确认承诺。证明隐藏数值与盐值，同时绑定约定范围、文件哈希、网络、项目与阶段；它不证明现实交付，也不隐藏钱包地址。仍需支持者投票。")}</p>
    <ul className="privacy-status">{p.stages.map((stage, n) => <li key={n}>{s("Milestone", "阶段")} {n + 1}: {a.minimums[n]} ≤ {s("private value", "私密数值")} ≤ {a.maximums[n]} · {a.verified[n] ? s("Proof verified on chain", "证明已链上验证") : a.commitments[n] !== "0" ? s("Assessor attested", "验收人已确认") : s("Awaiting evidence", "等待成果")}</li>)}</ul>
    {pending && (creator || assessor) && <fieldset disabled={ctx.busy || working}>
      <p className="muted">{s("Share the measurement and random salt privately with the assessor. They are kept only in this page's memory. Do not upload unencrypted private evidence to public IPFS.", "请私下向验收人提供指标与随机盐值；本页仅在内存中保留它们。私密文件请先加密，再上传公共 IPFS。")}</p>
      <label className="field">{s("Evidence file hash (Keccak-256)", "成果文件哈希（Keccak-256）")}<Input value={digest} onChange={e => { setDigest(e.target.value); changed(); }} placeholder="0x…" /></label>
      <label className="field">{s("Private measurement", "私密指标数值")}<Input autoComplete="off" inputMode="numeric" value={value} onChange={e => { setValue(e.target.value); changed(); }} /></label>
      <label className="field">{s("Private random salt", "私密随机盐值")}<Input autoComplete="off" value={salt} onChange={e => { setSalt(e.target.value); changed(); }} /></label>
      <Button variant="outline" onClick={() => { setSalt(randomSalt()); changed(); }}>{s("Generate a new salt", "生成新盐值")}</Button>
      {assessor && <ConfirmButton s={s} label={s("Attest reviewed evidence", "确认已核查成果")} description={s("Only attest after independently checking the actual deliverable, the metric and the exact file hash. A proof cannot detect a dishonest assessor.", "请独立核查实际交付、指标及文件哈希后再确认；证明无法识别说谎的验收人。确认提交承诺？")} onConfirm={() => { try { void ctx.act({ kind: "attestPrivate", projectId: p.id, stage: i, commitment: compute(), digest }); } catch (e) { ctx.notifyError((e as Error).message); } }} />}
      {creator && <><label className="field">{s("Published evidence URL", "已发布成果链接")}<Input value={uri} onChange={e => setUri(e.target.value)} placeholder="ipfs://…" /></label><Button onClick={() => void prove()}>{s("Generate proof locally", "在本机生成证明")}</Button></>}
    </fieldset>}
    {working && <div role="status"><p>{s("Generating and checking a real PLONK proof on this device…", "正在本机生成并检查 PLONK 证明……")}</p><Button variant="outline" onClick={() => controller.current?.abort()}>{s("Cancel generation", "取消生成")}</Button></div>}
    {pending && proof && <div className="callout"><p>{s("Proof verified locally. The private measurement is not included in the transaction.", "证明已通过本地验证，交易不包含私密指标数值。")}</p><p className="break-all">{s("Commitment", "承诺")}: {BigInt(proof.signals[0]).toString()}</p>
      <ConfirmButton s={s} disabled={ctx.busy || !uri || BigInt(proof.signals[0]).toString() !== a.commitments[i] || proof.digest.toLowerCase() !== a.digests[i]?.toLowerCase()} label={s("Submit proof & open vote", "提交证明并开启投票")} description={s("The assessor commitment must match. The contract verifies this proof before opening the normal backer vote.", "须与验收人的承诺一致，合约验证证明后才会开启支持者投票。确认提交？")} onConfirm={() => void ctx.act({ kind: "privateEvidence", projectId: p.id, uri, digest: proof.digest, proof: proof.proof, signals: proof.signals })} />
      {BigInt(proof.signals[0]).toString() !== a.commitments[i] && <p>{s("Waiting for the assessor to attest this commitment.", "等待验收人确认此承诺。")}</p>}
    </div>}
  </section>;
}
