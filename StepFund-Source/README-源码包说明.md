# StepFund 源码包（Source）

**项目**：StepFund —— 里程碑式众筹与托管平台
**版本**：0.6.0　**打包日期**：2026-11-11　**合约编译器**：solc 0.8.30（EVM 目标 paris）

---

## 一、这个包里有什么

完整源码，已经剔除 `node_modules`、编译产物与本机缓存，解压后需要装一次依赖。

```
StepFund-Source/
├── contracts/              7 个 Solidity 合约 + 测试辅助合约
│   ├── StepFundFactory.sol     工厂：转发创建请求、登记项目
│   ├── CampaignDeployer.sol    creation code 载体（本轮改造新增）
│   ├── MilestoneCampaign.sol   里程碑众筹主合约（含 CreateRequest 结构体）
│   ├── AcceptanceVerifier.sol  PLONK 验证器
│   ├── ResearchVault.sol       金库与收益分配
│   ├── AaveV3Vault.sol         Aave V3 接入
│   └── TestUSD.sol             测试用 ERC20
├── test/                   Hardhat 合约测试（57 项）
├── test-domain/            领域逻辑测试（39 项）
├── scripts/                部署、冒烟、导出、打包脚本
├── remix-verify/           Remix 验证工具链 + 扁平化单文件 StepFundAll.sol
├── app/ components/ lib/   前端源码（Next.js 兼容层 + Vite 便携构建）
├── public/                 静态资源（合约 ABI、zk 材料、身份素材）
├── docs/                   《用户指南》《发布指南》（中文）
├── reports/                覆盖率与验证证据（json / md）
├── Start Development.cmd   Windows 双击启动前端
└── hardhat.config.cjs      编译配置（viaIR 已关闭）
```

## 二、跑起来

```bash
# 1) 装依赖（Node >= 22.13）
npm ci

# 2) 编译合约
npm run compile

# 3) 跑测试
npm test              # 合约 57 项
npm run test:domain   # 领域 39 项
npm run typecheck     # tsc --noEmit

# 4) 本地链 + 部署
npm run chain         # 终端 A，监听 127.0.0.1:8545
npm run deploy:local  # 终端 B

# 5) 起前端（另开终端，见 2 号包说明）
npm run dev           # http://127.0.0.1:5173/
```

## 三、本轮改造要点

原始版本在 Remix 在线 IDE 上报 `Stack too deep`，根因是 legacy codegen 下一个动态 calldata 参数占两个栈槽，
工厂的 10 参数 `new MilestoneCampaign(...)` 直接把栈打满。改造分两步：

1. **参数结构体化**：10 个构造参数收进 `MilestoneCampaign.CreateRequest`，栈基线从 13 槽降到 2 槽，栈溢出消除；
   但工厂运行时代码涨到 25,909 字节，越过 EIP-170 的 24,576 上限。
2. **拆分部署器**：新增 `CampaignDeployer.sol` 承载 creation code，工厂用 `msg.data[4:]` 零重编码转发过去，
   工厂运行时降到 3,228 字节。

最终体积（optimizer 200 runs / paris / 不启用 viaIR）：

| 合约 | 运行时字节 | 相对 EIP-170 上限 |
|---|---|---|
| StepFundFactory | 3,228 | 13.1% |
| CampaignDeployer | 23,696 | 96.4%（余量 880 字节） |
| MilestoneCampaign | 18,454 | 75.1% |

> 注意：不勾选优化器时 MilestoneCampaign 为 31,746、CampaignDeployer 为 39,674，两者都会超限且只在部署阶段报错。

## 四、验证结论（2026-11-11 复测）

| 项目 | 结果 |
|---|---|
| `npx hardhat compile` | 0 error，1 warning（验证器未用参数，改造前既有） |
| 合约测试 | 57 passing，0 failing |
| 领域测试 | 39 passing |
| `tsc --noEmit` | 通过 |
| 覆盖率 | 语句 99.53% / 函数 100% / 行 100% / 分支 70.81% |
| Slither | 144 条（High 18 / Medium 3 / Low 16 / Info 106 / Opt 1） |
| Remix 在线编译 | solc 0.8.30 + optimizer 200，0 error 1 warning，产物齐全 |

## 五、注意事项

- 本包**不含 `node_modules`**，首次使用必须 `npm ci`（需联网）。
- `.env.example` 是配置样板，真实密钥请勿提交；`.env` 未打包。
- 旧目录 `F:\1TERM1\Blockchain\contracts\` 是改造前的原始版本，**不要**再拖进 Remix，否则会重现 Stack too deep。
- 只想看界面、不碰合约：直接用 2 号包，不必装本包的 Hardhat 依赖。
