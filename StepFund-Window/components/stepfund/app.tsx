"use client";
import { CurrencyUnit } from "./currency";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Compass,
  Wallet,
  Vote,
  Plus,
  ArrowUpRight,
  ShieldCheck,
  Languages,
  Search,
  RefreshCw,
  Clock,
  FlaskConical,
  Activity as ActivityIcon,
  Settings2,
  Download,
  CheckCircle2,
  Loader2,
  X,
  ChartNoAxesCombined,
  ListChecks,
} from "lucide-react";
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  ACCOUNTS,
  seed,
  transition,
  money,
  short,
  accountName,
  claimable,
  bondShare,
  votingWeight,
  participated,
  type Lang,
  type State,
  type Project,
  type Action,
  type Activity,
} from "@/lib/stepfund/model";
import {
  connect,
  readChain,
  transact,
  errorKey,
  switchNetwork,
  walletChain,
  deployFromWallet,
  type Connection,
} from "@/lib/stepfund/chain";
import {
  Amount,
  ConfirmButton,
  Picker,
  Empty,
  dateTime,
  remaining,
  statusLabel,
  categoryLabel,
  errors,
  type Context,
} from "./shared";
import { CreateProject } from "./create";
import { ProjectDetail } from "./detail";
import { WalletSetup } from "./wallet-setup";
import { Finance, TaskCenter } from "./insights";
import { TransactionJournal } from "./transactions";
import { LauncherStatus } from "./launcher-status";
import { ActionArrow, ProgressPrint, ProjectCover, StepMark } from "./identity";
import { CurrencyContext } from "./currency";
import { walletProvider, onWalletSelection } from "@/lib/stepfund/wallet";
type View =
  | "explore"
  | "portfolio"
  | "governance"
  | "finance"
  | "tasks"
  | "create"
  | "activity"
  | "settings"
  | "detail";
