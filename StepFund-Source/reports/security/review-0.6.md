# StepFund 0.6.0 static-analysis review

Date: 2026-10-03. Scope: fresh, non-instrumented Solidity 0.8.30 build. Slither 0.11.6; dependencies and test-only contracts filtered out. Raw evidence: `slither-0.6.0-clean.json`. No detector was disabled. The `--fail-medium` command exits nonzero. This is developer triage, not an independent audit or a zero-findings scan.

## Raw counts

{
  "High": 18,
  "Medium": 3,
  "Low": 16,
  "Informational": 106,
  "Optimization": 1
}

## High / medium findings and disposition

| Detector | Count | Review and evidence | Remaining boundary |
| --- | ---: | --- | --- |
| incorrect-return | 14 high | Generated snarkjs PLONK assembly intentionally aborts the entire verifier with a 32-byte false return when a field, point or precompile check fails. The return value at memory 0 is set to zero before these exits. Keep the upstream template intact. Real valid and tampered proofs are exercised in `test/StepFund.advanced.cjs`. | Tests sample verifier inputs; this review is not a cryptographic audit of snarkjs or its setup. |
| reentrancy-balance | 4 high | Campaign deposits/redemptions intentionally compare pre/post balances and shares; exact deltas reject unsupported transfers. All public campaign mutators that can act after initialization are nonReentrant; principal effects precede the vault call. Aave `_deposit` and `_withdraw` are also guarded, with exact shortfall withdrawal and normal ERC4626 accounting. The hostile-vault callback test attempts nested finalization during deposit and redemption and verifies conserved principal. | Arbitrary selected vaults, hostile/rebasing assets and malicious/upgraded pools are not rendered trustworthy by these guards. External views may observe intermediate values during callbacks. |
| incorrect-equality | 2 medium | Raised funds are integer micro-units bounded by the exact goal, so equality is required before activation; any strategy loss cancels activation. Aave's exact returned shortfall is required to settle fixed liabilities. These are accounting checks, not timestamp or arbitrary address-balance equality. | External reserve behavior must match the supported non-rebasing underlying assumptions. |
| reentrancy-no-eth | 1 medium | `finalizeFunding` changes status after successful redemption. It and all other live campaign mutation entry points are guarded; a failed external call reverts the entire transaction. Read-only views remain callable during a callback. | Do not use callback-time campaign views as a composable price/accounting oracle. No such integration is provided or tested. |

## Lower-severity records

The raw JSON retains timestamp, shadowing, assembly, naming, constant and related informational records. Deadline comparisons are intentional and tested; generated verifier assembly is retained unchanged. No finding count is silently reclassified or removed. Historical 0.5 scans and intermediate 0.6 scans are not evidence that the current source has zero high/medium findings.

## Validation and deployment limits

Normal Hardhat run: 57 passing, including real PLONK proof verification, liquidity failure, loss accounting and hostile vault callbacks. Coverage excludes generated verifier assembly only from instrumentation, not from functional proof tests. Aave tests use an explicitly simulated pool; authenticated storage uploads, real wallet consent, GitHub-hosted CI and public Sepolia/Aave operations remain recipient validation. Use the supplied release guide before claiming any public deployment result. No real-money readiness claim is made.
