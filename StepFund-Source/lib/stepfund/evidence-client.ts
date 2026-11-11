import type { Attachment } from "./attachments";
import type { BundleTarget, CheckedBundle } from "./evidence-bundle";
import EvidenceWorker from "./evidence-worker?worker";
type Request =
  | {
      operation: "export";
      rows: Attachment[];
      target: BundleTarget;
      title: string;
    }
  | {
      operation: "inspect";
      bytes: Uint8Array<ArrayBuffer>;
      target: BundleTarget;
      stageCount: number;
    };
export function processEvidence<
  T extends Uint8Array<ArrayBuffer> | CheckedBundle,
>(
  request: Request,
  signal: AbortSignal,
  onProgress: (completed: number, total: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(Error("bundleCancelled"));
      return;
    }
    const worker = new EvidenceWorker();
    const stop = () => {
      worker.terminate();
      signal.removeEventListener("abort", cancel);
    };
    const cancel = () => {
      stop();
      reject(Error("bundleCancelled"));
    };
    signal.addEventListener("abort", cancel, { once: true });
    worker.onerror = () => {
      stop();
      reject(Error("bundleProcessing"));
    };
    worker.onmessage = ({ data }) => {
      if (data.kind === "progress") onProgress(data.completed, data.total);
      else if (data.kind === "error") {
        stop();
        reject(Error(data.message));
      } else if (data.kind === "complete") {
        stop();
        resolve(data.result as T);
      }
    };
    try {
      worker.postMessage(
        request,
        request.operation === "inspect" ? [request.bytes.buffer] : [],
      );
    } catch {
      stop();
      reject(Error("bundleProcessing"));
    }
  });
}
