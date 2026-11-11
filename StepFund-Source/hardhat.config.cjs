require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-verify");
require("solidity-coverage");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }, _, runSuper) => {
  if (solcVersion !== "0.8.30") return runSuper();
  return { compilerPath: require.resolve("solc/soljson.js"), isSolcJs: true, version: solcVersion, longVersion: require("solc").version() };
});
module.exports = {
  // viaIR is intentionally off: the contracts must stay buildable with the stock Remix
  // compiler panel, which exposes no via-IR switch. Any regression shows up here first.
  solidity: { version: "0.8.30", settings: { optimizer: { enabled: true, runs: 200 }, viaIR: false, evmVersion: "paris" } },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
    sepolia: { url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com", chainId: 11155111, accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [] }
  },
  etherscan: { apiKey: process.env.ETHERSCAN_API_KEY || "" },
  paths: { sources: "./contracts", tests: "./test", cache: "./.hardhat-cache", artifacts: "./artifacts" },
  mocha: { timeout: 60000 }
};
