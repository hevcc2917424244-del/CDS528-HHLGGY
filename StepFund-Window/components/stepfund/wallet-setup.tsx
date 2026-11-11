"use client";
import { useEffect, useRef, useState } from "react";
import { BrowserProvider, Contract } from "ethers";
import {
  Smartphone,
  Wallet,
  Droplets,
  ShieldCheck,
  Copy,
  Download,
  Upload,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmButton, Picker, type Context } from "./shared";
import {
  FACTORY_ABI,
  switchNetwork,
  errorKey,
  type Connection,
} from "@/lib/stepfund/chain";
import {
  connectBrowserWallet,
  connectMobileWallet,
  disconnectWallet,
  onWalletSelection,
  walletProvider,
} from "@/lib/stepfund/wallet";
import {
  checkVerification,
  submitVerification,
  pollVerification,
  verificationInput,
  downloadJSON,
  parsePublicDeployment,
  readWalletStatus,
  type WalletStatus,
  type VerificationState,
  type ContractKind,
} from "@/lib/stepfund/setup";

type Props = {
  s: Context["s"];
  busy: boolean;
  configLoading: boolean;
  network: string;
  factory: string;
  connection: Connection | null;
  notifyError: Context["notifyError"];
  onNetwork: (network: string) => Promise<void>;
  onFactory: (value: string) => void;
  onConnect: () => Promise<void>;
  onDeploy: () => Promise<void>;
  onFaucet: () => Promise<boolean>;
};
export function WalletSetup(p: Props) {
  const { s } = p;
  const [wallet, setWallet] = useState<WalletStatus | null>(null);
  const [working, setWorking] = useState("");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [publisher, setPublisher] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const pending = p.busy || !!working;
  const current =
    p.connection?.chainId === Number(p.network) &&
    p.connection?.factoryAddress.toLowerCase() ===
      p.factory.trim().toLowerCase()
      ? p.connection
      : null;
  const currentRef = useRef(current);
  currentRef.current = current;
  const token = current?.tokenAddress;
  async function refreshWallet() {
    const rev = ++revision.current;
    const status = await readWalletStatus(currentRef.current?.tokenAddress);
    if (rev === revision.current) setWallet(status);
    return status;
  }
  useEffect(() => {
    let unbind = () => {};
    const bind = () => {
      unbind();
      revision.current++;
      setWallet(null);
      try {
        const raw = walletProvider();
        const changed = () => {
          revision.current++;
          setWallet(null);
          void refreshWallet().catch(() => {});
        };
        raw.on?.("accountsChanged", changed);
        raw.on?.("chainChanged", changed);
        raw.on?.("disconnect", changed);
        unbind = () => {
          raw.removeListener?.("accountsChanged", changed);
          raw.removeListener?.("chainChanged", changed);
          raw.removeListener?.("disconnect", changed);
        };
        void refreshWallet().catch(() => {});
      } catch {
        /* A new user may have no wallet yet. */
      }
    };
    bind();
    const unsubscribe = onWalletSelection(bind);
    return () => {
      unsubscribe();
      unbind();
      revision.current++;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    void refreshWallet().catch(() => {});
  }, [token]);
  const run = async (name: string, action: () => Promise<unknown>) => {
    if (pending) return;
    setWorking(name);
    try {
      await action();
    } catch (e) {
      if (!(name === "phone" && controller.current?.signal.aborted))
        p.notifyError(errorKey(e));
    } finally {
      setWorking("");
    }
  };
  const attach = (phone: boolean) =>
    run(phone ? "phone" : "browser", async () => {
      if (phone) {
        controller.current = new AbortController();
        const signal = controller.current.signal;
        let qrRevision = 0;
        await connectMobileWallet((uri) => {
          const seq = ++qrRevision;
          if (!uri) {
            setQr("");
            return;
          }
          void import("qrcode")
            .then((m) =>
              m.default.toDataURL(uri, {
                width: 300,
                margin: 2,
                errorCorrectionLevel: "M",
              }),
            )
            .then((url) => {
              if (!signal.aborted && seq === qrRevision) setQr(url);
            })
            .catch(() => {
              controller.current?.abort();
            });
        }, signal);
        await p.onNetwork("11155111");
      } else {
        await connectBrowserWallet();
        const status = await readWalletStatus();
        if (String(status.chainId) !== p.network)
          await p.onNetwork(String(status.chainId));
      }
      await refreshWallet();
    });
  return (
    <div className="setup-center">
      <div className="setup-intro">
        <div>
          <span className="eyebrow">
            {s("READY TO SHARE", "开箱即用，共同参与")}
          </span>
          <h2>{s("Your testnet, connected.", "连接钱包，开始参与。")}</h2>
          <p>
            {s(
              "Use your phone wallet. No desktop extension or developer tools required.",
              "使用手机钱包即可，无须安装电脑扩展或开发工具。",
            )}
          </p>
        </div>
        <span className="setup-pill">
          {s("Test assets only", "仅使用测试资产")}
        </span>
      </div>
      <div className="setup-steps" aria-label={s("Setup steps", "连接步骤")}>
        <span>
          <b>1</b>
          {s("Wallet", "钱包")}
        </span>
        <span>
          <b>2</b>
          {s("Test funds", "测试币")}
        </span>
        <span>
          <b>3</b>
          {s("Shared projects", "共享项目")}
        </span>
      </div>
      <div className="setup-columns">
        <section className="setup-card">
          <h3>
            <Wallet size={20} />
            {s("1. Connect your wallet", "1. 连接你的钱包")}
          </h3>
          <p className="muted">
            {s(
              "Approve the connection and transactions in your own wallet. StepFund never asks for a recovery phrase or private key.",
              "连接与交易由你在钱包中确认。StepFund 不会索取助记词或私钥。",
            )}
          </p>
          <div className="setup-buttons">
            <Button disabled={pending} onClick={() => void attach(true)}>
              <Smartphone size={16} />
              {s("Connect phone wallet", "手机钱包扫码连接")}
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => void attach(false)}
            >
              {s("Use browser wallet", "使用浏览器钱包")}
            </Button>
          </div>
          {working === "phone" && (
            <div className="setup-qr" role="status">
              {qr ? (
                <img
                  src={qr}
                  alt={s(
                    "Scan with MetaMask Mobile",
                    "使用手机 MetaMask 扫描二维码",
                  )}
                  width={240}
                  height={240}
                />
              ) : (
                <Loader2 className="animate-spin" />
              )}
              <strong>
                {qr
                  ? s(
                      "Scan in MetaMask, then approve",
                      "用 MetaMask 扫码并确认连接",
                    )
                  : s("Preparing secure connection…", "正在准备安全连接…")}
              </strong>
              <p>
                {s(
                  "Keep this window open. Both devices need Internet access. MetaMask may include Mainnet in its permissions; StepFund only sends testnet transactions.",
                  "请保持窗口打开，两台设备均需联网。MetaMask 授权中可能包含主网，但 StepFund 只发送测试网交易。",
                )}
              </p>
              <Button
                variant="outline"
                onClick={() => controller.current?.abort()}
              >
                {s("Cancel connection", "取消连接")}
              </Button>
            </div>
          )}
          {wallet && (
            <div className="setup-account">
              <span>
                <CheckCircle2 size={16} /> {s("Wallet connected", "钱包已连接")}
              </span>
              <code>{wallet.account}</code>
              <div className="setup-buttons">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void run("copy", async () => {
                      await navigator.clipboard.writeText(wallet.account);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    })
                  }
                >
                  <Copy size={14} />
                  {copied
                    ? s("Copied", "已复制")
                    : s("Copy address", "复制地址")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    void run("disconnect", async () => {
                      await disconnectWallet();
                      setWallet(null);
                    })
                  }
                >
                  {s("Disconnect", "断开连接")}
                </Button>
              </div>
            </div>
          )}
        </section>
        <section className="setup-card">
          <h3>
            <Droplets size={20} />
            {s("2. Prepare test funds", "2. 准备测试币")}
          </h3>
          <div className="setup-balance">
            <small>
              {s("Wallet network", "钱包网络")}:{" "}
              {wallet
                ? wallet.chainId === 11155111
                  ? "Sepolia"
                  : "Hardhat Local"
                : "—"}
            </small>
            <strong>
              {wallet
                ? Number(wallet.eth).toLocaleString(undefined, {
                    maximumFractionDigits: 6,
                  })
                : "—"}{" "}
              <span>ETH</span>
            </strong>
            <p>
              {wallet?.hasGas
                ? s(
                    "Balance detected. Each transaction still needs a gas estimate.",
                    "已检测到余额；具体是否足够，以交易手续费估算为准。",
                  )
                : s(
                    "Test ETH pays network fees. tUSD is the separate project token.",
                    "测试 ETH 用于支付手续费，tUSD 是另一种项目测试代币。",
                  )}
            </p>
          </div>
          <div className="setup-buttons">
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => void run("balance", refreshWallet)}
            >
              <RefreshCw size={15} />
              {s("Refresh balances", "刷新余额")}
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                void run("network", async () => {
                  await switchNetwork(Number(p.network));
                  await refreshWallet();
                })
              }
            >
              {s("Switch wallet network", "切换钱包网络")}
            </Button>
          </div>
          <div className="setup-links">
            <a
              href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia"
              target="_blank"
              rel="noreferrer"
            >
              {s("Get Sepolia ETH", "领取 Sepolia ETH")}{" "}
              <ExternalLink size={13} />
            </a>
            <a
              href="https://ethereum.org/developers/docs/networks/#sepolia"
              target="_blank"
              rel="noreferrer"
            >
              {s("More faucet options", "更多领币入口")}{" "}
              <ExternalLink size={13} />
            </a>
          </div>
          <p className="muted text-xs">
            {s(
              "Faucets open in a new tab and may require sign-in or a CAPTCHA. Return here to refresh; opening a faucet does not mean funds arrived.",
              "领币网站在新标签页打开，可能要求登录或验证码。领取后返回刷新；打开领币网站不代表已到账。",
            )}
          </p>
          <Button
            variant="secondary"
            disabled={pending || !current || !wallet?.hasGas}
            onClick={() =>
              void run("faucet", async () => {
                await p.onFaucet();
                await refreshWallet();
              })
            }
          >
            {s("Claim 1,000 tUSD", "领取 1,000 tUSD")}
          </Button>
          <p className="muted text-xs">
            {current
              ? `${s("tUSD balance", "tUSD 余额")}: ${wallet?.tokenBalance || "—"}${wallet?.faucetAt && wallet.faucetAt > Date.now() / 1000 ? " · " + s("Next claim: ", "下次领取：") + new Date(wallet.faucetAt * 1000).toLocaleString() : ""}`
              : s(
                  "Join a deployment in step 3 to enable the tUSD faucet.",
                  "完成第 3 步、接入合约后即可领取 tUSD。",
                )}
          </p>
        </section>
      </div>
      <section className="setup-card">
        <h3>
          <ShieldCheck size={20} />
          {s("3. Join shared projects", "3. 接入共享项目")}
        </h3>
        <p className="muted">
          {s(
            "Recipients import the publisher’s connection file or enter the factory address. No Etherscan account or API key is needed to participate.",
            "接收者导入发布者的连接文件，或填写工厂地址即可参与，无须注册 Etherscan 或提供 API Key。",
          )}
        </p>
        <div className="setup-config">
          <div className="field">
            <span>{s("Network", "网络")}</span>
            <Picker
              label={s("Network", "网络")}
              value={p.network}
              onChange={(v) => {
                if (!pending) void p.onNetwork(v);
              }}
              items={[
                { value: "11155111", label: "Sepolia (11155111)" },
                { value: "31337", label: "Hardhat Local (31337)" },
              ]}
            />
          </div>
          <label className="field">
            {s("Factory contract address", "工厂合约地址")}
            <Input
              value={p.factory}
              disabled={pending || p.configLoading}
              onChange={(e) => p.onFactory(e.target.value)}
              placeholder="0x…"
              spellCheck={false}
            />
          </label>
        </div>
        <div className="setup-buttons">
          <Button
            disabled={pending || p.configLoading || !p.factory}
            onClick={() => void p.onConnect()}
          >
            {p.busy
              ? s("Working…", "处理中…")
              : s("Connect wallet", "连接钱包")}
          </Button>
          <label className="setup-file">
            <Upload size={15} />
            {s("Import connection file", "导入连接文件")}
            <input
              aria-label={s("Import connection file", "导入连接文件")}
              type="file"
              accept=".json,application/json"
              disabled={pending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file)
                  void run("import", async () => {
                    if (file.size > 16_384) throw Error("invalidConfig");
                    const data = parsePublicDeployment(
                      JSON.parse(await file.text()),
                    );
                    await p.onNetwork(String(data.chainId));
                    p.onFactory(data.factory);
                  });
              }}
            />
          </label>
          <Button
            variant="outline"
            disabled={pending || !current}
            onClick={() =>
              current &&
              downloadJSON("StepFund-connection.json", {
                chainId: current.chainId,
                factory: current.factoryAddress,
                token: current.tokenAddress,
              })
            }
          >
            <Download size={15} />
            {s("Share connection file", "导出共享连接")}
          </Button>
        </div>
        <p className="muted text-xs">
          {s(
            "Use a connection file from a trusted publisher. Files contain public addresses only; importing one does not prove the contracts are safe. Local Hardhat addresses cannot be shared across unrelated local chains.",
            "请使用可信发布者的连接文件。文件只含公开地址，导入成功不代表合约安全。本地 Hardhat 地址不能用于其他独立本地链。",
          )}
        </p>
        <details
          className="setup-publisher"
          open={publisher}
          onToggle={(e) => setPublisher(e.currentTarget.open)}
        >
          <summary>
            {s(
              "Publisher tools · deploy once, share with everyone",
              "发布者工具 · 部署一次，分享给所有人",
            )}
          </summary>
          <p className="muted">
            {s(
              "Deploy only if you are publishing a new environment. If interrupted, use the same account and network and click again to resume the saved deployment. Participants can use an existing deployment.",
              "仅在发布新环境时部署。如果中途断开，请使用同一账户和网络再次点击，程序会恢复已保存的部署进度。普通参与者可直接使用已有部署。",
            )}
          </p>
          <ConfirmButton
            s={s}
            variant="outline"
            disabled={pending}
            label={s("Deploy / resume contracts", "部署 / 恢复合约")}
            description={s(
              "The token and factory each need a wallet transaction and test ETH gas. A saved unfinished deployment is checked and resumed instead of repeating confirmed steps. Save the downloaded public deployment record.",
              "代币和工厂各需一笔钱包交易及测试 ETH 手续费。若存在未完成的部署，程序会先核实并恢复，不重复已确认的步骤。完成后请保存下载的公开部署记录。",
            )}
            onConfirm={() => void p.onDeploy()}
          />
          <VerificationTools
            s={s}
            connection={current}
            disabled={pending}
            notifyError={p.notifyError}
          />
        </details>
      </section>
    </div>
  );
}

