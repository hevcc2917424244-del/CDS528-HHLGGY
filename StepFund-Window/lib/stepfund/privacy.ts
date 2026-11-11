import { AbiCoder, keccak256, isAddress, ZeroAddress } from "ethers";
import { poseidon3 } from "poseidon-lite";
import type { Draft } from "./model";
export const FIELD = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
export function privacyContext(chainId: number, campaign: string, stage: number, digest: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(digest) || /^0x0{64}$/.test(digest)) throw Error("invalidEvidence");
  return (BigInt(keccak256(AbiCoder.defaultAbiCoder().encode(["string", "uint256", "address", "uint256", "bytes32"], ["StepFund.Acceptance.v1", chainId, campaign, stage, digest]))) % FIELD).toString();
}
export function privateCommitment(value: string, salt: string, context: string): string {
  if (!/^\d{1,20}$/.test(value) || BigInt(value) >= BigInt(2) ** BigInt(64) || !/^\d{1,78}$/.test(salt) || BigInt(salt) <= BigInt(0) || BigInt(salt) >= FIELD) throw Error("invalidProof");
  return poseidon3([BigInt(value), BigInt(salt), BigInt(context)]).toString();
}
export function randomSalt(): string {
  // 31 random bytes: 248-bit entropy, always below the BN254 scalar field.
  return BigInt("0x" + Array.from(crypto.getRandomValues(new Uint8Array(31))).map(x => x.toString(16).padStart(2, "0")).join("")).toString();
}
export function validateAdvanced(config: Draft["advanced"], count: number, creator: string) {
  if (!config) return;
  for (const address of [config.vault, config.verifier, config.assessor]) if (!isAddress(address)) throw Error("invalidAdvanced");
  if (config.verifier !== ZeroAddress) {
    if (config.assessor === ZeroAddress || config.assessor.toLowerCase() === creator.toLowerCase() || config.minimums.length !== count || config.maximums.length !== count) throw Error("invalidAdvanced");
    config.minimums.forEach((lo, i) => {
      const hi = config.maximums[i];
      if (!/^\d{1,20}$/.test(lo) || !/^\d{1,20}$/.test(hi) || BigInt(lo) > BigInt(hi) || BigInt(hi) >= BigInt(2) ** BigInt(64)) throw Error("invalidAdvanced");
    });
  } else if (config.assessor !== ZeroAddress || config.minimums.length || config.maximums.length) throw Error("invalidAdvanced");
}
export type ProofResult = { proof: string[]; signals: string[]; digest: string; context: string };
export function generateProof(input: Record<string, string>, digest: string, signal: AbortSignal): Promise<ProofResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker("/zk/proof-worker.js");
    const abort = () => { worker.terminate(); reject(new Error("proofCancelled")); };
    const done = () => { worker.terminate(); signal.removeEventListener("abort", abort); };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); return; }
    worker.onerror = () => { done(); reject(Error("proofFailed")); };
    worker.onmessage = event => {
      done();
      if (event.data.error) reject(Error("proofFailed"));
      else resolve({ ...event.data, digest, context: input.context });
    };
    worker.postMessage(input);
  });
}
