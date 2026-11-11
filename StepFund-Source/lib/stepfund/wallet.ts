import type { Eip1193Provider } from "ethers";
import type { MetamaskConnectEVM } from "@metamask/connect-evm";

export type WalletProvider = Eip1193Provider & {
  on?: (name: string, fn: (...args: unknown[]) => void) => void;
  removeListener?: (name: string, fn: (...args: unknown[]) => void) => void;
};
declare global {
  interface Window {
    ethereum?: WalletProvider;
  }
}
export const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
let selected: WalletProvider | undefined | null;
let transport: "phone" | "browser" = "browser";
export function assertWalletNetwork(chainId: number, via = transport) {
  if (![31337, 11155111].includes(chainId)) throw Error("wrongNetwork");
  if (via === "phone" && chainId !== 11155111) throw Error("phoneSepoliaOnly");
}
let mobileClient: Promise<MetamaskConnectEVM> | undefined;
const listeners = new Set<() => void>();
export function walletProvider() {
  const provider =
    selected === null
      ? undefined
      : selected ||
        (typeof window !== "undefined" ? window.ethereum : undefined);
  if (!provider) throw Error("noWallet");
  return provider;
}
export function onWalletSelection(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function select(provider: WalletProvider | null) {
  selected = provider;
  listeners.forEach((fn) => fn());
}
export async function connectBrowserWallet() {
  if (!window.ethereum) throw Error("noWallet");
  await window.ethereum.request({ method: "eth_requestAccounts" });
  transport = "browser";
  select(window.ethereum);
}
export async function connectMobileWallet(
  onUri: (uri: string) => void,
  signal: AbortSignal,
) {
  mobileClient ??= import("@metamask/connect-evm")
    .then(({ createEVMClient }) =>
      createEVMClient({
        dapp: { name: "StepFund", url: window.location.origin },
        api: { supportedNetworks: { "0xaa36a7": SEPOLIA_RPC } },
        ui: { headless: true, preferExtension: false },
        analytics: { enabled: false },
        skipAutoAnnounce: true,
      }),
    )
    .catch((error) => {
      mobileClient = undefined;
      throw error;
    });
  const client = await mobileClient;
  if (signal.aborted) throw Error("rejected");
  const provider = client.getProvider();
  provider.on("display_uri", onUri);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort = () => {};
  try {
    await Promise.race([
      client.connect({ chainIds: ["0xaa36a7"] }),
      new Promise<never>((_, reject) => {
        abort = () => reject(Error("rejected"));
        signal.addEventListener("abort", abort, { once: true });
        timer = setTimeout(() => reject(Error("walletTimeout")), 120_000);
      }),
    ]);
    if (signal.aborted) throw Error("rejected");
    transport = "phone";
    select(provider as WalletProvider);
  } catch (error) {
    void client.disconnect().catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    provider.removeListener("display_uri", onUri);
    onUri("");
  }
}
export async function disconnectWallet() {
  const current = selected;
  select(null);
  if (mobileClient) {
    const client = await mobileClient;
    if (current === client.getProvider()) await client.disconnect();
  }
}
