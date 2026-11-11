import { keccak256, toUtf8Bytes } from "ethers";
import { zipSync, unzipSync } from "fflate";
import type { Project } from "./model";
import type { Attachment } from "./attachments";

export const FILE_LIMIT = 20 * 1024 * 1024;
export const LIBRARY_LIMIT = 100 * 1024 * 1024;
export const BUNDLE_LIMIT = LIBRARY_LIMIT + 1024 * 1024;
export const FILE_COUNT_LIMIT = 100;
const MANIFEST_LIMIT = 128 * 1024;
const HASH = /^0x[0-9a-f]{64}$/i;
export type BundleTarget = {
  mode: "practice" | "chain";
  chainId: number | null;
  projectId: string;
  fingerprint: string;
};
export type BundleFile = {
  path: string;
  stage: number;
  name: string;
  size: number;
  type: string;
  digest: string;
};
export type BundleManifest = {
  format: "stepfund-evidence";
  version: 1;
  target: BundleTarget;
  title: string;
  exportedAt: string;
  files: BundleFile[];
};
export type CheckedBundle = {
  manifest: BundleManifest;
  files: (BundleFile & { bytes: Uint8Array<ArrayBuffer> })[];
  totalBytes: number;
  packageHash: string;
};
type Progress = (completed: number, total: number) => void;
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function bundleTarget(
  p: Project,
  mode: "practice" | "chain",
  chainId?: number,
): BundleTarget {
  if (mode === "chain" && ![31337, 11155111].includes(chainId!))
    throw Error("wrongNetwork");
  // Practice fixtures have different absolute dates on different computers.
  // Chain bundles bind all immutable scheduling fields as well as the address.
  const immutable = [
    p.creator.toLowerCase(),
    p.title.en,
    p.goal,
    p.stages.map((m) => [m.title.en, m.budget]),
    ...(mode === "chain"
      ? [p.createdAt, p.fundingEnds, p.votingPeriod, p.stages.map((m) => m.due)]
      : []),
  ];
  return {
    mode,
    chainId: mode === "chain" ? chainId! : null,
    projectId: p.id.toLowerCase(),
    fingerprint: keccak256(toUtf8Bytes(JSON.stringify(immutable))),
  };
}
export function sameBundleTarget(a: BundleTarget, b: BundleTarget) {
  return (
    a.mode === b.mode &&
    a.chainId === b.chainId &&
    a.projectId === b.projectId &&
    a.fingerprint === b.fingerprint
  );
}
export function safeFileName(name: string) {
  return (
    name
      .replace(
        /[\\/:*?"<>|\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,
        "_",
      )
      .slice(0, 120)
      .replace(/[. ]+$/g, "") || "evidence.bin"
  );
}
const allowedPath = (path: string) =>
  path === "manifest.json" ||
  /^files\/[0-9]{3}-[^\\/:*?"<>|\u0000-\u001f\u007f]+$/.test(path);
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Bundles deliberately use ZIP STORE, not compression. Validate the entire
// directory and local headers before allocating/extracting anything. This
// rejects ZIP bombs, encrypted archives, duplicate paths and arbitrary files.
function checkZip(bytes: Uint8Array): Set<string> {
  if (bytes.length > BUNDLE_LIMIT) throw Error("bundleLimit");
  if (bytes.length < 22) throw Error("bundleInvalid");
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  if (
    d.getUint32(end, true) !== 0x06054b50 ||
    d.getUint16(end + 4, true) ||
    d.getUint16(end + 6, true) ||
    d.getUint16(end + 20, true)
  )
    throw Error("bundleInvalid");
  const count = d.getUint16(end + 10, true),
    directorySize = d.getUint32(end + 12, true),
    directory = d.getUint32(end + 16, true);
  if (
    count < 2 ||
    count > FILE_COUNT_LIMIT + 1 ||
    d.getUint16(end + 8, true) !== count ||
    directory + directorySize !== end
  )
    throw Error("bundleInvalid");
  const decoder = new TextDecoder("utf-8", { fatal: true }),
    names = new Set<string>(),
    ranges: [number, number][] = [];
  let cursor = directory,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || d.getUint32(cursor, true) !== 0x02014b50)
      throw Error("bundleInvalid");
    const flags = d.getUint16(cursor + 8, true),
      method = d.getUint16(cursor + 10, true),
      checksum = d.getUint32(cursor + 16, true),
      packed = d.getUint32(cursor + 20, true),
      size = d.getUint32(cursor + 24, true);
    const nameLength = d.getUint16(cursor + 28, true),
      extra = d.getUint16(cursor + 30, true),
      comment = d.getUint16(cursor + 32, true),
      local = d.getUint32(cursor + 42, true);
    if (method !== 0 || flags & ~0x800 || packed !== size)
      throw Error("bundleFormat");
    if (
      nameLength < 1 ||
      nameLength > 512 ||
      cursor + 46 + nameLength + extra + comment > end ||
      d.getUint16(cursor + 34, true)
    )
      throw Error("bundleInvalid");
    const name = decoder.decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    );
    if (!allowedPath(name) || names.has(name)) throw Error("bundleInvalid");
    names.add(name);
    if (size > (name === "manifest.json" ? MANIFEST_LIMIT : FILE_LIMIT))
      throw Error("bundleLimit");
    total += size;
    if (
      total > LIBRARY_LIMIT + MANIFEST_LIMIT ||
      local + 30 > directory ||
      d.getUint32(local, true) !== 0x04034b50
    )
      throw Error("bundleInvalid");
    if (
      d.getUint16(local + 6, true) !== flags ||
      d.getUint16(local + 8, true) !== 0 ||
      d.getUint32(local + 14, true) !== checksum ||
      d.getUint32(local + 18, true) !== size ||
      d.getUint32(local + 22, true) !== size
    )
      throw Error("bundleInvalid");
    const ln = d.getUint16(local + 26, true),
      le = d.getUint16(local + 28, true),
      start = local + 30 + ln + le;
    if (
      start + size > directory ||
      ln !== nameLength ||
      decoder.decode(bytes.subarray(local + 30, local + 30 + ln)) !== name
    )
      throw Error("bundleInvalid");
    if (crc32(bytes.subarray(start, start + size)) !== checksum)
      throw Error("bundleHashMismatch");
    ranges.push([local, start + size]);
    cursor += 46 + nameLength + extra + comment;
  }
  ranges.sort((a, b) => a[0] - b[0]);
  if (
    cursor !== end ||
    !names.has("manifest.json") ||
    ranges[0][0] !== 0 ||
    ranges[ranges.length - 1][1] !== directory ||
    ranges.some((r, i) => i > 0 && r[0] !== ranges[i - 1][1])
  )
    throw Error("bundleInvalid");
  return names;
}
function manifestFrom(value: unknown): BundleManifest {
  if (!value || typeof value !== "object") throw Error("bundleInvalid");
  const m = value as BundleManifest;
  if (
    m.format !== "stepfund-evidence" ||
    m.version !== 1 ||
    !m.target ||
    !["practice", "chain"].includes(m.target.mode) ||
    typeof m.target.projectId !== "string" ||
    m.target.projectId.length > 200 ||
    !HASH.test(m.target.fingerprint) ||
    typeof m.title !== "string" ||
    m.title.length > 500 ||
    typeof m.exportedAt !== "string" ||
    m.exportedAt.length > 40 ||
    !Number.isFinite(Date.parse(m.exportedAt))
  )
    throw Error("bundleInvalid");
  if (
    m.target.mode === "chain"
      ? ![31337, 11155111].includes(m.target.chainId!) ||
        !/^0x[0-9a-f]{40}$/.test(m.target.projectId)
      : m.target.chainId !== null
  )
    throw Error("bundleInvalid");
  if (
    !Array.isArray(m.files) ||
    !m.files.length ||
    m.files.length > FILE_COUNT_LIMIT
  )
    throw Error("bundleLimit");
  const seen = new Set<string>(),
    paths = new Set<string>();
  let total = 0;
  for (const f of m.files) {
    if (
      !f ||
      typeof f.path !== "string" ||
      !allowedPath(f.path) ||
      f.path === "manifest.json" ||
      !Number.isInteger(f.stage) ||
      f.stage < 0 ||
      f.stage > 7 ||
      typeof f.name !== "string" ||
      f.name.length > 255 ||
      f.name !== safeFileName(f.name) ||
      typeof f.type !== "string" ||
      f.type.length > 128 ||
      /[\r\n]/.test(f.type) ||
      !Number.isSafeInteger(f.size) ||
      f.size < 0 ||
      !HASH.test(f.digest)
    )
      throw Error("bundleInvalid");
    const key = `${f.stage}:${f.digest.toLowerCase()}`;
    if (paths.has(f.path) || seen.has(key)) throw Error("bundleInvalid");
    paths.add(f.path);
    seen.add(key);
    total += f.size;
    if (f.size > FILE_LIMIT || total > LIBRARY_LIMIT)
      throw Error("bundleLimit");
  }
  return m;
}

