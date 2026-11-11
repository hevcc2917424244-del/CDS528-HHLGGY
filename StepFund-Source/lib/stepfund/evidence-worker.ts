import {
  exportEvidenceBundle,
  inspectEvidenceBundle,
  type BundleTarget,
} from "./evidence-bundle";
import type { Attachment } from "./attachments";
type Request =
  | {
      operation: "export";
      rows: Attachment[];
      target: BundleTarget;
      title: string;
    }
  | {
      operation: "inspect";
      bytes: Uint8Array;
      target: BundleTarget;
      stageCount: number;
    };
const worker = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};
worker.onmessage = async ({ data }) => {
  const progress = (completed: number, total: number) =>
    worker.postMessage({ kind: "progress", completed, total });
  try {
    if (data.operation === "export") {
      const bytes = await exportEvidenceBundle(
        data.rows,
        data.target,
        data.title,
        progress,
      );
      worker.postMessage({ kind: "complete", result: bytes }, [bytes.buffer]);
    } else {
      const result = await inspectEvidenceBundle(
        data.bytes,
        data.target,
        data.stageCount,
        progress,
      );
      worker.postMessage(
        { kind: "complete", result },
        result.files.map((f) => f.bytes.buffer),
      );
    }
  } catch (e) {
    worker.postMessage({
      kind: "error",
      message: e instanceof Error ? e.message : "bundleInvalid",
    });
  }
};
