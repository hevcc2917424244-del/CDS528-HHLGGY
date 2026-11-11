# StepFund GitHub 与 Sepolia 上传指南

版本 0.6.0 · 合约协议 v3 · 2026-10-03

面向接收源码并负责发布的人。请使用自己的 GitHub 账号、测试网钱包和存储账号。发送方不需要代你授权，也不需要接收你的密码、API Key、钱包私钥或助记词。

## 01 / 交接范围与准备

收到四份文件：StepFund-Source.zip、StepFund-Windows.zip、使用指南 PDF、上传指南 PDF。源码 ZIP 包含 .github/workflows/ci.yml，请保留隐藏文件夹。运行包只负责运行应用，不是源码仓库。

准备 Windows x64 或其他支持 Node.js 的开发电脑、Node.js 24 LTS、Git、浏览器和联网环境。项目使用已锁定的 npm 依赖及 Hardhat 2.28；不要照其他教程直接升级到 Hardhat 3，也不需要额外安装 Yarn 或 Foundry。

准备专用测试网钱包、少量 Sepolia 测试 ETH、Sepolia RPC URL 和 Etherscan API Key。测试 ETH 由外部水龙头领取，不是购买真实 ETH。本指南不包含可直接使用的账户凭据。

标准部署方案使用 TestUSD + ResearchVault + 工厂内固定 ZK 验证器。Aave 是可选部署方案，需要更换为 Aave 已支持的六位小数测试资产。

## 解压与确认位置

将源码解压到例如 C:\Projects\StepFund，打开包含 package.json、contracts、scripts、public 的那一层目录。不要把压缩包本身或只有 www 的运行目录当成仓库源码。

```powershell
node --version
npm --version
git --version
npm ci
npm run dev
```

浏览器打开 http://127.0.0.1:5173。依赖下载失败时可更换可信 npm 镜像，保持 TLS 校验开启，不要混用多个锁文件。源码包不包含 node_modules，首次安装需要联网。

---

## 02 / 先完成本地检查

以下命令都在包含 package.json 的源码根目录执行，上一条成功后再执行下一条。

```powershell
npm run compile
npm run zk:check
node scripts/check-contract-bundle.cjs
npm test
npm run test:domain
npm run typecheck
npm run build:portable
npm run release:check
```

npm test 检查真实 Solidity 逻辑，包括真实 PLONK 证明、篡改参数、资金库亏损、赎回失败与恶意回调。应用测试检查文件、哈希、加解密、投票模型等。Aave Pool 测试明确使用模拟合约，不能写成已在公开 Aave 上运行。

覆盖率可单独执行 npm run test:coverage。生成的密码学汇编不做覆盖率插桩；生产字节码大小测试只在普通 npm test 中执行，因为插桩会增大字节码。覆盖率不能代替审计。

修改合约后先重新编译，再执行 npm run export:contracts，提交对应 public/contracts 文件。修改电路后执行 npm run zk:build，再编译 Solidity、导出合约并跑完整测试。首次重建 ZK 资产会下载公开 Powers of Tau，脚本校验公布的 BLAKE2b-512 哈希。

## 本地链联调

终端 A：npm run chain。终端 B：npm run deploy:local，然后 npm run dev。钱包配置 RPC http://127.0.0.1:8545、Chain ID 31337。使用 Hardhat 输出的公开测试账户仅限本地链。

部署结果写入 public/deployments/31337.json。重启本地链会清空链状态，旧地址记录可能失效，需重新部署。不要把本地地址描述成 Sepolia 地址。

---

## 03 / 上传 GitHub

先在 GitHub 用接收方自己的账号创建空仓库 StepFund，不勾选自动生成 README、License 或 .gitignore。课程要求公开展示时选择 Public；若先选 Private，提交前确认老师能访问。

下面的 YOUR_GITHUB_ACCOUNT 是需要替换的占位内容，不是发送方账号。源码包不包含 .git 历史，因此首次上传使用 git init。用户名和邮箱填写接收方希望写入提交记录的信息。

```powershell
git init -b main
git config user.name "YOUR_NAME"
git config user.email "YOUR_EMAIL"
git add .
git status --short
git diff --cached --stat
git ls-files .env
```

最后一条应没有输出。检查暂存区没有 .env、钱包密钥、文件解密密钥、盐值、私人附件、node_modules 或临时构建文件。公开连接地址可以提交；凭据不能提交。不要使用 git add -f 强制加入忽略文件。

```powershell
git commit -m "Release StepFund 0.6.0"
git remote add origin https://github.com/YOUR_GITHUB_ACCOUNT/StepFund.git
git push -u origin main
```

按 Git 提示在本人浏览器中完成 GitHub 认证；GitHub 密码不是 Git 推送密码。不要把令牌写进 remote URL。若远程已有内容，先克隆原仓库再复制源码，正常合并；不要直接强制推送覆盖。

