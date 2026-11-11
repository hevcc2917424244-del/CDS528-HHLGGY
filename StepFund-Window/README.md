# StepFund

Version **0.6.0**, immutable contract protocol **v3**. [Governance and threat analysis](GOVERNANCE.md).

Recipient handoff: [使用指南](docs/USER-GUIDE.zh.md) · [GitHub 与 Sepolia 上传指南](docs/RELEASE-GUIDE.zh.md). The separate source ZIP, Windows ZIP and both PDFs have the same version. The recipient publishes under their own GitHub account and signs their own testnet transactions; nothing is published automatically.

The earlier 0.5.1 interface refresh added a warm paper and forest-green visual identity, original SVG button/ledger details and three locally bundled category illustrations. All buttons remain semantic controls with live bilingual labels, keyboard focus and disabled states. The illustrations are decorative, not photographs of funded projects or evidence of delivery. That visual identity is retained in 0.6.0; the changes below introduce new immutable contracts. Design provenance and exact image prompts are in `reports/design/asset-prompts.json`.

A bilingual Ethereum testnet dApp for milestone-based crowdfunding. Funds stay in an independent project escrow. Contributors review evidence and approve each milestone using their original contribution weight. Failed funding, rejected votes, and overdue evidence unlock refunds of the unreleased balance.

This repository is the **program deliverable** for the CDS 528 DeFi group project. The academic report and presentation are intentionally deferred. This is an educational prototype using valueless tUSD, not a production financial service.

## Start using it

**Windows portable edition:** extract the separate `StepFund-Windows.zip`, open its folder, and double-click **Start StepFund.cmd**. It includes Node.js and compiled assets. Practice mode runs offline without installing developer tools. Keep the launcher window open; closing it stops the server. Open the address printed by the launcher if the browser does not open automatically (default port 5280). Occupied ports are handled automatically and the chosen port is remembered. The language button switches the full interface between English and Chinese.

**Source edition:** Node.js 24 LTS is recommended (tested on 24.15.0). Install dependencies once, then start the app:

```sh
npm ci
npm run dev
```

The development URL is `http://127.0.0.1:5173`. On Windows, **Start Development.cmd** installs missing dependencies and starts this server. If the npm registry is inaccessible, use `npm ci --registry=https://registry.npmmirror.com`; keep TLS verification enabled.

The portable edition runs the same React application as the source edition. Its local HTTP server binds only to `127.0.0.1`. It does **not** start an Ethereum node. Practice state and preferences are stored in the current browser and origin, so port 5173 and port 5280 have separate practice data.

## What works

- Project discovery, text search, status filters, and separate backed/created portfolios.
- Immutable milestone budgets and deadlines, one to eight milestones per project.
- Exact six-decimal token amounts, capped fundraising, and creator-controlled contribution pause.
- Evidence links and Keccak-256 commitments; an IndexedDB attachment library with local saving, safe raster/text previews, file downloads and a manifest. Portable evidence ZIP export/import transfers actual files between reviewers, with project/network matching and hash validation. Saving does not upload a file.
- Contribution-weighted votes, single-hop stage-specific delegation, duplicate-vote protection, **60% approval AND 70% participation of all contributions**, and permissionless settlement.
- An atomic **5% creator bond**, separately accounted and either returned or distributed to contributors under explicit failure rules.
- Optional Storacha session authorization and public IPFS upload, CID/hash form filling, gateway retrieval and independently hash-verified raster/text previews. A provisioned user storage account is required for uploads; live authenticated provider availability is not yet validated.
- Creator pull withdrawals and proportional refunds of unreleased funds, including rounding-dust handling.
- Local practice accounts, time advancement, reset, and persistent browser-local history.
- Real wallet transactions on **Sepolia (11155111)** or **Hardhat Local (31337)** only; exact-amount token approvals and transaction receipts. Phone wallets connect to Sepolia through the built-in MetaMask QR flow; browser wallets also support the local chain.
- Resumable wallet deployment of the token and factory, plus reproducible command-line deployment and verification scripts.
- Fund transparency charts and per-project ledgers that separate locked funds, approved credit, refundable funds, withdrawals and paid refunds without double-counting.
- An account-aware Action center for votes, evidence, withdrawals, claims and permissionless settlements, with actual deadlines.
- A persistent transaction journal with bounded confirmation waiting, pending/unknown states, replacement checks and receipt recovery after reload.
- Startup stages, automatic port fallback, existing-instance reuse and logs in the Windows launcher.
- Confirmed transaction history for this browser, JSON export, and Sepolia explorer links.
- Responsive English/Chinese UI. User-written project text is shown as entered rather than automatically translated.
- An integrated connection center: mobile QR, wallet balance checks, Sepolia ETH faucet links, the on-chain tUSD faucet, public connection-file import/export, and publisher tools for deployment and source verification.

