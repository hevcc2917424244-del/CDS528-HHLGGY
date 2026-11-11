# Security scope for 0.6.0

The current changes add ERC4626/Aave adapter calls, independent yield/share claims, liquidity rescue, real PLONK verification and local encrypted evidence. Read GOVERNANCE.md for trust and loss allocation. No independent security audit, real-money deployment, public Aave fork result or hosted CI run is claimed. Current checks are recorded in reports/validation-0.6.json; the v0.5 coverage/scanner references below are historical.

The verifier is pinned by the factory. A chosen vault is not automatically trusted merely because it has the ERC4626 interface. The default ResearchVault has no owner and only externally funded rewards; an arbitrary third-party strategy may be malicious or upgradeable. The deployment script validates Aave reserve identity and six decimals, but reviewers must also check the pool's official address and configuration. No automatic yield promise, lending of the bond, borrowing or leverage is implemented.

The seven-day rescue separates liquid principal from transferred vault shares. It prevents a blocked strategy from holding the uninvested reserve hostage, but does not force external redemption. Loss cancels activation so an underfunded project cannot promise unrecoverable stage budgets. Proofs require assessor attestation and ordinary backer voting; collusion and misleading source measurements remain possible. File keys and salts are sensitive and are not automatically persisted or recoverable.

## Current static-analysis record

The clean 0.6 scan has 18 high, 3 medium, 16 low, 106 informational and 1 optimization raw findings. The threshold check exits nonzero. See [developer triage](reports/security/review-0.6.md) and its unmodified [raw report](reports/security/slither-0.6.0-clean.json). Generated verifier exits and intentional guarded balance-delta checks account for the high/medium findings; the review records the remaining external-vault and callback-view trust limits. No zero-findings or independent-audit result is claimed.

## Historical security records and continuing controls

## Earlier security notes

Scope: the three StepFund Solidity contracts and their browser transaction adapter. Only TestUSD deployments made with the supplied code are supported. This prototype has not undergone an independent professional audit.

## Scanner evidence

Slither 0.11.6, Solidity 0.8.30, a clean non-instrumented build and 102 detectors. The historical v0.5 final scan is `reports/security/slither-0.5-reviewed.json`: **0 high, 0 medium, 9 low** findings, all deadline/timestamp checks. Dependencies and `contracts/test` fixtures are excluded from production scope; no detector is disabled. `slither-0.5.json` records the earlier scan, not the final source.

The earlier factory scan flagged a strict equality on a received-token balance and an external-call ordering issue. The final implementation retains the exact-amount requirement using a revert-on-mismatch check and performs registry effects before token callbacks, with non-reentrancy and atomic rollback. Tests cover fee-taking tokens and nested factory/payout attempts. The nine timestamp findings reflect deadlines in construction, contribution, funding finalization, evidence, voting, settlement, expiration, delegation and the faucet. Block time is never randomness or identity proof. Vote/funding/evidence boundaries are tested; users should avoid last-moment submissions.

## Threats, defenses and remaining limits

| Threat                                                  | Implemented defense                                                                       | Remaining limitation                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Creator takes the entire escrow immediately             | Immutable per-stage budgets; only approved budgets become pull-payment credits            | 60% yes plus 70% turnout can approve weak evidence; voters must review it                                           |
| Duplicate voting or stake inflation after voting begins | Contribution mappings become fixed after activation; one effective vote per contribution per stage, including frozen single-hop delegation       | Addresses do not establish identity; wealthy or colluding contributors can control a vote                 |
| Creator disappears or never submits evidence            | Anyone can expire overdue stages and finalize failed funding                              | A transaction must be submitted; no keeper is supplied                                                    |
| No voter participation                                  | 60% yes AND 70% turnout of original stake; no-quorum failure refunds principal and returns the bond               | Voter inactivity can terminate a legitimate project                                                       |
| Reentrant ERC-20 payout                                 | OpenZeppelin SafeERC20 + ReentrancyGuard; claim/credit state updated before transfer      | Factory token trust is essential; arbitrary malicious/rebasing assets are outside scope                   |
| Fee-on-transfer token underfunds escrow                 | Contribution and bond balance-delta checks revert non-exact transfers                              | The system is intended for the supplied six-decimal TestUSD, not arbitrary assets                         |
| Refund rounding strands funds                           | Big-integer pro-rata floor, final claimant receives dust; zero-rounded claims are allowed | The final claimant receives a tiny rounding advantage; unclaimed balances wait indefinitely               |
| Pause traps participants                                | Pause affects contributions only; settlement, withdrawals and refunds remain live         | Creator may pause fundraising until failure, after which contributors can refund                          |
| Frontend supplies wrong chain/spender                   | Mainnet guard, account/network recheck, factory membership check, exact approval amount   | An untrusted factory may lie; independently verify deployment provenance                                  |
| Wallet/network changes while signing                    | Provider account/network checks; wallet events clear displayed connection                 | An already confirmed transaction is irreversible; approval can succeed even if contribution fails         |
| Evidence is altered                                     | Immutable URI and nonzero Keccak-256 digest; file-hash verification in UI                 | Hashes prove byte consistency, not truth, copyright ownership or delivery; external hosting may disappear |
| Browser storage is edited or cleared                    | Chain balances and states are loaded from contracts; practice is clearly labeled          | Practice data and this-browser history can be changed or lost locally                                     |
| Large data or gas loops                                 | Maximum eight milestones; no transfer loops over contributors; project reads are paged    | Very large registries require more RPC calls; all unbounded participation is on a testnet                 |
| Unsolicited token transfer                              | Excluded from contributions and voting; cannot inflate accounting                         | Direct donations have no rescue function and may be stranded                                              |