也可使用 GitHub Desktop：先在源码目录执行 git init -b main，再用 File → Add local repository 添加该目录；检查变更、Commit to main、Publish repository，选择本人账号及所需可见性。

---

## 04 / 检查 GitHub CI

上传后打开仓库 Actions，选择 Solidity and application checks。main 分支推送、Pull Request 和手动 Run workflow 都会触发检查。若仓库或组织禁用了 Actions，需要仓库管理员启用。

预期出现 Windows 与 Ubuntu 两个测试任务，以及独立覆盖率任务。它们安装锁定依赖、编译 Solidity、检查电路与打包合约一致性、运行测试、检查 TypeScript、构建应用。绿色勾号才代表那一次远程运行完成。

CI 只读仓库权限，不部署合约，不需要钱包私钥、Etherscan Key 或存储凭据。不要为了跑 CI 把测试网私钥放进仓库。

出现红叉时点击失败任务，查看第一个失败步骤。常见原因包括修改了合约但没重新导出 ABI、修改电路却没重建 proving assets、依赖锁文件不一致或网络下载失败。修复后重新提交；不要简单删除失败测试。

## 保留可核实的发布记录

记录仓库 URL、发布提交 SHA、Actions 成功运行 URL，后面再补 Sepolia 合约地址和验证链接。本地测试成功不等于 GitHub Actions 已经运行。

可以在仓库 Releases 创建 v0.6.0，附运行 ZIP 和两份指南；源码同时在 Git 仓库内。保留 LICENSE、THIRD-PARTY-NOTICES.txt 以及 vendor/snarkjs-source 对应源代码。snarkjs 与生成验证器有 GPL 许可，不能统一改称全部第三方代码为原创 MIT。

---

## 05 / 配置 Sepolia 部署

标准方案部署自带 TestUSD、v3 工厂及其固定 AcceptanceVerifier、ResearchVault。此方案能演示真实链上资金流和 ZK 验证；ResearchVault 的收益来自外部奖励，不是 Aave 利息。

```powershell
Copy-Item .env.example .env
notepad .env
```

只在本机 .env 填写以下值。等号后不要保留示例文字；Aave 三项先留空。建议专用测试网钱包，不用日常资产钱包，也不要使用 Hardhat 的公开私钥。

```text
SEPOLIA_RPC_URL=YOUR_SEPOLIA_RPC_URL
DEPLOYER_PRIVATE_KEY=YOUR_TESTNET_ONLY_PRIVATE_KEY
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_API_KEY
ASSET_ADDRESS=
AAVE_POOL=
AAVE_ATOKEN=
```

部署钱包需要 Sepolia 测试 ETH。RPC 必须返回 Chain ID 11155111，脚本拒绝其他公链。CLI 使用该 .env 中的私钥签名，因此运行部署命令就是发布者授权发送真实测试网交易；不要把 .env 发给任何人。

```powershell
npm run compile
npm run export:contracts
npm run deploy:sepolia
```

脚本逐步保存交易哈希，等待确认后写入 public/deployments/11155111.json。进度保存在同目录 11155111-progress.json。中断或超时先查浏览器交易回执，再用相同钱包、相同源码、相同配置重新运行续接；不要删除进度文件重复付费。失败交易需核对后仅移除对应失败步骤。改过配置的旧进度会被拒绝复用。

钱包按钮路径也可部署 token 与 factory，factory 会同时创建验证器，且不用在应用输入私钥；但该路径不创建 ResearchVault。要交付完整的标准资金库示例，优先使用以上 CLI。不要同时从两条路径重复部署。

---

## 06 / 验证合约与分发连接

```powershell
npm run verify:sepolia
```

脚本读取 11155111.json，验证 TestUSD、工厂、固定验证器、已部署资金库，以及工厂当前登记的各个项目合约。后续创建新项目后，再运行一次验证脚本。

打开 Sepolia Etherscan 对应地址的 Contract 页面，确认源代码已验证。脚本报错或浏览器只显示字节码都不算验证完成。编译参数是 Solidity 0.8.30、optimizer 200、viaIR、Paris，均已在配置与导出文件里固定；不要为了通过验证临时换编译版本。

第三方接口有延迟时稍后重试；API Key 失效就更新本机配置。手动验证可使用 public/contracts 中的 verification.json 标准编译输入，但构造参数仍须与原交易一致。程序内还保留 Sourcify 发布者工具，其成功结果应以服务返回的完整匹配为准。

## 让其他电脑连接同一组项目

1. 将公开的 11155111.json 发给使用者，他们在连接中心导入或输入 factory 地址。
2. 保留该记录到 public/deployments，再重新构建运行包。不要把本机 .env 或整个浏览器配置目录一起分发。