Practice mode is explicitly labeled. It does not send transactions or invent transaction hashes. Chain mode reads project state from contracts; browser storage is not its source of truth. The test token can be claimed once per address per 24 hours. The practice faucet deliberately has no cooldown.

## Treasury and private acceptance in 0.6

- Optional ERC4626 strategy chosen atomically before the first contribution. At most 20% of raised principal is invested; the 5% creator bond is isolated. Deposits have a share slippage limit, and token allowances are reset after each deposit.
- Funding finalization redeems the strategy first. Negative yield cancels activation and opens proportional refunds of recovered principal without slashing the creator bond. After the funding deadline plus seven days, anyone may cancel funding and distribute liquid refunds and transferable vault shares in kind. This does not guarantee immediate share redemption.
- ResearchVault is an ownerless testnet vault with **externally funded rewards**, not a real-market lending rate. AaveV3Vault performs actual `supply`/`withdraw` calls to an explicitly configured pool. It requires a supported six-decimal reserve; custom TestUSD cannot be supplied to Aave. Public Aave deployment remains a recipient-operated step. The frontend reads and displays the token symbol.
- Real Circom + snarkjs PLONK circuit, locally bundled WASM/proving key, browser worker, generated on-chain verifier, and a public Powers of Tau transcript checked with the published BLAKE2b-512 checksum. `npm run zk:build` reproduces the assets; `npm run zk:check` recompiles the witness generator and detects stale assets.
- Each private milestone needs the independent assessor's on-chain commitment. The circuit proves a private unsigned 64-bit measurement falls within inclusive bounds, binds it to a random salt and a domain containing chain, campaign, milestone and file hash, and the contract then opens the normal 60%/70% vote. A ZK proof does not prove real-world delivery or an assessor's honesty. Identical human control of different addresses remains possible.
- Optional local AES-256-GCM file encryption, authenticated decryption and safe raster/text preview. Upload ciphertext, commit its hash, and share the file key privately. Measurement, salt and encryption keys are never written to localStorage or sent to a server by the app. Users must retain them outside the app; closing a panel loses them.

## Share with other people

Recipients need only the Windows portable ZIP to use offline practice mode. For actual Sepolia transactions, they need Internet access and either **MetaMask Mobile** or a browser wallet. They do not need Node, npm, a desktop wallet extension when using their phone, or an Etherscan account.

1. Open **Connect wallet** to display the bilingual connection center.
2. Choose **Connect phone wallet** and scan the generated code inside MetaMask. Approve account access on the phone. Alternatively, choose **Use browser wallet**. Pairing expires after two minutes and can be cancelled. The QR is generated by the actual MetaMask Connect SDK, not a static wallet-download link. Network access to MetaMask's relay and the public Sepolia RPC is required. Hardhat's loopback chain is for desktop browser wallets only.
3. Refresh the ETH balance. **Get Sepolia ETH** opens an external faucet; login, eligibility checks, CAPTCHA and availability belong to that service. Return and refresh after claiming. StepFund cannot mint Sepolia ETH. A positive balance is not a guarantee that a particular transaction's gas is covered.
4. Import the publisher's `StepFund-connection.json`, or select Sepolia and paste a trusted factory address. Click **Connect wallet** to load the actual projects.
5. Reopen **Connect / configure** to claim tUSD, inspect balances, or export a connection file. Sharing exports only the chain ID, factory address and token address. Import never installs endpoints or credentials from the file. Share only a trusted deployment; file validity is not a security assessment.

