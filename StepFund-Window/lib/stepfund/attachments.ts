import { keccak256 } from "ethers";

export type Attachment = {
  id: string;
  scope: string;
  stage: number;
  name: string;
  size: number;
  type: string;
  digest: string;
  savedAt: number;
  blob: Blob;
};
const LIMIT = 20 * 1024 * 1024,
  TOTAL = 100 * 1024 * 1024;
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("stepfund-evidence-v1", 1);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore("files", { keyPath: "id" });
      s.createIndex("scope", "scope");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(Error("evidenceStorage"));
    r.onblocked = () => reject(Error("evidenceStorage"));
  });
}
export async function listAttachments(scope: string): Promise<Attachment[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readonly");
    const r = tx.objectStore("files").index("scope").getAll(scope);
    tx.oncomplete = () => {
      db.close();
      resolve(
        r.result.sort(
          (a: Attachment, b: Attachment) =>
            a.stage - b.stage || b.savedAt - a.savedAt,
        ),
      );
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(Error("evidenceStorage"));
    };
  });
}
export async function saveAttachment(
  scope: string,
  stage: number,
  file: File,
): Promise<Attachment> {
  if (file.size > LIMIT) throw Error("fileTooLarge");
  const digest = keccak256(new Uint8Array(await file.arrayBuffer()));
  const row: Attachment = {
    id: `${scope}:${stage}:${digest}`,
    scope,
    stage,
    name: file.name,
    size: file.size,
    type: file.type,
    digest,
    savedAt: Date.now(),
    blob: file,
  };
  await writeAttachments([row], false);
  return row;
}
async function writeAttachments(rows: Attachment[], skipExisting: boolean) {
  const db = await database();
  const result = await new Promise<{ added: number; skipped: number }>(
    (resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      const store = tx.objectStore("files");
      const all = store.getAll();
      let tooLarge = false,
        added = 0,
        skipped = 0;
      all.onsuccess = () => {
        const existing = new Map(
          (all.result as Attachment[]).map((r) => [r.id, r]),
        );
        const incoming = new Map<string, Attachment>();
        for (const row of rows) {
          if (skipExisting && existing.has(row.id)) {
            skipped++;
            continue;
          }
          incoming.set(row.id, row);
        }
        const used = Array.from(existing.values())
          .filter((r) => !incoming.has(r.id))
          .reduce((n, r) => n + r.size, 0);
        const needed = Array.from(incoming.values()).reduce(
          (n, r) => n + r.size,
          0,
        );
        if (used + needed > TOTAL) {
          tooLarge = true;
          tx.abort();
        } else {
          for (const row of incoming.values()) store.put(row);
          added = incoming.size;
        }
      };
      tx.oncomplete = () => {
        db.close();
        resolve({ added, skipped });
      };
      tx.onabort = tx.onerror = () => {
        db.close();
        reject(Error(tooLarge ? "evidenceQuota" : "evidenceStorage"));
      };
    },
  );
  window.dispatchEvent(new Event("stepfund-evidence-changed"));
  return result;
}
// Called only after bundle parsing, project matching and per-file hash checks.
// One IndexedDB transaction ensures quota failures cannot leave partial imports.
export async function importVerifiedAttachments(
  scope: string,
  files: {
    stage: number;
    name: string;
    size: number;
    type: string;
    digest: string;
    bytes: Uint8Array<ArrayBuffer>;
  }[],
) {
  const rows = files.map((f) => ({
    id: `${scope}:${f.stage}:${f.digest}`,
    scope,
    stage: f.stage,
    name: f.name,
    size: f.size,
    type: f.type,
    digest: f.digest,
    savedAt: Date.now(),
    blob: new Blob([f.bytes], { type: f.type }),
  }));
  return writeAttachments(rows, true);
}
export async function removeAttachment(id: string) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(Error("evidenceStorage"));
    };
  });
  window.dispatchEvent(new Event("stepfund-evidence-changed"));
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// Never render HTML, SVG or office files in the application's origin.
export function previewType(
  name: string,
  bytes: Uint8Array,
): "image/png" | "image/jpeg" | "image/gif" | "text" | null {
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
  )
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (new TextDecoder().decode(bytes.slice(0, 6)).match(/^GIF8[79]a$/))
    return "image/gif";
  if (/\.(txt|md|csv|json|log)$/i.test(name)) return "text";
  return null;
}