```powershell
npm run build:portable
npm run package:windows
```

Windows 打包脚本生成源码目录旁的 StepFund-Windows 文件夹，包含启动脚本与 Node 运行时。完整压缩该文件夹后发送；建议输出到空目录，避免混入旧文件。源码库同步提交公开连接 JSON，切勿提交 .env。

GitHub 只保存源码，不会自动让前端成为公网网站；Sepolia 部署也只是部署合约。一键运行包在每个人电脑上启动本地网页，通过同一公开工厂访问同一链上数据。若需公网网页，另行部署 portable-dist 到 HTTPS 静态托管服务，根路径部署并提供 SPA 回退。

---

## 07 / 可选：Aave V3 部署

不要把 TestUSD 的地址填给 Aave。Aave 只接受配置中的受支持储备资产；本前端要求六位小数。发布者需先从 Aave 官方文档与 Address Book 找到同一 Sepolia 市场的 Pool、储备代币、对应 aToken，并确认市场仍可用。

本包不填死容易过期的第三方地址。将确认后的资产地址填入 ASSET_ADDRESS，Pool 填入 AAVE_POOL，对应 aToken 填入 AAVE_ATOKEN。合约构造时会核对 aToken 的 UNDERLYING_ASSET_ADDRESS 与 POOL；脚本会检查资产小数位。

从一份独立的源码解压目录操作，避免复用标准 TestUSD 部署的进度文件。填好 .env 后执行同一组 compile、export:contracts、deploy:sepolia、verify:sepolia 命令。新的公开记录会含 aaveVault、aavePool 和 aaveAToken。

连接新工厂，使用资产发行方提供的对应测试代币。创建项目时把 aaveVault 填入资金库地址。出资、存入、结算赎回并检查 explorer 交易；没有实际完成这些步骤前，不要写“公开 Aave 接入已验证”。

池暂停、代币脱锚、赎回流动性不足及上游升级都是外部风险。这里不借款、不加杠杆、不预测收益，也不保证本金。默认可复现演示仍使用 ResearchVault；通过给资金库转入少量测试奖励，可以观察实际份额价值变化。

## 真实 IPFS 上传验收

由接收方在程序中连接自己的已有 Storacha 空间，亲自完成邮箱授权并上传一个非敏感小文件；记录 CID，另一个浏览器从网关读取并核对链上 Keccak 哈希。旧文档域名已跳转，账号授权、空间配额或服务不可用时，改用其他 IPFS 提供方，粘贴 CID 和哈希继续流程。不要把模拟网关测试写成真实存储账户上传成功。

---

## 08 / 发布后的验收清单

- 仓库可访问，包含 .sol、Circom、完整测试、CI、README、安全分析与许可；不只是上传 ZIP。
- GitHub Actions 的指定提交全部通过，保留对应运行链接。
- Sepolia 工厂 protocolVersion 为 3，asset 与分发记录一致；工厂固定验证器可查询。
- TestUSD、工厂、验证器、资金库及演示项目源码已在区块浏览器验证。
- 至少两个独立钱包完成出资、委托或投票，以及提款或退款。
- 资金库完成存入、赎回与收益领取；无奖励时不要声称有市场利息。
- 独立验收人先确认承诺，创建者本机生成证明并在链上成功验证，普通投票仍然生效。
- 密文文件经过真实 IPFS 发布，另一电脑校验哈希并成功解密；密钥只私下发送。
- 新运行包完整解压后可双击启动，导入同一公开连接 JSON 后看到同一组项目。

## 常见问题

部署 ETH 不足：领取对应 Sepolia 测试 ETH 后重试，tUSD 不能支付 gas。nonce 或 pending：先查看钱包及进度哈希，避免重发。合约验证不匹配：核对源码版本、构造参数、编译设置与网络。账号切换：重新连接，不能用另一账号续接旧部署。CI 失败：修复具体报错，不上传 node_modules 绕过安装。

程序与本地验证已交付；GitHub 上传、远程 CI、公开 Sepolia/Aave 操作及真实存储账号上传，均由接收方按本指南完成。未完成的验收项应明确保留为待完成，不填虚构地址或截图。

## 官方资料与版本说明

- GitHub 上传本地代码：https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github
- Ethereum 测试网络：https://ethereum.org/developers/docs/networks/
- Etherscan 验证说明：https://docs.etherscan.io/contract-verification/verify-with-hardhat （该网页当前示例针对 Hardhat 3；本项目使用锁定的 Hardhat 2 配置，不直接照搬配置段。）
- Aave V3 合约与地址资料：https://aave.com/docs/aave-v3/smart-contracts
- Storacha SDK 源码：https://github.com/storacha/upload-service/tree/main/packages/w3up-client
- snarkjs 与公开参数：https://github.com/iden3/snarkjs