The publisher deploys the token and factory once and shares their public configuration with all participants. Each new crowdfunding project has a separate escrow that also needs source verification. The app never stores wallet private keys or seed phrases. The SDK may persist its encrypted connection session in browser storage; **Disconnect** ends the app session. MetaMask's permission screen may include Mainnet as an SDK bootstrap scope; StepFund's transaction code still blocks Mainnet. SDK analytics are disabled.

## Built-in source verification

Publisher tools in the connection center submit the exact bundled Standard JSON compiler input to **Sourcify API v2**, without an API key. First connect to the deployed Sepolia factory, then select the factory, token, or a registered project escrow. The interface distinguishes submitted, pending, partial match, failed, unavailable and verified results. Only matching creation and runtime results are shown as verified; network failures do not imply success. Check status again while a submitted job is pending. No source is submitted until the publisher clicks **Submit source verification**.

Sourcify publicly stores source and compilation data. Its success is **not** a security audit or proof that Etherscan has verified the address. The interface includes explorer links and exports the original compiler input for Etherscan's Standard JSON flow. The existing Etherscan script remains available for the course's preferred explorer. `node scripts/check-verification-input.cjs` recompiles the exported inputs and checks that all three deployment bytecodes exactly match the bundled artifacts.

## Evidence and transaction recovery

Save evidence in each project's evidence library, choose its milestone, and preview or download it. Each file is limited to 20 MB; the origin-wide library is limited to 100 MB. PNG/JPEG/GIF previews check file signatures; text previews render escaped text, limited to 64 KB. PDF/office/HTML/SVG files can be saved and downloaded but are not executed in the page. Only one primary file hash is anchored per milestone. A matching hash proves bytes are consistent, not the truth of project claims. Clearing browser data removes local files.

**Share evidence in one package (0.4.0):** choose **Export evidence ZIP** to download this project's locally saved file contents and their milestone/hash manifest. Send the original ZIP to the reviewer. On another computer, open the same project and choose **Import evidence ZIP**. The app checks every file, the project identity and network, then shows which files match the currently loaded milestone commitments. Review and choose **Save to evidence library**. Duplicate files are skipped; cancellation or validation failure saves nothing. Storage failure rolls back the whole import. Hashing and ZIP processing run in a cancellable background worker.

Packages are limited to 100 files and 100 MB of file contents (101 MB maximum ZIP). Use the original StepFund ZIP without recompressing it; encrypted, compressed, malformed, oversized, duplicate-path or undeclared entries are rejected. Ordinary ZIP software can extract exported files. Practice bundles are restricted to the same practice project and do not count as chain evidence. The package is not signed: it proves file consistency, not the sender's identity. The separate **Download manifest** button still exports metadata only. ZIP sharing requires no cloud account and does not publish files, sync browsers, submit evidence, or send transactions. Keep a reachable HTTPS/IPFS link for the primary evidence submission; reviewers can also check the shared file against its on-chain hash.

**Network & practice → Transaction recovery** lists public transaction hashes and their status. After a reload or RPC failure, check the receipt before retrying. If a wallet replaced a transaction, supply the replacement hash: sender, nonce and action must match for it to count as the original action succeeding. Waiting ends after two minutes with a pending/unknown state, not a fabricated failure. An interruption before the wallet returns a hash must be checked in the wallet itself. No automatic resend occurs. This journal is browser-local and does not represent all account history.

**Network & practice → Startup & diagnostics** shows the portable launcher state and log link. **Open Startup Logs.cmd** opens its log folder. Logs contain startup events only. A different port uses different browser storage; fallback does not migrate or delete the original practice state, evidence or recovery journal. Stop the conflicting service and start with `PORT` set to the original port to return to that origin.

