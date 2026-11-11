const fs = require('node:fs');
const crypto = require('node:crypto');
const { CircomRunner, bindings } = require('circom2');
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function main() {
  const manifest = JSON.parse(fs.readFileSync('public/zk/manifest.json'));
  for (const [file, expected] of Object.entries(manifest.files)) if (hash(file) !== expected) throw Error(`Stale ZK asset: ${file}. Rebuild with npm run zk:build.`);
  fs.mkdirSync('build/zk-check', { recursive: true });
  const compiler = new CircomRunner({ args: ['circuits/Acceptance.circom', '--wasm', '-o', 'build/zk-check'], preopens: { '.': '.' }, bindings: { ...bindings, fs } });
  await compiler.execute(fs.readFileSync(require.resolve('circom2/circom.wasm')));
  if (hash('build/zk-check/Acceptance_js/Acceptance.wasm') !== manifest.files['public/zk/acceptance.wasm']) throw Error('Circuit source does not match the shipped witness generator.');
  console.log('ZK source, freshly compiled witness generator, verifier, proving key and browser library match their manifest. Real proof verification runs in npm test.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