export async function exportEvidenceBundle(
  rows: Attachment[],
  target: BundleTarget,
  title: string,
  onProgress: Progress = () => {},
): Promise<Uint8Array<ArrayBuffer>> {
  if (!rows.length) throw Error("bundleEmpty");
  if (
    rows.length > FILE_COUNT_LIMIT ||
    rows.reduce((n, r) => n + r.size, 0) > LIBRARY_LIMIT
  )
    throw Error("bundleLimit");
  const contents: Record<string, Uint8Array> = Object.create(null);
  const manifest: BundleManifest = {
    format: "stepfund-evidence",
    version: 1,
    target,
    title,
    exportedAt: new Date().toISOString(),
    files: [],
  };
  for (let i = 0; i < rows.length; i++) {
    onProgress(i, rows.length);
    await pause();
    const row = rows[i];
    if (row.blob.size > FILE_LIMIT) throw Error("bundleLimit");
    const bytes = new Uint8Array(await row.blob.arrayBuffer());
    if (
      bytes.length !== row.size ||
      keccak256(bytes).toLowerCase() !== row.digest.toLowerCase()
    )
      throw Error("bundleHashMismatch");
    const name = safeFileName(row.name),
      path = `files/${String(i + 1).padStart(3, "0")}-${name}`;
    contents[path] = bytes;
    manifest.files.push({
      path,
      name,
      stage: row.stage,
      size: row.size,
      type: row.type,
      digest: row.digest.toLowerCase(),
    });
  }
  manifestFrom(manifest);
  contents["manifest.json"] = toUtf8Bytes(JSON.stringify(manifest, null, 2));
  if (contents["manifest.json"].length > MANIFEST_LIMIT)
    throw Error("bundleLimit");
  const result = zipSync(contents, { level: 0 });
  onProgress(rows.length, rows.length);
  return new Uint8Array(result);
}
export async function inspectEvidenceBundle(
  bytes: Uint8Array,
  expected: BundleTarget,
  stageCount: number,
  onProgress: Progress = () => {},
): Promise<CheckedBundle> {
  try {
    const names = checkZip(bytes),
      extracted = unzipSync(bytes);
    const manifest = manifestFrom(
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          extracted["manifest.json"],
        ),
      ),
    );
    if (!sameBundleTarget(manifest.target, expected))
      throw Error("bundleWrongProject");
    if (names.size !== manifest.files.length + 1) throw Error("bundleInvalid");
    const files: CheckedBundle["files"] = [];
    for (let i = 0; i < manifest.files.length; i++) {
      onProgress(i, manifest.files.length);
      await pause();
      const f = manifest.files[i],
        data = extracted[f.path];
      if (!data || f.stage >= stageCount || data.length !== f.size)
        throw Error("bundleInvalid");
      if (keccak256(data).toLowerCase() !== f.digest.toLowerCase())
        throw Error("bundleHashMismatch");
      files.push({
        ...f,
        digest: f.digest.toLowerCase(),
        bytes: new Uint8Array(data),
      });
    }
    onProgress(files.length, files.length);
    return {
      manifest,
      files,
      totalBytes: files.reduce((n, f) => n + f.size, 0),
      packageHash: keccak256(bytes),
    };
  } catch (e) {
    if (e instanceof Error && /^bundle[A-Za-z]+$/.test(e.message)) throw e;
    throw Error("bundleInvalid");
  }
}
