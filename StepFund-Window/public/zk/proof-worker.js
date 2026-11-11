/* snarkjs is GPL-3.0; see snarkjs-LICENSE.txt and source listed in manifest.json. */
importScripts("./snarkjs.min.js");
self.onmessage = async ({ data }) => {
  try {
    const { proof, publicSignals } = await snarkjs.plonk.fullProve(data, "./acceptance.wasm", "./acceptance.zkey");
    const key = await (await fetch("./verification-key.json")).json();
    if (!await snarkjs.plonk.verify(key, publicSignals, proof)) throw Error("Invalid local proof");
    const calldata = await snarkjs.plonk.exportSolidityCallData(proof, publicSignals);
    const [solidityProof, signals] = JSON.parse("[" + calldata.replace(/\]\s*\[/, "],[") + "]");
    self.postMessage({ proof: solidityProof, signals });
  } catch { self.postMessage({ error: "proofFailed" }); }
};
