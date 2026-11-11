// Reproducible PLONK setup from the published multi-party transcript.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const dir = 'build/zk';
const output = 'public/zk';
fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync(output, { recursive: true });
const ptau = `${dir}/powersOfTau28_hez_final_12.ptau`;
const url = 'https://circom.info/powersOfTau28_hez_final_12.ptau';
const expected = 'ded2694169b7b08e898f736d5de95af87c3f1a64594013351b1a796dbee393bd825f88f9468c84505ddd11eb0b1465ac9b43b9064aa8ec97f2b73e04758b8a4a';
function run(file, args) {
  const result = spawnSync(process.execPath, [file, ...args], { stdio: 'inherit' });
  if (result.status !== 0) throw Error(`Build failed: ${file} (${result.status})`);
}
const hash = (file, algorithm = 'sha256') => createHash(algorithm).update(fs.readFileSync(file)).digest('hex');
async function main() {
  if (!fs.existsSync(ptau)) {
    console.log('Downloading the public Powers of Tau transcript. No new trusted ceremony is generated.');
    const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
    if (!response.ok) throw Error(`Transcript HTTP ${response.status}`);
    fs.writeFileSync(ptau, Buffer.from(await response.arrayBuffer()));
  }
  if (hash(ptau, 'blake2b512') !== expected) throw Error('Public transcript checksum mismatch. Stop; do not use these parameters.');
  // The upstream CLI opens every parent directory. Restrict the WASI compiler
  // to this project instead, which also works in a sandboxed Windows checkout.
  const { CircomRunner, bindings } = require('circom2');
  const compiler = new CircomRunner({ args: ['circuits/Acceptance.circom', '--r1cs', '--wasm', '--sym', '-o', dir], preopens: { '.': '.' }, bindings: { ...bindings, fs } });
  await compiler.execute(fs.readFileSync(require.resolve('circom2/circom.wasm')));
  run('node_modules/snarkjs/cli.js', ['plonk', 'setup', `${dir}/Acceptance.r1cs`, ptau, `${output}/acceptance.zkey`]);
  run('node_modules/snarkjs/cli.js', ['zkey', 'export', 'verificationkey', `${output}/acceptance.zkey`, `${output}/verification-key.json`]);
  run('node_modules/snarkjs/cli.js', ['zkey', 'export', 'solidityverifier', `${output}/acceptance.zkey`, 'contracts/AcceptanceVerifier.sol']);
  let source = fs.readFileSync('contracts/AcceptanceVerifier.sol', 'utf8');
  source = source.replace('contract PlonkVerifier', 'contract AcceptanceVerifier');
  fs.writeFileSync('contracts/AcceptanceVerifier.sol', source);
  fs.copyFileSync(`${dir}/Acceptance_js/Acceptance.wasm`, `${output}/acceptance.wasm`);
  fs.copyFileSync('node_modules/snarkjs/build/snarkjs.min.js', `${output}/snarkjs.min.js`);
  fs.copyFileSync('node_modules/snarkjs/COPYING', `${output}/snarkjs-LICENSE.txt`);
  const files = ['circuits/Acceptance.circom', 'contracts/AcceptanceVerifier.sol', `${output}/acceptance.zkey`, `${output}/acceptance.wasm`, `${output}/verification-key.json`, `${output}/snarkjs.min.js`];
  fs.writeFileSync(`${output}/manifest.json`, JSON.stringify({ protocol: 'plonk', curve: 'bn128', compiler: 'circom 2.2.3 (circom2 0.2.23)', snarkjs: '0.7.6', publicSignals: ['commitment', 'minimum', 'maximum', 'context'], transcript: { url, blake2b512: expected, source: 'https://github.com/iden3/snarkjs#7-prepare-phase-2' }, files: Object.fromEntries(files.map(file => [file, hash(file)])) }, null, 2) + '\n');
  console.log('ZK assets and Solidity verifier generated; hashes recorded in public/zk/manifest.json.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