## Ethereum local development

In one terminal:

```sh
npm run chain
```

In another terminal:

```sh
npm run deploy:local
npm run dev
```

Deployment creates TestUSD, the v3 factory (with its pinned verifier), ResearchVault, and three sample projects. The first sample has a fully funded milestone vote. The deployment record is written to `public/deployments/31337.json`. These addresses only exist on that local node. Restarting the node resets its chain; rerun deployment and reset the wallet's local transaction history if its nonce cache is stale.

In MetaMask, use RPC `http://127.0.0.1:8545`, chain ID `31337`, and symbol `ETH`. For development only, import one of the publicly known accounts printed by Hardhat. Account 0 creates the samples; accounts 1 and 2 fund the first project. Never use Hardhat development accounts on public networks. Connect the wallet using the factory address generated by deployment.

## Sepolia deployment and verification

**Actual Sepolia deployment and public source verification remain pending until a user-controlled test wallet approves deployment using test ETH. No Sepolia address is fabricated. Built-in Sourcify verification needs no API key; the command-line Etherscan workflow below does. A public GitHub repository has not been created for the user. Public deployment, verification and the repository remain required before submission.**

Option A: open **Connect wallet**, pair a phone or browser wallet, select **Sepolia → Switch wallet network → Publisher tools → Deploy / resume contracts**. Confirm two wallet transactions, save the downloaded deployment JSON, then connect with the resulting factory. No private key is requested by the app. If interrupted after deploying the token, return using the same account, network and browser origin, then click the deployment button again. The saved receipt and deployed code are checked before continuing with the factory. Pending transactions block duplicate sends; confirmed steps are not redeployed. Completed deployment data is also saved locally.

Option B: copy `.env.example` to `.env` and set a dedicated testnet wallet's `DEPLOYER_PRIVATE_KEY`, `SEPOLIA_RPC_URL`, and `ETHERSCAN_API_KEY` locally. Do not share or commit this file.

```sh
npm run compile
npm run deploy:sepolia
npm run verify:sepolia
```

For wallet deployment, first place its downloaded `11155111.json` in `public/deployments/`, then run verification with an RPC URL and explorer API key. The verification script verifies the custom token, factory, verifier, deployed research/Aave vaults, and all currently registered campaign contracts using their original constructor arguments. Run it again after creating new campaigns. Failed or missing verification is not treated as success. Use the compiler and settings in `hardhat.config.cjs` exactly: Solidity 0.8.30, optimizer 200, via-IR disabled, Paris EVM.

After publishing the frontend, use **Connect / configure** to enter the verified factory address for the selected network. An unknown factory can return arbitrary addresses: verify its provenance before approving tokens. To make a new address the default for all users, update the public deployment JSON and rebuild.

## Contract design

| Contract            | Responsibility                                                                    |
| ------------------- | --------------------------------------------------------------------------------- |
| `TestUSD`           | ERC-20, six decimals, 1,000 tUSD faucet with per-address cooldown                 |
| `StepFundFactory`   | Immutable token address, independent campaign deployment, registry and events     |
| `MilestoneCampaign` | Fundraising, fixed budgets, evidence, weighted voting, staged credits and refunds |

```text
Funding --goal met and finalized--> Active
Funding --deadline, below goal----> Refunding
Active  --evidence + vote passes--> next milestone / Completed
Active  --vote fails or expires---> Refunding
```

An evidence submission deadline is not the voting deadline. A timely submission always gets its full voting period. Each following evidence deadline must leave at least the voting period plus one hour after the previous deadline; the UI uses whole days and a stricter extra day. If settlement is delayed beyond the following evidence deadline, the next stage can be expired and the remaining money refunded.

Approval requires both `yesWeight * 100 >= totalRaised * 60` and `(yesWeight + noWeight) * 100 >= totalRaised * 70`. Both use all contributions. Contributions lock at activation; delegation freezes when a stage opens for voting and resets at the next stage. Delegates cannot re-delegate, create chains/cycles or transfer refund entitlement. The creator deposits a separately accounted 5% bond at creation; failed fundraising/completion/no-quorum returns it, whereas missed evidence or rejection with quorum distributes it pro rata to contributors. See [GOVERNANCE.md](GOVERNANCE.md) for exact rounding, invariants, attack examples and economic limitations.

