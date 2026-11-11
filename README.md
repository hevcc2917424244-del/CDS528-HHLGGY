# CDS528-HHLGGY · StepFund

**StepFund** —— 里程碑式众筹与托管平台，版本 **v0.6.0**（不可变合约协议 v3，solc 0.8.30 / EVM target: paris）。

本仓库放的是源码目录，不再提供压缩包。两个目录按用途区分：

| 目录 | 内容 | 适合 |
|---|---|---|
| **`StepFund-Source/`** | 完整工程：7 个 Solidity 合约、Hardhat 合约测试（57 项）、领域逻辑测试（39 项）、部署与导出脚本、Remix 验证工具链、前端源码、覆盖率与验证报告 | 读代码、跑测试、验证合约 |
| **`StepFund-Window/`** | 仅前端，不含合约工程与 Hardhat 工具链 | 只想打开界面看看 |

## 快速开始

### 只跑前端（`StepFund-Window/`）

需要 **Node.js 22.13+**。

**方式一：双击** `Start Development.cmd`。脚本会自动检查 Node → 缺依赖时执行 `npm ci` → 启动开发服务器并打开 <http://127.0.0.1:5173/>。

**方式二：命令行**

```bash
cd StepFund-Window
npm ci        # 首次运行，或删过 node_modules 之后
npm run dev
```

首次安装依赖约 1.5 GB，视网络 3～10 分钟。运行期间的命令窗口不要关闭，关掉即停止服务；按 `Ctrl + C` 停止。

### 跑完整工程（`StepFund-Source/`）

```bash
cd StepFund-Source
npm ci
npm test              # Hardhat 合约测试 + 领域逻辑测试
npx hardhat compile   # 编译合约
npm run dev           # 启动前端
```

具体命令、环境变量与部署流程见 `StepFund-Source/README.md`（最全）、`StepFund-Source/README-源码包说明.md`（中文）与 `docs/` 下的《用户指南》《发布指南》。

## 合约一览

`StepFundFactory`（工厂）· `CampaignDeployer`（creation code 载体）· `MilestoneCampaign`（里程碑众筹主合约）· `AcceptanceVerifier`（PLONK 验证器）· `ResearchVault`（金库与收益分配）· `AaveV3Vault`（Aave V3 接入）· `TestUSD`（测试用 ERC20）

## 注意

- 环境变量请参照 `StepFund-Source/.env.example` 自行创建 `.env`，**真实密钥不要提交**
- `node_modules/`、构建产物、`.env` 均已在 `.gitignore` 中排除
- 不要用压缩包代替源码目录：二进制整包无法做增量对比，每改一次就多存一整份
