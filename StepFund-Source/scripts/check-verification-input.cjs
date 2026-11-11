const fs = require("node:fs");
const solc = require("solc");
const assert = require("node:assert/strict");
for (const name of ["TestUSD", "StepFundFactory", "MilestoneCampaign"]) {
  const data = JSON.parse(
    fs.readFileSync(`public/contracts/${name}.verification.json`),
  );
  const artifact = JSON.parse(fs.readFileSync(`public/contracts/${name}.json`));
  const output = JSON.parse(solc.compile(JSON.stringify(data.stdJsonInput)));
  assert.equal(
    (output.errors || []).filter((e) => e.severity === "error").length,
    0,
  );
  const source = data.contractIdentifier.split(":")[0];
  assert.equal(
    "0x" + output.contracts[source][name].evm.bytecode.object,
    artifact.bytecode,
  );
  console.log(
    `${name}: exported compiler input reproduces the bundled deployment bytecode`,
  );
}