Approved funds become a creator credit and are withdrawn separately. After rejection, only `totalRaised - released - treasuryLoss` is refundable (treasuryLoss is zero for an activated project). Emergency rescue records the invested principal as removed from the liquid ledger and distributes vault shares separately. Previously approved funds cannot be clawed back. Refunds use integer arithmetic with downward rounding; the final claimant receives the residue (at most `contributorCount - 1` token base units). Even zero-rounded claims advance the claim counter. Direct token donations are not contributions, have no votes, and have no recovery/sweep mechanism.

There are no upgrade proxies, arbitrary owner withdrawals, editable budgets, or fee recipients. Pause affects new contributions and treasury deposits, while exits remain available. Deadline finalization, votes, settlement, refunds, and creator withdrawals remain callable. Anyone can trigger time-based transitions; the interface does not imply that a blockchain contract executes itself on a timer.

## Validation

```sh
npm run compile
npm run zk:check
npm test
npm run test:domain
npm run test:coverage
npm run typecheck
npm run build
npm run build:portable
```

Contract tests cover successful completion, failed fundraising, no votes, minority-only approval, late evidence, timed boundaries, pull payments, duplicate votes/claims, unauthorized actions, independent escrows, pauses, input constraints, and rounding conservation. The local-chain browser test used an injected EIP-1193 test adapter and real Hardhat transactions; it is not a claim that every wallet extension was tested.

Current validation and its limitations are recorded in `reports/validation-0.6.json`. The complete Hardhat suite includes real PLONK proofs checked by the generated Solidity verifier, treasury loss/illiquidity recovery and an explicitly mocked Aave pool. Domain tests cover authenticated encrypted evidence and context separation. Browser integration uses a local Ethereum chain and an EIP-1193 test adapter; it is not a physical MetaMask or public Sepolia result. Generated cryptographic assembly is excluded from coverage instrumentation, but real valid/tampered proofs are tested. Earlier validation files are historical baselines, not evidence for v3.

## GitHub and continuous integration

The recipient uploads the source to a repository they own. No account is hardcoded, no GitHub authorization is required from the sender, and no hosted Actions run is claimed. See the release guide for both GitHub Desktop and Git CLI instructions. CI never deploys contracts or requires wallet keys.

`.github/workflows/ci.yml` runs on main-branch pushes, pull requests and manual dispatch. Windows and Ubuntu jobs install the lockfile with `npm ci`, compile pinned Solidity, compare fresh artifacts against bundled ABI/bytecode/verification sources, run the complete Hardhat and application suites, check TypeScript and build the portable frontend. A separate Ubuntu job uploads Solidity coverage for 14 days. Actions are pinned to verified commit SHAs, repository permissions are read-only, and fork PRs need no wallet key or service secret.

When editing contracts: run `npm run compile`, `npm run export:contracts`, then `node scripts/check-contract-bundle.cjs`. Commit the updated Solidity and public bundles together. Never export coverage-instrumented bytecode; clean and recompile normally after coverage. Mocks under `contracts/test/` are test fixtures and excluded from production coverage/scanner scope.

## IPFS publication and verification

Save a local attachment, open **Publish a file to IPFS**, enter the email of an existing Storacha account and authorize the session from your mailbox. Select an already provisioned space and file, review the public-publication confirmation, then upload. The client does not create paid plans or bundle shared credentials. Choose **Use CID & hash in evidence form**, then separately submit the milestone transaction. Upload acceptance is not the same as gateway availability or chain submission.