const STORAGE = "stepfund-practice-v2";
type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      description: string;
      inputSchema: object;
      annotations: object;
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ) => unknown;
};
function NavButton({
  title,
  icon: Icon,
  active,
  onClick,
}: {
  title: string;
  icon: typeof Compass;
  active: boolean;
  onClick: () => void;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        size="lg"
        isActive={active}
        onClick={() => {
          onClick();
          setOpenMobile(false);
        }}
      >
        <Icon />
        <span>{title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
export default function StepFund() {
  const [lang, setLang] = useState<Lang>("en");
  const s = (en: string, zh: string) => (lang === "zh" ? zh : en).replaceAll("tUSD", unit);
  const [demo, setDemo] = useState<State>(() => seed(1790755200));
  const demoRef = useRef(demo);
  demoRef.current = demo;
  const [ready, setReady] = useState(false);
  const [actor, setActor] = useState(ACCOUNTS[0].address);
  const [mode, setMode] = useState<"practice" | "chain">("practice");
  const [view, setView] = useState<View>("explore");
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [portfolioTab, setPortfolioTab] = useState("backed");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);
  const [factory, setFactory] = useState("");
  const [configLoading, setConfigLoading] = useState(false);
  const configRequest = useRef(0);
  const [network, setNetwork] = useState("11155111");
  const [connection, setConnection] = useState<Connection | null>(null);
  const unit = mode === "chain" ? connection?.unit || "tUSD" : "tUSD";
  const [chain, setChain] = useState<{
    projects: Project[];
    balance: number;
    now: number;
    count: number;
  }>({ projects: [], balance: 0, now: 0, count: 0 });
  const [limit, setLimit] = useState(24);
  const [chainActivity, setChainActivity] = useState<Activity[]>([]);
  const busyRef = useRef(false);
  const walletEpoch = useRef(0);
  const readEpoch = useRef(0);
  const projects = mode === "practice" ? demo.projects : chain.projects;
  const who = mode === "practice" ? actor : connection?.account || "";
  const now = mode === "practice" ? demo.now : chain.now;
  const balance =
    mode === "practice" ? demo.balances[actor] || 0 : chain.balance;
  const activity = mode === "practice" ? demo.activity : chainActivity;
  const openProject = (id: string) => {
    setSelected(id);
    setView("detail");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const notifyError = (key: string) => {
    const msg = errors[key] || errors.rpcError;
    toast.error(msg[lang === "zh" ? 1 : 0]);
  };
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE);
      if (saved) {
        const data = JSON.parse(saved);
        if (
          data.version === 2 &&
          Array.isArray(data.projects) &&
          Array.isArray(data.activity) &&
          data.balances &&
          Number.isFinite(data.now) &&
          data.projects.every(
            (p: Project) =>
              p.title?.en &&
              p.title?.zh &&
              Array.isArray(p.stages) &&
              p.contributions &&
              Array.isArray(p.claims) &&
              Number.isFinite(p.goal) &&
              p.goal > 0,
          )
        )
          setDemo(data);
        else setDemo(seed());
      } else setDemo(seed());
      const pref = localStorage.getItem("stepfund-language");
      if (pref === "zh" || pref === "en") setLang(pref);
    } catch {
      setDemo(seed());
    }
    setReady(true);
  }, []);
  useEffect(() => {
    toast.dismiss();
  }, [lang]);
  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    try {
      localStorage.setItem(STORAGE, JSON.stringify(demo));
      localStorage.setItem("stepfund-language", lang);
    } catch {
      /* UI remains usable in memory when browser storage is unavailable. */
    }
  }, [demo, lang, ready]);
  useEffect(() => {
    const changed = () => {
      walletEpoch.current++;
      readEpoch.current++;
      setConnection(null);
      setChain({ projects: [], balance: 0, now: 0, count: 0 });
      setChainActivity([]);
    };
    let unbind = () => {};
    const bind = () => {
      unbind();
      try {
        const provider = walletProvider();
        provider.on?.("accountsChanged", changed);
        provider.on?.("chainChanged", changed);
        provider.on?.("disconnect", changed);
        unbind = () => {
          provider.removeListener?.("accountsChanged", changed);
          provider.removeListener?.("chainChanged", changed);
          provider.removeListener?.("disconnect", changed);
        };
      } catch {
        /* No wallet until the user connects. */
      }
    };
    bind();
    const unsubscribe = onWalletSelection(() => {
      changed();
      bind();
    });
    return () => {
      unsubscribe();
      unbind();
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (!connection) return;
    const timer = setInterval(() => {
      if (!busyRef.current) {
        const revision = readEpoch.current;
        void readChain(connection, limit)
          .then((data) => {
            if (
              !cancelled &&
              !busyRef.current &&
              revision === readEpoch.current
            )
              setChain(data);
          })
          .catch(() => {
            /* The explicit refresh button reports connection failures. */
          });
      }
    }, 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [connection, limit]);
  const live = useRef({ projects, openProject, mode, lang });
  live.current = { projects, openProject, mode, lang };
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Parameters<ModelContext["registerTool"]>[0]) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
        /* Optional API may be unavailable. */
      }
    };
    register({
      name: "stepfund_list_projects",
      description:
        "Read currently loaded projects and their funding and voting states. Practice projects are simulated; chain projects come from the connected testnet.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input) {
        if (!input || typeof input !== "object" || Object.keys(input).length)
          throw Error("Expected an empty object");
        return {
          mode: live.current.mode,
          projects: live.current.projects.map((p) => ({
            id: p.id,
            title: p.title[live.current.lang],
            status: p.status,
            raisedTUSD: money(p.raised),
            goalTUSD: money(p.goal),
          })),
        };
      },
    });
    register({
      name: "stepfund_open_project",
      description:
        "Navigate to an existing loaded project; does not contribute, vote or send a transaction.",
      inputSchema: {
        type: "object",
        properties: { projectId: { type: "string" } },
        required: ["projectId"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        if (
          !input ||
          typeof input !== "object" ||
          Object.keys(input).length !== 1 ||
          !("projectId" in input) ||
          typeof input.projectId !== "string" ||
          !live.current.projects.some((p) => p.id === input.projectId)
        )
          throw Error("Unknown project");
        const id = input.projectId;
        live.current.openProject(id);
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        return { openedProjectId: id };
      },
    });
    return () => lifecycle.abort();
  }, []);
  async function loadDefaults(chainId: string) {
    const request = ++configRequest.current;
    setConfigLoading(true);
    setNetwork(chainId);
    setFactory("");
    try {
      const saved = localStorage.getItem("stepfund-factory-" + chainId);
      if (saved) {
        setFactory(saved);
        return;
      }
      const result = await fetch(`/deployments/${chainId}.json`);
      if (request !== configRequest.current) return;
      if (!result.ok) {
        setFactory("");
        return;
      }
      const data = (await result.json()) as { factory?: string };
      if (request === configRequest.current) setFactory(data.factory || "");
    } catch {
      if (request === configRequest.current) setFactory("");
    } finally {
      if (request === configRequest.current) setConfigLoading(false);
    }
  }
  async function openWallet() {
    setConfigLoading(true);
    setConnectOpen(true);
    try {
      const id = await walletChain();
      await loadDefaults(
        String([31337, 11155111].includes(id) ? id : 11155111),
      );
    } catch {
      await loadDefaults(network);
    }
  }
  async function connectWallet() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const epoch = walletEpoch.current;
    try {
      const c = await connect(factory.trim());
      if (c.chainId !== Number(network)) throw Error("wrongNetwork");
      const data = await readChain(c, limit);
      if (epoch !== walletEpoch.current) throw Error("walletChanged");
      readEpoch.current++;
      setConnection(c);
      setChain(data);
      setMode("chain");
      setView("explore");
      setChainActivity([]);
      setConnectOpen(false);
      try {
        localStorage.setItem("stepfund-factory-" + c.chainId, c.factoryAddress);
        const saved = JSON.parse(
          localStorage.getItem(
            `stepfund-transactions-${c.chainId}-${c.account}-${c.factoryAddress}`,
          ) || "[]",
        );
        if (Array.isArray(saved)) setChainActivity(saved);
      } catch {}
      toast.success(
        s(
          "Wallet connected. Reading real testnet contracts.",
          "钱包已连接，已读取真实测试链合约。",
        ),
      );
    } catch (e) {
      notifyError(errorKey(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function deployWallet() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const data = await deployFromWallet(Number(network), setPhase);
      setFactory(data.factory);
      try {
        localStorage.setItem("stepfund-factory-" + data.chainId, data.factory);
      } catch {}
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = data.chainId + ".json";
      link.click();
      URL.revokeObjectURL(url);
      toast.success(
        s(
          "Contracts deployed. Save the downloaded deployment record, then choose Connect wallet to load the projects.",
          "合约已部署，请保存下载的部署记录，再点击“连接钱包”加载项目。",
        ),
      );
    } catch (e) {
      notifyError(errorKey(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
      setPhase("");
    }
  }
  async function refresh(nextLimit = limit) {
    if (!connection) {
      void openWallet();
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const epoch = walletEpoch.current;
    readEpoch.current++;
    try {
      const next = await readChain(connection, nextLimit);
      if (epoch !== walletEpoch.current) throw Error("walletChanged");
      setChain(next);
      setLimit(nextLimit);
    } catch (e) {
      notifyError(errorKey(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function act(action: Action): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    const epoch = walletEpoch.current;
    readEpoch.current++;
    try {
      if (mode === "practice") {
        const next = transition(demoRef.current, actor, action);
        demoRef.current = next;
        setDemo(next);
        if (action.kind === "create") openProject(next.projects[0].id);
        toast.success(
          s(
            "Practice action completed. No blockchain transaction was sent.",
            "演示操作完成，没有发送链上交易。",
          ),
        );
      } else {
        if (!connection) throw Error("walletChanged");
        const result = await transact(connection, action, setPhase);
        setChainActivity((previous) => {
          if (epoch !== walletEpoch.current) {
            try {
              const key = `stepfund-transactions-${connection.chainId}-${connection.account}-${connection.factoryAddress}`;
              const saved = JSON.parse(localStorage.getItem(key) || "[]");
              localStorage.setItem(
                key,
                JSON.stringify([
                  result.activity,
                  ...(Array.isArray(saved) ? saved : []),
                ]),
              );
            } catch {}
            return previous;
          }
          const next = [result.activity, ...previous];
          try {
            localStorage.setItem(
              `stepfund-transactions-${connection.chainId}-${connection.account}-${connection.factoryAddress}`,
              JSON.stringify(next),
            );
          } catch {}
          return next;
        });
        toast.success(
          s("Transaction confirmed on the testnet.", "交易已在测试链上确认。"),
        );
        try {
          const next = await readChain(connection, limit);
          if (epoch === walletEpoch.current) setChain(next);
        } catch {
          toast.warning(
            s(
              "Transaction confirmed. Refresh to update the project data.",
              "交易已确认，请刷新以更新项目数据。",
            ),
          );
        }
        if (result.createdId && epoch === walletEpoch.current)
          openProject(result.createdId);
      }
      return true;
    } catch (e) {
      notifyError(errorKey(e));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
      setPhase("");
    }
  }
  const ctx: Context = {
    s,
    lang,
    actor: who,
    now,
    mode,
    chainId: connection?.chainId,
    protocolVersion: connection?.protocolVersion,
    verifier: connection?.verifier,
    unit,
    busy: busy || !ready || (mode === "chain" && !connection),
    act,
    notifyError,
  };
  const activeProject = projects.find((p) => p.id === selected);
  const nav = [
    {
      id: "explore" as View,
      label: s("Explore projects", "发现项目"),
      icon: Compass,
    },
    {
      id: "portfolio" as View,
      label: s("My portfolio", "我的参与"),
      icon: Wallet,
    },
    {
      id: "governance" as View,
      label: s("Governance", "投票治理"),
      icon: Vote,
    },
    {
      id: "create" as View,
      label: s("Create project", "创建项目"),
      icon: Plus,
    },
    {
      id: "finance" as View,
      label: s("Fund transparency", "资金透明看板"),
      icon: ChartNoAxesCombined,
    },
    {
      id: "tasks" as View,
      label: s("Action center", "统一待办中心"),
      icon: ListChecks,
    },
    {
      id: "activity" as View,
      label: s("Activity", "操作记录"),
      icon: ActivityIcon,
    },
  ];
  const myVotes = projects.filter(
    (p) =>
      p.status === "active" &&
      p.stages[p.current]?.state === "voting" &&
      votingWeight(p, who) > 0 &&
      !participated(p, who) &&
      now < p.stages[p.current].votingEnds,
  );
  let visible = projects.filter(
    (p) =>
      `${p.title.en} ${p.title.zh} ${p.summary.en} ${p.summary.zh}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "all" || p.status === filter),
  );
  if (view === "portfolio")
    visible = visible.filter((p) =>
      portfolioTab === "created"
        ? p.creator === who
        : (p.contributions[who] || 0) > 0,
    );
  if (view === "governance")
    visible = projects.filter(
      (p) => p.status === "active" && p.stages[p.current]?.state === "voting",
    );
  function exportActivity() {
    const data = JSON.stringify(
      {
        mode,
        chainId: connection?.chainId || null,
        account: who,
        exportedAt: new Date().toISOString(),
        transactions: activity,
      },
      null,
      2,
    );
    const url = URL.createObjectURL(
      new Blob([data], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `StepFund-${mode}-activity.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <CurrencyContext.Provider value={unit}><SidebarProvider style={{ "--sidebar-width": "14rem" } as CSSProperties}>
      <Sidebar>
        <SidebarHeader className="brand">
          <StepMark />
          <strong>
            StepFund<span>{s("MILESTONE FUNDING", "里程碑众筹")}</span>
          </strong>
        </SidebarHeader>
        <SidebarContent className="px-4 py-6">
          <small className="eyebrow">{s("WORKSPACE", "工作台")}</small>
          <SidebarMenu>
            {nav.map((n) => (
              <NavButton
                key={n.id}
                icon={n.icon}
                title={n.label}
                active={view === n.id}
                onClick={() => {
                  setView(n.id);
                  setQuery("");
                  setFilter("all");
                }}
              />
            ))}
          </SidebarMenu>
          <div className="nav-divider" />
          <small className="eyebrow">{s("PREFERENCES", "偏好设置")}</small>
          <SidebarMenu>
            <NavButton
              icon={Settings2}
              title={s("Network & practice", "网络与演示")}
              active={view === "settings"}
              onClick={() => setView("settings")}
            />
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-5">
          <div className="secure-note">
            <ShieldCheck size={21} />
            <strong>
              {s("Progress before payouts", "验证进展，再释放资金")}
            </strong>
            <p>
              {s(
                "Milestone budgets stay in escrow until backers approve.",
                "阶段资金托管于合约，由支持者投票批准释放。",
              )}
            </p>
          </div>
          <small className="muted mt-3">
            StepFund · {s("Testnet only", "仅限测试链")}
          </small>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="topbar">
          <div className="flex items-center gap-3">
            <SidebarTrigger
              aria-label={s("Toggle navigation", "展开或收起导航")}
            />
            <span>
              {s("Workspace", "工作台")} /{" "}
              {nav.find((n) => n.id === view)?.label ||
                (view === "settings"
                  ? s("Settings", "设置")
                  : s("Project", "项目"))}
            </span>
          </div>
          <div className="flex gap-3 items-center">
            <Button
              variant="outline"
              onClick={() => setLang(lang === "en" ? "zh" : "en")}
              aria-label={s("Switch to Chinese", "切换为英文")}
            >
              <Languages size={16} />
              {lang === "en" ? "中文" : "English"}
            </Button>
            <Button disabled={busy || !ready} onClick={() => void openWallet()}>
              <Wallet size={16} />
              <span>
                {mode === "chain" && connection
                  ? short(connection.account)
                  : s("Connect wallet", "连接钱包")}
              </span>
            </Button>
          </div>
        </header>
        <div className="workspace" data-ready={ready} data-view={view}>
          <div
            className={"practice-bar " + (mode === "chain" ? "chain-bar" : "")}
          >
            <span className="status-dot" />
            <strong>
              {mode === "practice"
                ? s("Practice mode", "演示模式")
                : connection?.chainId === 11155111
                  ? "Sepolia"
                  : connection
                    ? "Hardhat Local"
                    : s("Wallet disconnected", "钱包未连接")}
            </strong>
            <span>
              {mode === "practice"
                ? s(
                    "Simulated tokens · Saved in this browser",
                    "模拟代币 · 进度保存在此浏览器",
                  )
                : s(
                    "Real testnet transactions · No real-money assets",
                    "真实测试链交易 · 不涉及真实资产",
                  )}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView("settings")}
            >
              {s("Manage", "管理")}
              <ArrowUpRight size={13} />
            </Button>
          </div>
          {busy && (
            <div className="transaction-status" role="status">
              <Loader2 size={16} className="animate-spin" />
              {phase === "deployToken"
                ? s(
                    "Confirm test-token deployment in your wallet…",
                    "请在钱包确认测试代币合约部署…",
                  )
                : phase === "deployFactory"
                  ? s(
                      "Confirm factory deployment in your wallet…",
                      "请在钱包确认工厂合约部署…",
                    )
                  : phase === "approveToken"
                    ? s(
                        "Approve the exact token amount in your wallet, then confirm the contribution.",
                        "请先在钱包批准本次代币额度，再确认出资。",
                      )
                    : phase === "walletConfirm"
                      ? s(
                          "Confirm this action in your wallet…",
                          "请在钱包中确认操作…",
                        )
                      : phase === "recovering"
                        ? s(
                            "Checking the saved deployment before resuming…",
                            "正在核对已保存的部署进度…",
                          )
                        : phase === "confirming"
                          ? s(
                              "Waiting for testnet confirmation. The transaction hash is saved in Network & practice → Transaction recovery.",
                              "正在等待测试链确认，交易哈希已保存在“网络与演示 → 交易状态与恢复”。",
                            )
                          : s("Reading project data…", "正在读取项目数据…")}
            </div>
          )}
          {(view === "explore" ||
            view === "portfolio" ||
            view === "governance") && (
            <>
              <div
                className={
                  "page-heading " +
                  (view === "explore" ? "explore-heading" : "")
                }
              >
                <div className="heading-copy">
                  <p className="eyebrow">
                    {view === "explore"
                      ? s("MAKE PROGRESS TOGETHER", "让每一阶段都有进展")
                      : view === "portfolio"
                        ? s("YOUR FUNDING AT A GLANCE", "掌握你的每一份支持")
                        : s(
                            "VERIFY. VOTE. MOVE FORWARD.",
                            "审查成果，投出你的决定",
                          )}
                  </p>
                  <h1
                    aria-label={
                      view === "explore"
                        ? s(
                            "Good ideas. Accountable funding.",
                            "好创意，值得透明的支持。",
                          )
                        : undefined
                    }
                  >
                    {view === "explore" ? (
                      <>
                        <span className="headline-line">
                          {s("Good ideas.", "好创意，")}
                        </span>
                        {lang === "en" ? " " : ""}
                        <span className="headline-line">
                          {s("Accountable funding.", "值得透明的支持。")}
                        </span>
                      </>
                    ) : view === "portfolio" ? (
                      s("Your projects, in focus.", "你参与的项目，尽在掌握。")
                    ) : (
                      s("Give progress your approval.", "让进展得到你的认可。")
                    )}
                  </h1>
                  <p>
                    {view === "explore"
                      ? s(
                          "Support a project. Review its progress. Decide what comes next.",
                          "支持项目，验证进度，共同决定下一步。",
                        )
                      : view === "portfolio"
                        ? s(
                            "Follow your contributions, manage your projects, and claim available refunds.",
                            "追踪出资、管理项目，并领取可用退款。",
                          )
                        : s(
                            "Review evidence before casting an irreversible, contribution-weighted vote.",
                            "审查成果后按出资权重投票；投票后不可更改。",
                          )}
                  </p>
                  {view === "explore" && (
                    <Button
                      className="create-cta"
                      disabled={ctx.busy}
                      onClick={() => setView("create")}
                    >
                      <Plus size={18} />
                      {s("Create project", "创建项目")}
                    </Button>
                  )}
                </div>
                {view === "explore" ? (
                  <ProgressPrint s={s} />
                ) : (
                  <Button disabled={ctx.busy} onClick={() => setView("create")}>
                    <Plus size={18} />
                    {s("Create project", "创建项目")}
                  </Button>
                )}
              </div>
              <section className="stats">
                <div>
                  <span>
                    {view === "portfolio"
                      ? s("My contributions", "我的出资")
                      : s("Projects to explore", "可探索项目")}
                  </span>
                  <strong>
                    {view === "portfolio"
                      ? money(
                          projects.reduce(
                            (n, p) => n + (p.contributions[who] || 0),
                            0,
                          ),
                          lang,
                        )
                      : String(projects.length).padStart(2, "0")}
                    {view === "portfolio" && <small> <CurrencyUnit /></small>}
                  </strong>
                </div>
                <div>
                  <span>
                    {view === "portfolio"
                      ? s("Available refunds", "可领取退款")
                      : s("Total funded", "已募集资金")}
                  </span>
                  <strong>
                    {money(
                      projects.reduce(
                        (n, p) =>
                          n +
                          (view === "portfolio"
                            ? claimable(p, who) + bondShare(p, who)
                            : p.raised),
                        0,
                      ),
                      lang,
                    )}{" "}
                    <small><CurrencyUnit /></small>
                  </strong>
                </div>
                <div>
                  <span>{s("Milestones approved", "已批准阶段")}</span>
                  <strong>
                    {String(
                      projects.reduce(
                        (n, p) =>
                          n +
                          p.stages.filter((m) => m.state === "approved").length,
                        0,
                      ),
                    ).padStart(2, "0")}
                  </strong>
                </div>
                <div>
                  <span>{s("Awaiting your vote", "等待你的投票")}</span>
                  <strong>{String(myVotes.length).padStart(2, "0")}</strong>
                </div>
              </section>
              <div className="section-heading">
                <h2>
                  {view === "explore"
                    ? s("Discover projects", "发现项目")
                    : view === "portfolio"
                      ? s("My projects", "我的项目")
                      : s("Open milestone votes", "阶段投票")}
                </h2>
                {mode === "chain" && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void refresh()}
                  >
                    <RefreshCw size={15} />
                    {s("Refresh", "刷新")}
                  </Button>
                )}
              </div>
              {view === "portfolio" && (
                <Tabs
                  value={portfolioTab}
                  onValueChange={setPortfolioTab}
                  className="mb-5"
                >
                  <TabsList variant="line">
                    <TabsTrigger value="backed">
                      {s("Backed by me", "我支持的")}
                    </TabsTrigger>
                    <TabsTrigger value="created">
                      {s("Created by me", "我创建的")}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
              {view !== "governance" && (
                <div className="filter-bar">
                  <div className="search-field">
                    <Search size={17} />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      aria-label={s("Search projects", "搜索项目")}
                      placeholder={s("Search projects…", "搜索项目…")}
                    />
                  </div>
                  <Picker
                    label={s("Project status", "项目状态")}
                    value={filter}
                    onChange={setFilter}
                    items={[
                      { value: "all", label: s("All statuses", "全部状态") },
                      { value: "funding", label: s("Funding", "募集中") },
                      { value: "active", label: s("In progress", "执行中") },
                      {
                        value: "refunding",
                        label: s("Refund available", "可退款"),
                      },
                      { value: "completed", label: s("Completed", "已完成") },
                    ]}
                  />
                </div>
              )}
              {visible.length ? (
                <section className="project-grid">
                  {visible.map((p, i) => {
                    const index =
                      p.category === "technology"
                        ? 0
                        : p.category === "education"
                          ? 1
                          : 2;
                    return (
                      <article className="project-card" key={p.id}>
                        <div className={"project-art art-" + index}>
                          <p>
                            {String(i + 1).padStart(2, "0")} /{" "}
                            {categoryLabel(p.category, s).toUpperCase()}
                          </p>
                          <ProjectCover category={p.category} />
                        </div>
                        <div className="card-body">
                          <div className="card-status-row">
                            <span className={"badge status-" + p.status}>
                              {statusLabel(p, s)}
                            </span>
                            <span className="project-edition">
                              {s("PROJECT", "项目")}{" "}
                              {String(i + 1).padStart(2, "0")}
                            </span>
                          </div>
                          <h3>{p.title[lang]}</h3>
                          <p>{p.summary[lang]}</p>
                          <div className="raised">
                            <strong>{money(p.raised, lang)} <CurrencyUnit /></strong>
                            <span>/ {money(p.goal, lang)}</span>
                          </div>
                          <Progress
                            aria-label={s("Funding progress", "募资进度")}
                            value={(p.raised / p.goal) * 100}
                          />
                          <div className="card-meta">
                            <span>
                              {p.stages.length} {s("milestones", "个阶段")}
                            </span>
                            <span>
                              {p.status === "funding"
                                ? remaining(p.fundingEnds, now, s)
                                : `${p.stages.filter((m) => m.state === "approved").length} / ${p.stages.length} ${s("approved", "已批准")}`}
                            </span>
                          </div>
                          {view === "portfolio" && (
                            <p className="portfolio-stake">
                              {s("Your contribution", "你的出资")}:{" "}
                              {money(p.contributions[who] || 0, lang)} <CurrencyUnit />
                            </p>
                          )}
                          <Button
                            variant="outline"
                            className="w-full project-open"
                            onClick={() => openProject(p.id)}
                          >
                            {view === "governance"
                              ? s("Review & vote", "审查并投票")
                              : s("View project", "查看项目")}
                            <ActionArrow />
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </section>
              ) : (
                <Empty
                  title={s("No matching projects", "没有匹配的项目")}
                  description={
                    mode === "chain" && !connection
                      ? s(
                          "Connect your wallet to load testnet projects.",
                          "连接钱包以加载测试链项目。",
                        )
                      : s(
                          "Try a different filter, or create a new project.",
                          "请调整筛选条件，或创建一个新项目。",
                        )
                  }
                />
              )}
              {mode === "chain" && chain.count > projects.length && (
                <Button
                  className="mt-6"
                  variant="outline"
                  onClick={() => void refresh(limit + 24)}
                  disabled={busy}
                >
                  {s("Load more projects", "加载更多项目")}
                </Button>
              )}
            </>
          )}
          {view === "finance" && (
            <Finance
              ctx={ctx}
              projects={projects}
              totalCount={mode === "chain" ? chain.count : projects.length}
              onOpen={openProject}
            />
          )}
          {view === "tasks" && (
            <TaskCenter
              ctx={ctx}
              projects={projects}
              totalCount={mode === "chain" ? chain.count : projects.length}
              onOpen={openProject}
            />
          )}
          {view === "create" && <CreateProject ctx={ctx} />}
          {view === "detail" &&
            (activeProject ? (
              <ProjectDetail
                key={activeProject.id}
                project={activeProject}
                ctx={ctx}
                onBack={() => setView("explore")}
              />
            ) : (
              <Empty
                title={s("Project is not loaded", "项目尚未加载")}
                description={s(
                  "Refresh your connection or return to Explore projects.",
                  "请刷新钱包连接或返回发现项目。",
                )}
              />
            ))}
          {view === "activity" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {s("A CLEAR RECORD", "每一步都有记录")}
                  </p>
                  <h1>{s("Activity history", "操作记录")}</h1>
                  <p>
                    {mode === "practice"
                      ? s(
                          "Local simulation history. These entries are not blockchain transactions.",
                          "本地模拟操作记录，以下记录并非链上交易。",
                        )
                      : s(
                          "Confirmed transactions sent from this browser. Your wallet or block explorer provides the full chain history.",
                          "通过本浏览器发送的已确认交易；完整链上记录请查看钱包或区块浏览器。",
                        )}
                  </p>
                </div>
                <Button variant="outline" onClick={exportActivity}>
                  <Download size={16} />
                  {s("Export JSON", "导出 JSON")}
                </Button>
              </div>
              {activity.length ? (
                <section className="panel !p-0 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{s("Action", "操作")}</TableHead>
                        <TableHead>{s("Project", "项目")}</TableHead>
                        <TableHead>{s("Account", "账户")}</TableHead>
                        <TableHead>{s("Time", "时间")}</TableHead>
                        <TableHead>{s("Record", "记录")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activity.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{actionLabel(item.kind, s)}</TableCell>
                          <TableCell>
                            <button
                              className="subtle-link"
                              onClick={() => openProject(item.projectId)}
                            >
                              {projects.find((p) => p.id === item.projectId)
                                ?.title[lang] ||
                                s("Test-token faucet", "测试代币水龙头")}
                            </button>
                          </TableCell>
                          <TableCell>
                            {mode === "practice"
                              ? accountName(item.actor)
                              : short(item.actor)}
                          </TableCell>
                          <TableCell>{dateTime(item.time, lang)}</TableCell>
                          <TableCell>
                            {item.hash && connection?.chainId === 11155111 ? (
                              <a
                                className="subtle-link"
                                target="_blank"
                                rel="noreferrer"
                                href={
                                  "https://sepolia.etherscan.io/tx/" + item.hash
                                }
                              >
                                {short(item.hash)} ↗
                              </a>
                            ) : item.hash ? (
                              <code title={item.hash}>{short(item.hash)}</code>
                            ) : (
                              <span className="badge">
                                {s("Simulated", "模拟")}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </section>
              ) : (
                <Empty
                  title={s("No activity yet", "暂无操作记录")}
                  description={s(
                    "Your completed actions will appear here.",
                    "已完成的操作将显示在这里。",
                  )}
                />
              )}
            </>
          )}
          {view === "settings" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">{s("YOUR WORKSPACE", "你的工作台")}</p>
                  <h1>{s("Network & practice", "网络与演示")}</h1>
                  <p>
                    {s(
                      "Learn the full workflow locally, or connect to real testnet contracts.",
                      "可在本地演练完整流程，也可连接真实测试链合约。",
                    )}
                  </p>
                </div>
              </div>
              <div className="settings-grid">
                <section className="panel">
                  <FlaskConical size={27} />
                  <h2 className="mt-4">
                    {s("Practice workspace", "演示工作台")}
                  </h2>
                  <p className="muted">
                    {s(
                      "Simulated balances and projects stay in this browser. Switch roles and advance time to explore voting, payouts and refunds.",
                      "模拟余额与项目保存在此浏览器。切换角色、推进时间，体验投票、放款与退款。",
                    )}
                  </p>
                  <Button
                    className="mt-5"
                    variant={mode === "practice" ? "secondary" : "default"}
                    onClick={() => {
                      setMode("practice");
                      setView("explore");
                    }}
                    disabled={busy}
                  >
                    {mode === "practice"
                      ? s("Practice is active", "当前为演示模式")
                      : s("Open practice mode", "进入演示模式")}
                  </Button>
                  <div className="field">
                    <span>{s("Practice account", "演示账户")}</span>
                    <Picker
                      label={s("Practice account", "演示账户")}
                      value={actor}
                      onChange={setActor}
                      items={ACCOUNTS.map((a) => ({
                        value: a.address,
                        label:
                          a.name +
                          (a.name === "Morgan"
                            ? s(" · Creator", " · 创建者")
                            : s(" · Backer", " · 支持者")),
                      }))}
                    />
                  </div>
                  <p className="muted">
                    {s("Simulated time", "模拟时间")}:{" "}
                    {dateTime(demo.now, lang)}
                  </p>
                  <div className="action-row mt-4">
                    <Button
                      variant="outline"
                      disabled={busy || mode !== "practice"}
                      onClick={() => void act({ kind: "advance" })}
                    >
                      <Clock size={15} />
                      {s("Advance 1 day", "推进 1 天")}
                    </Button>
                    <ConfirmButton
                      s={s}
                      variant="outline"
                      disabled={busy}
                      label={s("Reset practice", "重置演示")}
                      description={s(
                        "This deletes your local practice projects and restores the sample scenarios. Blockchain data is unaffected.",
                        "此操作将删除本地演示项目并恢复示例场景，不影响链上数据。",
                      )}
                      onConfirm={() => {
                        const next = seed();
                        demoRef.current = next;
                        setDemo(next);
                        setSelected("");
                        toast.success(
                          s("Practice workspace reset.", "演示工作台已重置。"),
                        );
                      }}
                    />
                  </div>
                </section>
                <section className="panel">
                  <Wallet size={27} />
                  <h2 className="mt-4">{s("Testnet wallet", "测试链钱包")}</h2>
                  <p className="muted">
                    {s(
                      "Connect a phone wallet by QR code or use a browser wallet. The connection center includes test funds, shared deployments and source verification.",
                      "扫码连接手机钱包，或使用浏览器钱包。连接中心内置测试币准备、共享合约配置与源码验证。",
                    )}
                  </p>
                  <dl className="facts">
                    <div>
                      <dt>{s("Mode", "模式")}</dt>
                      <dd>
                        {mode === "practice"
                          ? s("Practice", "演示")
                          : connection?.chainId === 11155111
                            ? "Sepolia"
                            : "Hardhat Local"}
                      </dd>
                    </div>
                    <div>
                      <dt>{s("Account", "账户")}</dt>
                      <dd>
                        {who
                          ? mode === "practice"
                            ? accountName(who)
                            : short(who)
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>{s("Available balance", "可用余额")}</dt>
                      <dd>
                        <Amount value={balance} lang={lang} />
                      </dd>
                    </div>
                  </dl>
                  <div className="action-row">
                    <Button disabled={busy} onClick={() => void openWallet()}>
                      {s("Connect / configure", "连接 / 配置")}
                    </Button>
                    <Button
                      disabled={ctx.busy}
                      variant="outline"
                      onClick={() => void act({ kind: "faucet" })}
                    >
                      {s("Get 1,000 test tUSD", "领取 1,000 测试 tUSD")}
                    </Button>
                  </div>
                  <p className="muted text-xs mt-4">
                    {s(
                      "On-chain faucet: once per address per 24 hours. You also need test ETH for transaction gas. Practice faucet has no cooldown.",
                      "链上水龙头每个地址每 24 小时可领取一次，另需测试 ETH 支付手续费。演示水龙头无冷却时间。",
                    )}
                  </p>
                </section>
              </div>
              <div className="mt-6">
                <TransactionJournal
                  ctx={ctx}
                  onRefresh={() => {
                    if (connection) void refresh();
                  }}
                />
              </div>
              <div className="mt-6">
                <LauncherStatus ctx={ctx} />
              </div>
              <section className="panel mt-6">
                <h2>
                  <CheckCircle2 size={21} className="inline mr-2" />
                  {s("A complete walkthrough", "完整体验流程")}
                </h2>
                <ol className="walkthrough">
                  <li>
                    {s(
                      "As a backer, open Campus Maker Space and approve or reject the current milestone.",
                      "以支持者身份打开“校园共享创客空间”，赞成或反对当前阶段。",
                    )}
                  </li>
                  <li>
                    {s(
                      "Advance one day in practice settings, then settle the vote on the project page.",
                      "在演示设置中推进一天，再返回项目页面结算投票。",
                    )}
                  </li>
                  <li>
                    {s(
                      "Switch to Morgan to withdraw approved funds or submit evidence for the next milestone.",
                      "切换为 Morgan，提取已批准资金或提交下一阶段成果。",
                    )}
                  </li>
                  <li>
                    {s(
                      "Switch back to Alex and claim the available refund from Open Air Quality Network.",
                      "切换回 Alex，在“开放空气质量网络”领取可用退款。",
                    )}
                  </li>
                  <li>
                    {s(
                      "Create your own project, switch accounts to contribute, and run its complete lifecycle.",
                      "创建自己的项目，切换账户出资，体验完整生命周期。",
                    )}
                  </li>
                </ol>
              </section>
            </>
          )}
          <footer className="workspace-footer">
            <span>StepFund</span>
            <span>
              {s(
                "Test tokens only. Evidence is reviewed by backers.",
                "仅使用测试代币。项目成果由支持者审查。",
              )}
            </span>
          </footer>
        </div>
      </SidebarInset>
      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent
          showCloseButton={false}
          className="setup-dialog sm:max-w-4xl"
        >
          <DialogClose
            className="absolute right-4 top-4"
            aria-label={s("Close", "关闭")}
          >
            <X size={18} />
          </DialogClose>
          <DialogTitle className="sr-only">
            {s("Connection center", "连接中心")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {s(
              "Connect a wallet, prepare test funds, and join or publish a shared deployment.",
              "连接钱包、准备测试币，接入或发布共享合约。",
            )}
          </DialogDescription>
          <WalletSetup
            s={s}
            busy={busy}
            configLoading={configLoading}
            network={network}
            factory={factory}
            connection={mode === "chain" ? connection : null}
            notifyError={notifyError}
            onNetwork={loadDefaults}
            onFactory={setFactory}
            onConnect={connectWallet}
            onDeploy={deployWallet}
            onFaucet={() => act({ kind: "faucet" })}
          />
        </DialogContent>
      </Dialog>
      <Toaster theme="light" richColors position="bottom-right" />
    </SidebarProvider></CurrencyContext.Provider>
  );
}
function actionLabel(kind: string, s: Context["s"]) {
  const labels: Record<string, [string, string]> = {
    contribute: ["Contribution", "出资"],
    create: ["Project created", "创建项目"],
    finalize: ["Funding finalized", "募资结算"],
    evidence: ["Evidence submitted", "提交成果"],
    voteYes: ["Approval vote", "赞成投票"],
    voteNo: ["Rejection vote", "反对投票"],
    settle: ["Vote settled", "投票结算"],
    expire: ["Overdue project ended", "终止逾期项目"],
    refund: ["Refund claimed", "领取退款"],
    withdraw: ["Creator withdrawal", "创建者提款"],
    withdrawBond: ["Bond returned", "退还保证金"],
    delegate: ["Voting delegation changed", "变更投票委托"],
    investTreasury: ["Principal deposited in vault", "本金存入资金库"],
    rescueTreasury: ["Treasury recovery opened", "开放资金库救济"],
    claimYield: ["Yield / vault shares claimed", "领取收益 / 资金库份额"],
    attestPrivate: ["Private evidence attested", "私密成果已确认"],
    privateEvidence: ["Private proof verified", "隐私证明已验证"],
    pause: ["Funding paused", "暂停募资"],
    unpause: ["Funding resumed", "恢复募资"],
    faucet: ["Test tokens claimed", "领取测试代币"],
  };
  return labels[kind] ? s(...labels[kind]) : kind;
}