function VerificationTools({
  s,
  connection,
  disabled,
  notifyError,
}: {
  s: Context["s"];
  connection: Connection | null;
  disabled: boolean;
  notifyError: Context["notifyError"];
}) {
  const [kind, setKind] = useState<ContractKind>("StepFundFactory");
  const [campaign, setCampaign] = useState("");
  const [result, setResult] = useState<VerificationState | null>(null);
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  const address =
    kind === "TestUSD"
      ? connection?.tokenAddress
      : kind === "StepFundFactory"
        ? connection?.factoryAddress
        : campaign.trim();
  const allowed =
    connection?.chainId === 11155111 && !!address && !disabled && !busy;
  useEffect(() => {
    epoch.current++;
    setResult(null);
  }, [address, kind, connection]);
  useEffect(
    () => () => {
      epoch.current++;
    },
    [],
  );
  async function verify(submit: boolean) {
    if (!allowed || !connection || !address) return;
    const rev = ++epoch.current;
    setBusy(true);
    try {
      if (
        kind === "MilestoneCampaign" &&
        !(await new Contract(
          connection.factoryAddress,
          FACTORY_ABI,
          new BrowserProvider(walletProvider()),
        ).isCampaign(address))
      )
        throw Error("invalidFactory");
      const next = submit
        ? await submitVerification(address, kind)
        : result?.state === "pending" && result.id
          ? await pollVerification(result.id, address)
          : await checkVerification(address);
      if (rev === epoch.current) setResult(next);
    } catch (e) {
      if (rev === epoch.current) {
        setResult({ state: "unavailable" });
        notifyError(errorKey(e));
      }
    } finally {
      setBusy(false);
    }
  }
  const labels = {
    verified: s(
      "Creation and runtime source verified on Sourcify",
      "Sourcify 已验证创建与运行时代码",
    ),
    partial: s(
      "Partial match — verification is incomplete",
      "部分匹配，验证尚未完成",
    ),
    pending: s(
      "Submitted — refresh to check the result",
      "已提交，请刷新检查结果",
    ),
    unverified: s("Not verified on Sourcify", "Sourcify 尚未验证"),
    failed: s("Verification failed", "验证失败"),
    unavailable: s(
      "Verification status unavailable — not confirmed",
      "验证状态暂不可用，尚未确认",
    ),
  };
  return (
    <div className="setup-verification">
      <h4>
        {s("Source verification · no API key", "源码验证 · 无须 API Key")}
      </h4>
      <p className="muted">
        {s(
          "Submit the bundled Solidity source and compiler settings to Sourcify. Verification publishes source code and checks bytecode; it is not a security audit or a guarantee of Etherscan verification.",
          "将程序内置的 Solidity 源码与编译配置提交至 Sourcify。验证会公开源码并比对字节码，不代表安全审计，也不代表 Etherscan 已验证。",
        )}
      </p>
      <Picker
        label={s("Contract to verify", "待验证合约")}
        value={kind}
        onChange={(v) => {
          if (!busy) setKind(v as ContractKind);
        }}
        items={[
          { value: "StepFundFactory", label: s("Project factory", "项目工厂") },
          { value: "TestUSD", label: s("Test token", "测试代币") },
          {
            value: "MilestoneCampaign",
            label: s("Individual project escrow", "单个项目托管合约"),
          },
        ]}
      />
      {kind === "MilestoneCampaign" && (
        <label className="field">
          {s("Project contract address", "项目合约地址")}
          <Input
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            disabled={busy}
            placeholder="0x…"
          />
        </label>
      )}
      {address && <code className="setup-address">{address}</code>}
      <div className="setup-buttons">
        <Button disabled={!allowed} onClick={() => void verify(true)}>
          {s("Submit source verification", "提交源码验证")}
        </Button>
        <Button
          variant="outline"
          disabled={!allowed}
          onClick={() => void verify(false)}
        >
          {s("Check verification status", "检查验证状态")}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            void verificationInput(kind)
              .then((data) =>
                downloadJSON(`${kind}-standard-input.json`, data.stdJsonInput),
              )
              .catch((e) => notifyError(errorKey(e)));
          }}
        >
          <Download size={15} />
          {s("Export compiler input", "导出编译输入")}
        </Button>
      </div>
      {result && (
        <p className="setup-result" role="status">
          {labels[result.state]}
          {result.detail ? ` (${result.detail})` : ""}
        </p>
      )}
      {!connection && (
        <p className="muted">
          {s(
            "Connect to a deployed factory above first.",
            "请先在上方连接已部署的工厂合约。",
          )}
        </p>
      )}
      {connection?.chainId === 31337 && (
        <p className="muted">
          {s(
            "Public verification is available on Sepolia, not a private local chain.",
            "公共验证仅适用于 Sepolia，本地私有链无法提交。",
          )}
        </p>
      )}
      {connection?.chainId === 11155111 && address && (
        <div className="setup-links">
          <a
            target="_blank"
            rel="noreferrer"
            href={`https://repo.sourcify.dev/11155111/${address}`}
          >
            Sourcify <ExternalLink size={13} />
          </a>
          <a
            target="_blank"
            rel="noreferrer"
            href={`https://sepolia.etherscan.io/address/${address}#code`}
          >
            Etherscan <ExternalLink size={13} />
          </a>
        </div>
      )}
      <p className="muted text-xs">
        {s(
          "For Etherscan, upload the exported Standard JSON input using Solidity 0.8.30, optimizer 200, viaIR, Paris. The source package also includes the Etherscan verification script. Verify each newly created project escrow as well.",
          "如需 Etherscan 验证，可上传导出的 Standard JSON 输入，使用 Solidity 0.8.30、优化 200 次、viaIR、Paris。源码包也保留 Etherscan 验证脚本。新创建的项目托管合约也需分别验证。",
        )}
      </p>
    </div>
  );
}
