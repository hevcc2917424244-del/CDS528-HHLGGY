"use client";
import { CurrencyUnit } from "./currency";
import type { Action, Lang, Project } from "@/lib/stepfund/model";
import { money, validEvidence } from "@/lib/stepfund/model";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { FileSearch } from "lucide-react";
export type Context = {
  lang: Lang;
  s: (en: string, zh: string) => string;
  actor: string;
  now: number;
  mode: "practice" | "chain";
  chainId?: number;
  protocolVersion?: number;
  verifier?: string;
  unit?: string;
  busy: boolean;
  act: (action: Action) => Promise<boolean>;
  notifyError: (key: string) => void;
};
export const statusLabel = (p: Project, s: Context["s"]) =>
  p.status === "active"
    ? p.stages[p.current]?.state === "voting"
      ? s("Voting open", "正在投票")
      : s("In progress", "执行中")
    : p.status === "funding"
      ? p.paused
        ? s("Funding paused", "募资已暂停")
        : s("Funding", "募集中")
      : p.status === "refunding"
        ? s("Refund available", "可领取退款")
        : s("Completed", "已完成");
export const categoryLabel = (key: string, s: Context["s"]) =>
  key === "technology"
    ? s("Technology", "科技")
    : key === "education"
      ? s("Education", "教育")
      : s("Community", "社区");
export const stageLabel = (key: string, s: Context["s"]) =>
  ({
    pending: s("Not submitted", "待提交"),
    voting: s("Voting", "投票中"),
    approved: s("Approved", "已批准"),
    rejected: s("Rejected / expired", "未通过 / 逾期"),
  })[key] || key;