Any reviewer can use **Verify & preview** on an IPFS milestone. The application validates the CID/path, uses a per-CID gateway origin, downloads at most 20 MiB without sending cookies, and compares Keccak-256 to the loaded commitment before previewing. The selected gateway can be changed if one is unavailable. CORS/timeout/missing-content and hash-mismatch errors are distinct. Images and escaped text render inline; PDF/Office/HTML/SVG use download or external viewing. CID addressing does not itself prove a project's claims. Public uploads may remain retrievable indefinitely.

The Storacha client is lazy-loaded and uses a page-session memory store; refresh/disconnect requires a new authorization. The provider's actual login/upload requires a provisioned user account and is **not claimed as live-tested**. You may instead enter an IPFS URI from any compatible provider. NFT.Storage Classic stopped uploads in 2024; do not use a legacy Classic API key. See provider/source references in [GOVERNANCE.md](GOVERNANCE.md).

## Upgrade from earlier versions

These contracts are immutable. Create a **new v3 deployment** for treasury and private acceptance; existing escrows and user funds are not migrated. The frontend can still manage basic v2 campaigns, while v1 requires the previous client. The practice-state key remains v2 and its saved projects are preserved. New DeFi/ZK actions require real chain mode, including local Hardhat; they are never simulated as successful proofs in practice mode. Factory v3 deploys and pins its own generated AcceptanceVerifier so creators cannot substitute an always-true verifier.

Browser smoke tests (with the development server running):

```sh
npx playwright install chromium
node scripts/browser-smoke.cjs
node scripts/optimizations-smoke.cjs
node scripts/evidence-sharing-smoke.cjs
node scripts/governance-ipfs-smoke.cjs
node scripts/wallet-recovery-smoke.cjs
node scripts/launcher-smoke.cjs
node scripts/advanced-smoke.cjs
```

Set `STEPFUND_URL` to test the portable server instead. The advanced smoke test defaults to RPC `http://127.0.0.1:18545` (override `STEPFUND_TEST_RPC`) and deploys its own local-chain fixtures. The evidence-sharing test requires a running Hardhat node and creates a separate project fixture. Two isolated browser profiles transfer real files, compare a real local-chain commitment, test cancellation/duplicates/tampering and fill the actual IndexedDB library to test atomic quota rejection. Their read-only wallet adapters send no browser transactions. Optional WebMCP tools read loaded projects and navigate to a project; they never send transactions. Their handlers are tested using a registry shim. Native WebMCP execution was unavailable in the local test browser and is not claimed as verified.

New setup checks: `node scripts/connection-center-smoke.cjs` tests the actual SDK's QR generation/cancellation without an installed extension, configuration import, compiler-input download and bilingual mobile layout. `node scripts/setup-verification-smoke.cjs` uses **mocked** Sourcify responses and read-only local-chain data to exercise failure/pending states and sharing; it is not evidence of actual Sepolia verification. `node scripts/wallet-deployment-smoke.cjs` deploys real local-chain contracts through the UI using a deterministic test wallet adapter. Real phone consent and signatures still require an end-to-end run with a physical user wallet.

`node scripts/service-readiness.cjs` performs read-only live checks from the app's browser origin. The recorded run reached Sepolia RPC (correct chain ID) and Sourcify API v2 (an unverified test address returned 404). It did not submit source verification or claim faucet funds.

Static analysis (Python 3.12 recommended):

```sh
python -m pip install -r requirements-security.txt
npx hardhat clean
npm run compile
python -m slither . --hardhat-ignore-compile --filter-paths node_modules --fail-medium --json reports/security/slither-new.json
```

Clean build information first: Slither can otherwise inspect stale Hardhat compiler outputs. `--fail-medium` fails on high/medium findings while retaining lower-severity findings in the JSON. Do not suppress them without review. Windows users can run `scripts/scan.ps1`. The current scan is `reports/security/slither-0.6.0-clean.json` (18 high, 3 medium raw findings); `reports/security/review-0.6.md` records developer triage. The scanner threshold does not pass. Earlier scans are historical evidence. Filter `contracts/test` as well as dependencies when assessing deployed code.

## Rebuild the portable package

```sh
npm run compile
npm run export:contracts
npm run build:portable
node scripts/collect-licenses.cjs
npm run package:windows
```