TestUSD's permissionless faucet is deliberately Sybil-vulnerable and has no monetary backing. It is unsuitable as a production stablecoin. No price oracle is used or needed: all budgets and accounting use the same fixed test token. An oracle for ETH prices would introduce an unnecessary trust dependency.

## Invariants and operational decisions

1. `0 <= released <= totalRaised <= goal` and `withdrawn <= released`.
2. V3 uses `refundPool = totalRaised - released - treasuryLoss` when refunds open; it never changes afterward. Emergency in-kind rescue removes invested principal from cash accounting and distributes the vault shares separately.
3. `totalRefunded <= refundPool`; after all contributors claim, equality holds.
4. Approved budgets accrue once, votes count once per stage, and refunds can be claimed once per contributor.
5. Recorded liabilities never include unsolicited token donations.
6. Creator and token addresses, deadlines, budgets and voting duration cannot be edited. There is no proxy or upgrade key.

To respond to a funding-phase incident, the creator may pause new contributions while preserving exit paths. Existing deployments cannot be patched. If a defect is found, publish its scope, stop recommending new contributions, deploy a corrected factory, and use the original contract's existing refund/settlement rules. There is no administrator authority to recover arbitrary funds. Use test assets only.

Contract tests and Slither outputs are reproducible from the README. The approximately 81.44% branch coverage is reported separately from the 100% statement/line/function coverage; none of these figures proves absence of vulnerabilities.

## Connection center (introduced before v0.5)

MetaMask Connect EVM 2.1.1 is lazy-loaded only when the user chooses phone pairing. Its relay handles encrypted wallet sessions; StepFund never accepts private keys or recovery phrases. SDK analytics are disabled. The SDK includes Mainnet in permission discovery, but transaction paths continue to recheck signer and allowlisted chain IDs. Phone pairing is Sepolia-only. Disconnecting clears the selected app provider; accounts/network/disconnect events invalidate loaded chain data. Rejected pairing and two-minute pairing timeouts do not authorize transactions.

Connection files have a 16 KB input limit and an allowlisted public schema (chain ID, factory, optional token address). They cannot override RPC endpoints or inject credentials. Import does not prove deployment provenance: callers still load the factory's actual token from chain and must trust the publisher. Only browser-local transaction history is exported elsewhere; wallet secrets are never included in connection files.

The test-ETH faucet is an external service, not an embedded minting authority. The app reports actual wallet balances and keeps tUSD separate from ETH. Login/CAPTCHA and faucet eligibility are not bypassed. Sourcify receives only public source/compiler data after explicit UI submission; no API credential is needed. API v2 tickets are pending until completed, partial bytecode matches remain incomplete, and outages clear the current verified indicator. Verification proves a source/bytecode match, not security or independent verification on another explorer. That earlier connection-center release did not change contracts. Version 0.5 does; use its new scanner record above.

## Historical reliability and evidence additions (0.3.0)

No Solidity contract changed. Added same-block competing contributions, simultaneous refunds, and 16 seeded randomized amount/order/withdrawal scenarios asserting exact micro-token conservation after each payout. Finance segments partition recorded contributions, excluding unsolicited tokens. Tasks are derived from current actor/state and exact deadline boundaries; refund and withdrawal deadlines are not invented.