export function Picker({
  value,
  onChange,
  label,
  items,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  items: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function ConfirmButton({
  label,
  description,
  onConfirm,
  s,
  disabled = false,
  variant = "default",
}: {
  label: string;
  description: string;
  onConfirm: () => void;
  s: Context["s"];
  disabled?: boolean;
  variant?: "default" | "outline" | "destructive";
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={disabled} variant={variant}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{label}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>{s("Cancel", "取消")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {s("Confirm", "确认")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
export function Empty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <FileSearch size={32} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function Amount({ value, lang }: { value: number; lang: Lang }) {
  return (
    <>
      {money(value, lang)} <span className="unit"><CurrencyUnit /></span>
    </>
  );
}
export const dateTime = (timestamp: number, lang: Lang) =>
  new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
export function remaining(timestamp: number, now: number, s: Context["s"]) {
  const diff = timestamp - now;
  if (diff <= 0) return s("Deadline reached", "已到截止时间");
  if (diff >= 86400)
    return `${Math.ceil(diff / 86400)} ${s("days left", "天后截止")}`;
  return `${Math.max(1, Math.ceil(diff / 3600))} ${s("hours left", "小时后截止")}`;
}
export function evidenceLink(uri: string) {
  if (!validEvidence(uri)) return undefined;
  return uri.startsWith("ipfs://")
    ? "https://ipfs.io/ipfs/" + uri.slice(7)
    : uri;
}
export const errors: Record<string, [string, string]> = {
  privateFileKey: ["The file key is invalid or does not authenticate this encrypted file.", "文件密钥无效，或无法验证该加密文件。"],
  privateFileHash: ["Ciphertext does not match the committed file hash. Decryption was blocked.", "密文与已承诺文件哈希不一致，已阻止解密。"],
  privateFileFormat: ["Select an original StepFund .sfe encrypted file.", "请选择 StepFund 导出的原始 .sfe 加密文件。"],
  externalFaucet: ["This external test asset uses its issuer's faucet. Check the deployment guide for the chosen reserve.", "此外部测试资产需使用发行方的水龙头，请按部署指南领取对应资产。"],
  chainFeature: ["Connect to a v3 testnet deployment for treasury and private acceptance. Practice mode does not generate on-chain proofs.", "资金策略与隐私验收需要连接 v3 测试链部署；演示模式不会生成链上证明。"],
  invalidProof: ["The proof or assessor commitment does not match this milestone, file, network or agreed bounds.", "证明或验收承诺与当前阶段、文件、网络或约定范围不一致。"],
  proofFailed: ["Proof generation failed. Check the integer bounds and retry with this tab open.", "证明生成失败，请检查整数范围并保持此页面打开后重试。"],
  invalidAdvanced: ["Check the vault, verifier, independent assessor and integer ranges (0–2^64−1).", "请检查资金库、验证器、独立验收人及整数范围（0–2^64−1）。"],
  bundleInvalid: [
    "This is not a valid StepFund evidence package. Use the original ZIP exported by StepFund.",
    "这不是有效的 StepFund 成果包，请使用程序导出的原始 ZIP。",
  ],
  bundleFormat: [
    "Use the original StepFund ZIP without recompressing or encrypting it.",
    "请使用 StepFund 导出的原始 ZIP，不要再次压缩或加密。",
  ],
  bundleHashMismatch: [
    "A file failed its integrity check. Nothing was imported; ask the sender to export a fresh package.",
    "文件完整性校验未通过，未导入任何内容，请让发送者重新导出成果包。",
  ],
  bundleWrongProject: [
    "This package belongs to a different project or network. Open the matching project before importing.",
    "成果包属于其他项目或网络，请打开对应项目后再导入。",
  ],
  bundleLimit: [
    "Package limit: 100 files, 100 MB total and 20 MB per file. Export a smaller set of evidence.",
    "成果包上限为 100 个文件、总计 100 MB、单文件 20 MB，请减少文件后导出。",
  ],
  bundleEmpty: [
    "Save at least one attachment before exporting a package.",
    "请先保存至少一个附件，再导出成果包。",
  ],
  bundleProcessing: [
    "Package processing could not start. Use a current browser and retry.",
    "无法处理成果包，请使用较新的浏览器后重试。",
  ],
  transactionPending: [
    "Transaction pending or not yet verifiable. Open Network & practice → Transaction recovery and check the receipt before retrying. Do not send it again yet.",
    "交易待确认或暂时无法核实，请到“网络与演示 → 交易状态与恢复”检查回执，暂勿重复发送。",
  ],
  transactionCancelled: [
    "The wallet replaced or cancelled this action. Check transaction recovery before starting it again.",
    "钱包已替换或取消此操作，请先检查交易恢复记录再重新操作。",
  ],
  transactionAlreadyConfirmed: [
    "The earlier transaction is confirmed. Refresh project data before taking another action.",
    "之前的交易已确认，请先刷新项目数据再进行下一次操作。",
  ],
  transactionStorage: [
    "Enable browser storage before sending transactions so recovery records can be saved.",
    "发送交易前请启用浏览器存储，以保存恢复记录。",
  ],
  invalidTransaction: [
    "This is not a replacement transaction from the same sender and nonce.",
    "该交易并非同一发送者、同一序号的替换交易。",
  ],
  deploymentRecovery: [
    "The saved deployment cannot be verified on this network. Check the original wallet, network and transaction receipts before deploying again.",
    "无法在此网络核实已保存部署，请先检查原钱包、网络与交易回执，再处理部署。",
  ],
  networkInterrupted: [
    "Connection interrupted. Check your wallet's transaction activity and the recovery journal before retrying; an interrupted request can still have been broadcast.",
    "连接中断。请先检查钱包交易记录与程序恢复记录再重试，中断的请求仍有可能已经广播。",
  ],
  evidenceStorage: [
    "Unable to save evidence. Check browser storage permission and free disk space, then retry.",
    "无法保存成果，请检查浏览器存储权限与可用空间后重试。",
  ],
  evidenceQuota: [
    "The evidence library has reached its 100 MB limit. Download backups, then remove unused local copies.",
    "附件库达到 100 MB 上限，请下载备份后移除不再需要的本地副本。",
  ],
  phoneSepoliaOnly: [
    "Phone wallets use Sepolia. Use a desktop browser wallet for a local Hardhat chain.",
    "手机钱包请使用 Sepolia；本地 Hardhat 链需要使用电脑浏览器钱包。",
  ],
  invalidConfig: [
    "Choose a StepFund connection JSON file with a valid testnet and factory address (maximum 16 KB).",
    "请选择包含有效测试网络和工厂地址的 StepFund 连接 JSON 文件（最大 16 KB）。",
  ],
  walletTimeout: [
    "Phone connection timed out. Check Internet access on both devices and try again.",
    "手机连接超时，请检查两台设备的网络后重试。",
  ],
  verificationUnavailable: [
    "Verification could not be confirmed. Retry later or export the compiler input for manual verification.",
    "暂时无法确认验证结果，请稍后重试，或导出编译输入进行手动验证。",
  ],
  invalidAmount: [
    "Enter an amount greater than zero, up to 1,000,000 tUSD, with at most 6 decimals.",
    "请输入大于零、最多 1,000,000 tUSD 的金额，小数不超过 6 位。",
  ],
  invalidProject: [
    "Check the title, description, category, and funding period (1–90 days). Titles allow 120 UTF-8 bytes; descriptions allow 1,200.",
    "请检查标题、描述、类别和募资期（1–90 天）。标题最多 120 个 UTF-8 字节，描述最多 1,200 个字节。",
  ],
  invalidSchedule: [
    "Each milestone needs a title and positive budget. Its due day must be at least the previous deadline + voting days + 1, and within 729 days.",
    "每个阶段须有名称与正数预算。截止日须至少为上一截止日＋投票天数＋1，且不超过 729 天。",
  ],
  invalidEvidence: [
    "Use an HTTPS or IPFS URL (up to 500 bytes) and a nonzero 32-byte file hash.",
    "请输入 HTTPS 或 IPFS 链接（最多 500 字节）和非零的 32 字节文件哈希。",
  ],
  unauthorized: [
    "Only the project creator can perform this action.",
    "只有项目创建者可以执行此操作。",
  ],
  wrongState: [
    "This action is unavailable in the current project state. Refresh and check the timeline.",
    "当前项目状态不支持此操作，请刷新并检查阶段进度。",
  ],
  expired: ["The deadline has passed.", "已超过截止时间。"],
  tooEarly: ["The deadline has not been reached yet.", "尚未到达截止时间。"],
  alreadyVoted: [
    "You have already voted on this milestone.",
    "你已经为此阶段投过票。",
  ],
  notContributor: [
    "Only contributors to this project can vote.",
    "只有本项目的出资者可以投票。",
  ],
  nothingToClaim: [
    "There is nothing to claim, or this claim has already been completed.",
    "当前无可领取金额，或已经领取过。",
  ],
  balanceLow: [
    "Your tUSD balance is too low. Use the test-token faucet.",
    "tUSD 余额不足，可使用测试代币水龙头领取。",
  ],
  noWallet: [
    "Connect your phone wallet by QR code, or unlock a browser wallet. Practice mode works without a wallet.",
    "请扫码连接手机钱包，或解锁浏览器钱包。演示模式不需要钱包。",
  ],
  wrongNetwork: [
    "Switch your wallet to Sepolia or Hardhat Local. Mainnet is not supported.",
    "请将钱包切换到 Sepolia 或 Hardhat 本地链，不支持主网。",
  ],
  invalidFactory: [
    "Enter a deployed StepFund factory address on the selected network.",
    "请输入所选网络上已部署的 StepFund 工厂合约地址。",
  ],
  legacyFactory: [
    "This deployment uses an older contract protocol. Deploy a new v2 factory; existing campaigns remain on their original contracts.",
    "此部署使用旧版合约，请部署新的 v2 工厂；原项目继续保留在原合约上。",
  ],
  invalidDelegate: [
    "Use a different valid wallet. Delegation chains, cycles and re-delegating incoming weight are not allowed.",
    "请使用其他有效钱包地址，不允许循环委托、多层委托或转委托收到的权重。",
  ],
  walletChanged: [
    "The wallet account or network changed. Reconnect before continuing.",
    "钱包账户或网络已变更，请重新连接后继续。",
  ],
  rejected: [
    "The wallet request was cancelled. No confirmed transaction was added.",
    "钱包请求已取消，没有新增已确认交易。",
  ],
  gasLow: [
    "You need test ETH on the selected network to pay transaction gas.",
    "需要所选测试网络的测试 ETH 来支付交易手续费。",
  ],
  cooldown: [
    "The test-token faucet is available once per address every 24 hours.",
    "测试代币水龙头每个地址每 24 小时可领取一次。",
  ],
  paused: [
    "New contributions are paused by the creator. Deadline finalization remains available.",
    "创建者已暂停新出资，到期结算仍可执行。",
  ],
  rpcError: [
    "The wallet or network could not complete this request. Check the network, balance and project state, then refresh.",
    "钱包或网络未能完成请求，请检查网络、余额与项目状态后刷新重试。",
  ],
  transactionFailed: [
    "The transaction failed on chain. Refresh to read the latest state.",
    "链上交易失败，请刷新读取最新状态。",
  ],
  fileTooLarge: [
    "Choose a file smaller than 20 MB.",
    "请选择小于 20 MB 的文件。",
  ],
  storage: [
    "Browser storage is unavailable. Your practice changes will last only until this page closes.",
    "浏览器存储不可用，演示进度仅保留到本页面关闭。",
  ],
};
