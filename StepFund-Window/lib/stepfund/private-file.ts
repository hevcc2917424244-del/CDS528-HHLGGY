import { keccak256 } from "ethers";
const MAGIC = new TextEncoder().encode("SFEVID01");
const LIMIT = 20 * 1024 * 1024;
const buffer = (bytes: Uint8Array) => new Uint8Array(bytes).buffer;
export const fileKey = () => Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x => x.toString(16).padStart(2, "0")).join("");
async function key(value: string) {
  if (!/^[0-9a-f]{64}$/i.test(value)) throw Error("privateFileKey");
  return crypto.subtle.importKey("raw", Uint8Array.from(value.match(/../g)!, x => parseInt(x, 16)), "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptFile(file: File, secret: string) {
  if (file.size > LIMIT - 2048) throw Error("fileTooLarge");
  const metadata = new TextEncoder().encode(JSON.stringify({ name: file.name.slice(0, 180), type: file.type.slice(0, 100) }));
  const payload = new Uint8Array(4 + metadata.length + file.size);
  new DataView(payload.buffer).setUint32(0, metadata.length);
  payload.set(metadata, 4); payload.set(new Uint8Array(await file.arrayBuffer()), 4 + metadata.length);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: MAGIC }, await key(secret), payload));
  const output = new Uint8Array(20 + encrypted.length); output.set(MAGIC); output.set(iv, 8); output.set(encrypted, 20);
  return { blob: new Blob([output], { type: "application/octet-stream" }), digest: keccak256(output) };
}
export async function decryptFile(bytes: Uint8Array, secret: string, digest: string) {
  if (bytes.length > LIMIT || bytes.length < 40 || !MAGIC.every((v, i) => bytes[i] === v)) throw Error("privateFileFormat");
  if (!/^0x[0-9a-f]{64}$/i.test(digest) || keccak256(bytes).toLowerCase() !== digest.toLowerCase()) throw Error("privateFileHash");
  let raw: ArrayBuffer;
  try { raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buffer(bytes.slice(8, 20)), additionalData: MAGIC }, await key(secret), buffer(bytes.slice(20))); }
  catch { throw Error("privateFileKey"); }
  const length = new DataView(raw).getUint32(0);
  if (length > 2048 || length + 4 > raw.byteLength) throw Error("privateFileFormat");
  const metadata = JSON.parse(new TextDecoder().decode(raw.slice(4, 4 + length)));
  if (typeof metadata.name !== "string" || typeof metadata.type !== "string") throw Error("privateFileFormat");
  return { name: metadata.name.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_") || "evidence", bytes: new Uint8Array(raw.slice(4 + length)) };
}