Packaging is for Windows x64 and copies the currently running Node executable into the sibling `StepFund-Windows` directory. The supplied Node license matches v24.15.0; update it when changing runtime version. The package includes source dependency notices. A local browser is required. Actual testnet transactions additionally need Internet access and a phone or browser wallet.

## Source map and reproducibility

`contracts/` contains Solidity; `test/` contains contract tests; `lib/stepfund/model.ts` implements the labeled practice simulator; `lib/stepfund/chain.ts` handles wallet reads/writes; `components/stepfund/` contains the UI; `scripts/` contains deployment, verification, scan and packaging tools. The lockfile pins dependencies. No user credentials are embedded. The Sites-hosted source repository, if used, is private and does not replace the assignment's required public GitHub repository.

## Attribution and AI disclosure

Original StepFund application code is MIT licensed. snarkjs and the generated AcceptanceVerifier retain GPL-3.0, with corresponding source/build configuration under `vendor/snarkjs-source`; the portable package supplies it under `licenses/snarkjs-source`. OpenZeppelin implementations are imported from their packages rather than claimed as original. UI primitives come from Shadcn/Radix; the web starter comes from Sites. See `THIRD-PARTY-NOTICES.txt`, `LICENSE`, and included third-party license files. No code or assets were copied from the supplied MintFlow project PDF. That PDF was used only to compare feature scope.

The implementation, tests, interface copy, and documentation were prepared with assistance from OpenAI Codex under the user's direction. The team should review the source, rerun tests, verify deployments, and accurately disclose this assistance in its eventual submission. No fabricated experiment results, public deployment addresses, or group-member identities are included.

Technical references:

- OpenZeppelin. (n.d.). _Contracts 5.x documentation_. https://docs.openzeppelin.com/contracts/5.x/
- Ethereum.org. (n.d.). _Networks_. https://ethereum.org/developers/docs/networks/
- Nomic Foundation. (n.d.). _Hardhat 2 documentation_. https://v2.hardhat.org/docs
- Trail of Bits. (n.d.). _Slither detector documentation_. https://github.com/crytic/slither/wiki/Detector-Documentation
- Ethers. (n.d.). _Ethers v6 documentation_. https://docs.ethers.org/v6/
- Solidity. (n.d.). _Security considerations_. https://docs.soliditylang.org/en/latest/security-considerations.html
- MetaMask. (n.d.). _MetaMask Connect EVM_. https://docs.metamask.io/metamask-connect/evm/
- Sourcify. (n.d.). _API v2_. https://docs.sourcify.dev/docs/api/
- fflate. (n.d.). _ZIP and compression library_. https://github.com/101arrowz/fflate

## 中文快速说明

普通体验：解压一键运行包，双击 **Start StepFund.cmd**，点击顶部“中文”。演示模式可离线操作，支持创建项目、切换身份、推进时间、投票、提款和退款。演示操作不会发送链上交易。

真实链上模式：打开“连接钱包”，扫码连接手机 MetaMask（电脑无须安装钱包扩展），或使用已有浏览器钱包。接收者导入发布者分享的连接 JSON 即可接入同一套 Sepolia 项目。连接中心提供测试 ETH 余额检查、外部领币入口和 tUSD 领取。“发布者工具”内置部署与免 API Key 的 Sourcify 源码验证，也可导出编译资料用于 Etherscan。测试 ETH 仍需实际领取，钱包签名由本人确认；普通接收者不需要 Etherscan 账号。公共测试网部署、实际合约验证以及公开 GitHub 上传仍须在最终提交前完成。

0.4.0 新增成果 ZIP 分享：在项目附件区“导出成果 ZIP”，将原包发送给审查者；对方打开同一项目后“导入成果 ZIP”，核对项目、网络、文件哈希及阶段提交，再保存。重复文件会跳过，校验失败或空间不足不会留下部分导入。支持中英文界面和取消处理。文件不自动上传云端，链上提交仍需有效 HTTPS/IPFS 地址。
