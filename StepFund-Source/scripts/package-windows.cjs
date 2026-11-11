const fs = require("node:fs");
const path = require("node:path");
if (process.platform !== "win32" || process.arch !== "x64")
  throw Error("Build the Windows portable package with Windows x64 Node.js.");
const root = path.resolve(__dirname, "..");
const destination = path.resolve(root, "../StepFund-Windows");
fs.mkdirSync(path.join(destination, "runtime"), { recursive: true });
fs.mkdirSync(path.join(destination, "www"), { recursive: true });
fs.cpSync(path.join(root, "portable-dist"), path.join(destination, "www"), {
  recursive: true,
});
const runtimeTarget = path.join(destination, "runtime", "node.exe");
const hashFile = (file) =>
  require("node:crypto")
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
if (
  !fs.existsSync(runtimeTarget) ||
  hashFile(runtimeTarget) !== hashFile(process.execPath)
)
  fs.copyFileSync(process.execPath, runtimeTarget);
fs.copyFileSync(
  path.join(root, "scripts", "portable-server.cjs"),
  path.join(destination, "server.cjs"),
);
fs.writeFileSync(
  path.join(destination, "Start StepFund.cmd"),
  '@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\ntitle StepFund\r\n"%~dp0runtime\\node.exe" "%~dp0server.cjs"\r\nif errorlevel 1 pause\r\n',
);
fs.writeFileSync(
  path.join(destination, "Open Startup Logs.cmd"),
  '@echo off\r\nif not exist "%~dp0logs" mkdir "%~dp0logs"\r\nstart "" explorer.exe "%~dp0logs"\r\n',
);
const nodeLicense = path.join(root, "vendor/node/LICENSE");
if (fs.existsSync(nodeLicense))
  fs.copyFileSync(
    nodeLicense,
    path.join(destination, "runtime", "NODE-LICENSE.txt"),
  );
else
  throw Error(
    "Node license missing. Add the matching official Node license before distributing.",
  );
fs.copyFileSync(
  path.join(root, "LICENSE"),
  path.join(destination, "STEPFUND-LICENSE.txt"),
);
fs.copyFileSync(
  path.join(root, "THIRD-PARTY-NOTICES.txt"),
  path.join(destination, "THIRD-PARTY-NOTICES.txt"),
);
fs.writeFileSync(
  path.join(destination, "READ ME FIRST.txt"),
  `StepFund — Windows portable edition\r\n\r\n1. Extract the entire ZIP to a folder. Do not run from inside the ZIP.\r\n2. Double-click Start StepFund.cmd. Your browser opens automatically.\r\n3. Keep the terminal window open. Close it to stop StepFund.\r\n4. Click 中文 / English in the top bar to change language.\r\n\r\nNo Node.js installation, npm commands, account, or Internet is needed for practice mode.\r\nPractice changes are saved only in this browser at the address printed by the launcher (default port 5280).\r\nReal testnet mode supports MetaMask Mobile QR pairing (no desktop extension needed) or an existing browser wallet. Internet access, test ETH, and a deployed StepFund factory are required. Open Connect wallet for the integrated connection center: balances, faucet links, import/export of public connection files, and publisher verification tools. Ordinary participants need no Etherscan account or API key. The portable edition does not start a blockchain node.\r\nThe full source edition includes scripts for a local Hardhat blockchain.\r\nThe included 31337 deployment addresses only work when that matching local blockchain is running. Sepolia has not been deployed automatically.\r\n\r\n中文使用方法\r\n1. 将整个压缩包解压到文件夹，不要在压缩包内直接运行。\r\n2. 双击 Start StepFund.cmd，浏览器会自动打开。\r\n3. 使用期间保留启动窗口，关闭窗口即停止本地服务。\r\n4. 点击顶部“中文”即可切换。演示模式可离线运行，无须安装开发工具。\r\n5. 点击“连接钱包”，可扫码连接手机 MetaMask，无须安装电脑钱包扩展。\r\n6. 连接中心内置余额检查、测试 ETH 领币入口、tUSD 领取、共享连接文件和发布者验证工具。\r\n7. 真实测试链仍需联网、测试 ETH 和已部署合约；普通接收者无须 Etherscan 账号或 API Key。\r\n\r\nProgram source and contract tests are provided separately in StepFund.\r\nRuntime: ${process.version}, Windows ${process.arch}.\r\n`,
);
console.log("Packaged " + destination);

fs.appendFileSync(path.join(destination, "READ ME FIRST.txt"),
  "\r\nVersion 0.6.0 / immutable protocol v3\r\nOptional ERC4626 treasury (20% cap), funded-reward ResearchVault, Aave V3 adapter, real PLONK private acceptance and local AES-256-GCM evidence encryption. New features require v3 chain mode; practice mode does not fake proofs. ResearchVault rewards are externally funded, not market interest. Aave needs its own supported reserve; live Aave and authenticated IPFS upload are recipient validation steps.\r\nSee the two separate PDFs or docs/ for operation and GitHub/Sepolia publication. No repository or public deployment is created automatically.\r\n中文：0.6.0 已加入资金库、收益分配、流动性救济、真实 ZK 验收与文件加解密。新功能需连接 v3 测试链；随包研究资金库收益来自外部奖励，不是市场利息。公开 GitHub、Sepolia、Aave 与真实存储账号操作由接收方按上传指南完成。\r\n"
);
fs.cpSync(path.join(root, "vendor", "snarkjs-source"), path.join(destination, "licenses", "snarkjs-source"), { recursive: true });
fs.mkdirSync(path.join(destination,"docs"),{recursive:true});
for(const name of ["USER-GUIDE.zh.md","RELEASE-GUIDE.zh.md"]) fs.copyFileSync(path.join(root,"docs",name),path.join(destination,"docs",name));
