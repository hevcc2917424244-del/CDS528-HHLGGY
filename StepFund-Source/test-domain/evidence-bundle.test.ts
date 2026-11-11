import test from "node:test";
import assert from "node:assert/strict";
import { keccak256 } from "ethers";
import { zipSync, unzipSync, strToU8 } from "fflate";
import { seed } from "../lib/stepfund/model";
import {
  bundleTarget,
  exportEvidenceBundle,
  inspectEvidenceBundle,
  BUNDLE_LIMIT,
} from "../lib/stepfund/evidence-bundle";
import type { Attachment } from "../lib/stepfund/attachments";
const project = seed(1000000).projects[0],
  target = bundleTarget(project, "practice");
const makeRow = (
  name = "evidence.txt",
  content = "Evidence bytes",
  stage = 1,
): Attachment => {
  const blob = new Blob([content], { type: "text/plain" });
  return {
    id: name,
    scope: "test",
    stage,
    name,
    size: blob.size,
    type: blob.type,
    digest: keccak256(strToU8(content)),
    savedAt: 1000,
    blob,
  };
};
const archive = () =>
  exportEvidenceBundle(
    [makeRow(), makeRow("图片.txt", "附加成果", 0)],
    target,
    project.title.en,
  );
test("portable evidence includes actual bytes, preserves Unicode and matches the same practice fixture on another computer", async () => {
  const bytes = await archive();
  const other = seed(2000000).projects[0];
  const checked = await inspectEvidenceBundle(
    bytes,
    bundleTarget(other, "practice"),
    3,
  );
  assert.equal(checked.files.length, 2);
  assert.equal(new TextDecoder().decode(checked.files[1].bytes), "附加成果");
  assert.equal(checked.files[1].name, "图片.txt");
  assert.equal(checked.packageHash, keccak256(bytes));
  assert.equal(
    checked.totalBytes,
    makeRow().size + makeRow("图片.txt", "附加成果").size,
  );
});
test("imports bind the mode, chain, project address and immutable project configuration", async () => {
  const p = { ...project, id: "0x" + "11".repeat(20) },
    chain = bundleTarget(p, "chain", 11155111),
    bytes = await exportEvidenceBundle([makeRow()], chain, p.title.en);
  for (const wrong of [
    bundleTarget(p, "practice"),
    bundleTarget(p, "chain", 31337),
    bundleTarget({ ...p, id: "0x" + "22".repeat(20) }, "chain", 11155111),
    bundleTarget({ ...p, createdAt: p.createdAt + 1 }, "chain", 11155111),
    bundleTarget({ ...p, goal: p.goal + 1 }, "chain", 11155111),
  ])
    await assert.rejects(
      () => inspectEvidenceBundle(bytes, wrong, 3),
      /bundleWrongProject/,
    );
  assert.equal((await inspectEvidenceBundle(bytes, chain, 3)).files.length, 1);
});
test("changing file bytes and recomputing ZIP CRC still fails the manifest's Keccak-256 commitment", async () => {
  const bytes = await archive(),
    files = unzipSync(bytes),
    key = Object.keys(files).find((k) => k.startsWith("files/"))!;
  files[key][0] ^= 0xff;
  await assert.rejects(
    () => inspectEvidenceBundle(zipSync(files, { level: 0 }), target, 3),
    /bundleHashMismatch/,
  );
});
test("CRC corruption and truncated ZIPs are rejected before saving", async () => {
  const bytes = await archive();
  const damaged = bytes.slice();
  damaged[40] ^= 0xff;
  await assert.rejects(
    () => inspectEvidenceBundle(damaged, target, 3),
    /bundle/,
  );
  await assert.rejects(
    () => inspectEvidenceBundle(bytes.slice(0, -1), target, 3),
    /bundleInvalid/,
  );
});
test("archives cannot import traversal paths, undeclared payloads or repeated stage/hash entries", async () => {
  const original = unzipSync(await archive());
  await assert.rejects(
    () =>
      inspectEvidenceBundle(
        zipSync({ ...original, "../evil.html": strToU8("bad") }, { level: 0 }),
        target,
        3,
      ),
    /bundleInvalid/,
  );
  await assert.rejects(
    () =>
      inspectEvidenceBundle(
        zipSync(
          { ...original, "files/003-extra.txt": strToU8("extra") },
          { level: 0 },
        ),
        target,
        3,
      ),
    /bundleInvalid/,
  );
  const duplicate = { ...original },
    manifest = JSON.parse(new TextDecoder().decode(original["manifest.json"]));
  manifest.files[1] = { ...manifest.files[0], path: manifest.files[1].path };
  duplicate["manifest.json"] = strToU8(JSON.stringify(manifest));
  await assert.rejects(
    () => inspectEvidenceBundle(zipSync(duplicate, { level: 0 }), target, 3),
    /bundleInvalid/,
  );
});
test("recompressed or oversized bundles are rejected; nested compressed content is never expanded", async () => {
  const original = unzipSync(await archive());
  await assert.rejects(
    () => inspectEvidenceBundle(zipSync(original, { level: 9 }), target, 3),
    /bundleFormat/,
  );
  await assert.rejects(
    () => inspectEvidenceBundle(new Uint8Array(BUNDLE_LIMIT + 1), target, 3),
    /bundleLimit/,
  );
});
test("manifest file size, stage bounds and stored-file consistency are checked", async () => {
  const original = unzipSync(await archive()),
    manifest = JSON.parse(new TextDecoder().decode(original["manifest.json"]));
  manifest.files[0].size += 1;
  await assert.rejects(
    () =>
      inspectEvidenceBundle(
        zipSync(
          { ...original, "manifest.json": strToU8(JSON.stringify(manifest)) },
          { level: 0 },
        ),
        target,
        3,
      ),
    /bundleInvalid/,
  );
  await assert.rejects(
    async () => inspectEvidenceBundle(await archive(), target, 1),
    /bundleInvalid/,
  );
  await assert.rejects(
    () =>
      exportEvidenceBundle(
        [{ ...makeRow(), digest: "0x" + "00".repeat(32) }],
        target,
        project.title.en,
      ),
    /bundleHashMismatch/,
  );
});
test("file names are portable and existing bytes remain intact", async () => {
  const row = makeRow("../report:proof?.txt");
  const checked = await inspectEvidenceBundle(
    await exportEvidenceBundle([row], target, project.title.en),
    target,
    3,
  );
  assert.equal(checked.files[0].name, ".._report_proof_.txt");
  assert.equal(keccak256(checked.files[0].bytes), row.digest);
  assert.ok(checked.files[0].path.startsWith("files/001-"));
});
