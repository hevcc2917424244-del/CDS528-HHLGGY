import {
  BrowserProvider,
  Contract,
  getAddress,
  isAddress,
  formatEther,
} from "ethers";
import { walletProvider } from "./wallet";
import { TOKEN_ABI } from "./chain";

export type PublicDeployment = {
  chainId: number;
  factory: string;
  token?: string;
};
export function parsePublicDeployment(input: unknown): PublicDeployment {
  if (!input || typeof input !== "object") throw Error("invalidConfig");
  const value = input as Record<string, unknown>;
  if (
    ![31337, 11155111].includes(Number(value.chainId)) ||
    typeof value.factory !== "string" ||
    !isAddress(value.factory)
  )
    throw Error("invalidConfig");
  if (
    value.token !== undefined &&
    (typeof value.token !== "string" || !isAddress(value.token))
  )
    throw Error("invalidConfig");
  // Allowlist only public fields. Imported records cannot configure endpoints or credentials.
  return {
    chainId: Number(value.chainId),
    factory: getAddress(value.factory),
    ...(value.token ? { token: getAddress(String(value.token)) } : {}),
  };
}
export function downloadJSON(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export type WalletStatus = {
  account: string;
  chainId: number;
  eth: string;
  hasGas: boolean;
  tokenBalance?: string;
  faucetAt?: number;
};
export async function readWalletStatus(
  tokenAddress?: string,
): Promise<WalletStatus> {
  const raw = walletProvider();
  const accounts = (await raw.request({ method: "eth_accounts" })) as string[];
  if (!accounts[0] || !isAddress(accounts[0])) throw Error("noWallet");
  const chainId = Number(await raw.request({ method: "eth_chainId" }));
  if (![31337, 11155111].includes(chainId)) throw Error("wrongNetwork");
  const provider = new BrowserProvider(raw);
  const value = await provider.getBalance(accounts[0]);
  const result: WalletStatus = {
    account: getAddress(accounts[0]),
    chainId,
    eth: formatEther(value),
    hasGas: value > BigInt(0),
  };
  if (tokenAddress) {
    const token = new Contract(tokenAddress, TOKEN_ABI, provider);
    const [balance, next] = await Promise.all([
      token.balanceOf(accounts[0]),
      token.nextFaucet(accounts[0]).catch(() => undefined),
    ]);
    result.tokenBalance = (Number(balance) / 1e6).toLocaleString();
    if (next !== undefined) result.faucetAt = Number(next);
  }
  // Never show a prior account's balance after a wallet change during RPC reads.
  const after = (await raw.request({ method: "eth_accounts" })) as string[];
  if (
    String(after[0]).toLowerCase() !== accounts[0].toLowerCase() ||
    Number(await raw.request({ method: "eth_chainId" })) !== chainId
  )
    throw Error("walletChanged");
  return result;
}

export type ContractKind = "TestUSD" | "StepFundFactory" | "MilestoneCampaign";
export type VerificationInput = {
  stdJsonInput: object;
  compilerVersion: string;
  contractIdentifier: string;
};
export async function verificationInput(
  kind: ContractKind,
): Promise<VerificationInput> {
  const r = await fetch(`/contracts/${kind}.verification.json`);
  if (!r.ok) throw Error("verificationUnavailable");
  return r.json();
}
const SOURCIFY = "https://sourcify.dev/server/v2";
type Match = {
  chainId?: string;
  address?: string;
  runtimeMatch?: string | null;
  creationMatch?: string | null;
};
export type VerificationState = {
  state:
    | "verified"
    | "partial"
    | "unverified"
    | "pending"
    | "failed"
    | "unavailable";
  id?: string;
  detail?: string;
};
export function matchState(value: Match, address: string): VerificationState {
  if (
    String(value.chainId) !== "11155111" ||
    value.address?.toLowerCase() !== address.toLowerCase()
  )
    throw Error("verificationUnavailable");
  const ok = (m?: string | null) => m === "match" || m === "exact_match";
  return {
    state:
      ok(value.runtimeMatch) && ok(value.creationMatch)
        ? "verified"
        : ok(value.runtimeMatch) || ok(value.creationMatch)
          ? "partial"
          : "unverified",
  };
}
async function serviceFetch(url: string, init?: RequestInit) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(25_000),
    credentials: "omit",
  });
}
export async function checkVerification(
  address: string,
): Promise<VerificationState> {
  if (!isAddress(address)) throw Error("invalidFactory");
  const r = await serviceFetch(`${SOURCIFY}/contract/11155111/${address}`);
  if (r.status === 404) return { state: "unverified" };
  if (!r.ok) throw Error("verificationUnavailable");
  return matchState(await r.json(), address);
}
export async function submitVerification(
  address: string,
  kind: ContractKind,
): Promise<VerificationState> {
  if (!isAddress(address)) throw Error("invalidFactory");
  const input = await verificationInput(kind);
  const r = await serviceFetch(`${SOURCIFY}/verify/11155111/${address}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (r.status === 409) return checkVerification(address);
  if (!r.ok) throw Error("verificationUnavailable");
  const data = (await r.json()) as { verificationId?: string };
  if (!data.verificationId || !/^[\da-f-]{36}$/i.test(data.verificationId))
    throw Error("verificationUnavailable");
  return { state: "pending", id: data.verificationId };
}
export async function pollVerification(
  id: string,
  address: string,
): Promise<VerificationState> {
  if (!/^[\da-f-]{36}$/i.test(id) || !isAddress(address))
    throw Error("verificationUnavailable");
  const r = await serviceFetch(`${SOURCIFY}/verify/${id}`);
  if (!r.ok) throw Error("verificationUnavailable");
  const data = (await r.json()) as {
    isJobCompleted: boolean;
    error?: { customCode?: string };
    contract?: Match;
  };
  if (!data.isJobCompleted) return { state: "pending", id };
  if (data.error)
    return { state: "failed", detail: data.error.customCode?.slice(0, 100) };
  if (!data.contract) throw Error("verificationUnavailable");
  return matchState(data.contract, address);
}