Transactions are journaled immediately after a hash is returned. Receipt waiting is bounded to two minutes; timeout/RPC failure stays pending/unknown and prevents another send of the same unresolved action. Exact-action accelerated replacements are accepted; a different action at the same nonce is marked cancelled/replaced. Receipt recovery checks chain, sender, nonce, target, calldata hash and value. Interrupted deployment keeps confirmed token/factory steps and verifies receipts, code and factory asset before proceeding. Browser storage remains a local convenience, not trusted chain evidence or guaranteed backup. Losing a request before its hash is returned still requires checking wallet activity. Physical MetaMask consent/signatures and public Sepolia transactions remain user-operated validation, not covered by the local EIP-1193 adapter.

Evidence files are local IndexedDB blobs, bounded to 20 MB/file and 100 MB/library. Raster previews are signature-sniffed, text is escaped and truncated for display, and active HTML/SVG/office formats are download-only. File hashes do not establish truth or make external evidence hosting permanent. Export manifests contain metadata, not file contents. Local files are separate per browser origin and are not included automatically in the distributable ZIP.

## Historical portable evidence package addition (0.4.0)

The new evidence ZIP export includes actual project-scoped files. It is separate from the metadata-only manifest and the application distribution ZIP. Import binds practice/chain mode, chain ID, project ID and immutable project fields. Local-chain bundles also bind scheduling fields to reduce accidental reuse after a node reset. This is not a digital signature or sender authentication. File commitments are compared against the currently loaded project; an uncommitted supplementary file is never labeled as matching a chain commitment.

ZIP STORE entries only are accepted. Before extraction, the parser validates directory/local headers, CRCs, counts, sizes, paths and contiguous non-overlapping ranges. It rejects encrypted/compressed archives, path traversal, duplicate entries and undeclared payloads. Limits are 100 files, 20 MiB per file, 100 MiB total and 101 MiB per package; manifests are capped at 128 KiB. Extracted files are hashed with Keccak-256. Processing runs in a terminable worker. Package inspection and cancellation do not write to the library; accepted files are saved in one IndexedDB transaction, with duplicate skipping and an origin-wide quota recheck inside that transaction. Storage failures abort the entire batch. Sharing requires no wallet transaction and includes no wallet credentials. The new dependency is pinned fflate 0.8.3. Contracts and their prior static-analysis findings are unchanged.

The portable server binds loopback only, checks Host/Origin, rejects non-GET/HEAD requests, confines static files using resolved/real paths, and exposes only dedicated status/startup-log endpoints. No keys, evidence bodies or request payloads are logged. Automatic port selection is sticky; a changed port does not migrate browser data. Local source/OS compromise is outside these controls.

## Governance and IPFS changes (0.5.0)

Read [GOVERNANCE.md](GOVERNANCE.md) for exact denominators, atomic 5% bond rules, single-hop delegation, Sybil and collusion analysis, and the implemented v3 treasury and ZK flows. Bond compensation and principal refunds have independent conservation/dust accounting. Bond funds never add voting weight. A malicious quorum can still falsely reject and capture a proportion of the bond; this is a disclosed incentive limitation, not solved fraud detection. Free test-token faucets remain Sybil-vulnerable.

IPFS retrieval is opt-in and bounded to 20 MiB, 25 seconds and allowlisted public gateways; it omits credentials and rejects redirects. CID parsing rejects traversal, user-supplied hosts and unsupported codecs/hashes. The browser verifies downloaded bytes against the selected chain commitment before showing a verified result. A gateway can withhold content but cannot substitute a different file without failing the hash check. Text is escaped and images are signature-sniffed; active documents are not executed. CID and hash do not establish truth, ownership, privacy or permanence.

Storage authorization is user initiated, lazy-loaded, held in memory and scoped to the provider's delegated account access. The user chooses an existing space and confirms public publication. No private API key is shipped. Provider email authorization, account quota, billing and service availability remain external dependencies; the adapter's authenticated upload is not claimed as live tested. A public-file copy may persist despite cancellation or removal. Encrypt private evidence before publication. V3 includes local authenticated file encryption and a separate private-measurement proof; neither hides public blockchain metadata.

CI uses read-only repository permissions and commit-pinned actions. Tests/builds require no deployment keys. Secret files stay ignored. A green local run is not represented as a hosted GitHub run. V3 features require a fresh factory; the current frontend still reads basic v2 campaigns, while v1 needs the old client. No user funds are migrated.
