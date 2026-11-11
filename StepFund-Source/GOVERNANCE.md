# Governance, evidence and extension design — version 0.5

## Implemented decision rule

Let `T` be the sum of recorded contributions at activation, `Y` the yes weight and `N` the no weight. A milestone passes only when both `100Y >= 60T` and `100(Y+N) >= 70T`. Both denominators are **all contributed principal**, not the votes cast or the number of wallets. Voting remains open for its entire configured duration and settlement is permissionless afterward.

For a 1,000 tUSD campaign:

| Yes | No | Abstain | Result | Bond |
| ---: | ---: | ---: | --- | --- |
| 600 | 100 | 300 | Pass, exactly both thresholds | Remains locked until final milestone |
| 600 | 0 | 400 | Fail: insufficient participation | Returnable to creator |
| 599 | 101 | 300 | Fail: insufficient approval at quorum | Distributed to contributors |
| 0 | 0 | 1,000 | Fail: no participation | Returnable to creator |

Using a quorum at or below 60% would add no effective condition to a 60%-of-total approval rule. The chosen 70% threshold adds an independent participation requirement, with the tradeoff that abstention can terminate a legitimate project. These are immutable prototype policy parameters, not experimentally proven optimal settings.

## Creator bond and exact accounting

The creator separately deposits `ceil(goal * 5 / 100)` base units when creating a project. The factory deploys, transfers the exact bond, initializes the escrow and registers it in one atomic transaction. A failed transfer leaves no registered campaign. The bond is neither a contribution nor voting weight and cannot satisfy the funding goal.

- Failed fundraising, full completion, or a vote with insufficient participation makes the remaining bond withdrawable by its creator.
- Missing an evidence deadline, or failing approval **with quorum**, transfers the entire bond to a contributor compensation pool.
- No-quorum failure does not slash: abstention alone should not transfer the creator's property to abstainers.
- Principal refunds and bond compensation are tracked separately. One claim transfers both entitlements; each pool uses pro-rata integer division, with the last claimant receiving its remaining dust. Previously approved milestone principal cannot be clawed back.

Ignoring unsolicited transfers, the on-chain balance must equal:

`totalRaised - withdrawn - totalRefunded + bondRequired - bondReturned - bondDistributed`

The principal chart excludes bonds. Each project displays locked, returnable, returned, remaining-compensation and paid-compensation bond amounts. Refunds and bond withdrawals have no expiry. There is no administrator sweep or upgrade authority.

## Delegation

Contributors can delegate their full weight to one address or revoke before the current milestone's vote opens. Recipients may be independent reviewers with no contribution of their own. Delegation is single-hop: self-delegation, cycles, delegation to an outgoing delegator and re-delegation of incoming weight are rejected. Additional contributions before activation update the incoming weight. Original principal is locked at activation; submission of evidence freezes that stage's delegation. No per-voter snapshot loop is required.

The delegate votes once with its own plus incoming weight. A delegator cannot additionally vote. The next milestone begins with no delegation; contributors must opt in again. The creator cannot set delegation for contributors. Refund ownership remains with the original contributor. There is no partial or transitive delegation and no last-minute override after a vote opens. A delegate can abstain or vote against a delegator's preference; the app does not guarantee faithful representation.

## Sybil attacks, collusion and incentives

Splitting a fixed contribution across addresses does not increase its summed voting weight. The test suite checks this conservation property. It is **not identity-based Sybil resistance**: TestUSD's free per-address faucet is deliberately Sybil-vulnerable, and an attacker can obtain more test tokens with more wallets. A real-value version would require a separately reviewed asset model, economic assumptions and possibly privacy-conscious membership attestations.

Colluding funders can approve fabricated evidence. With 70% of stake they can satisfy both conditions without anyone else; 60% yes can pass if other voters supply the additional participation. More than 30% withholding participation can block quorum. More than 40% voting no can prevent a 60% approval even if everyone participates. Delegation concentrates power and can make bribery or key compromise more damaging.

The bond increases the creator's stake in timely delivery but does not prevent false rejection or vote buying. Malicious reviewers who force a rejection with quorum receive their proportional share of the slashed bond; therefore the rule itself creates an extortion incentive. If a creator self-funds, it also recovers that fraction of any slashed bond. A 5% bond is not adequate insurance for already approved budgets. These limits must be disclosed in a demonstration or subsequent report.

Possible further defenses include a challenge window, independently selected reviewers, conflict-of-interest disclosures, bounded reward/slashing economics and private voting designed with coercion resistance. Each introduces new trust, liveness, privacy or cost tradeoffs. None is silently claimed as implemented. Wallet-count voting, a CAPTCHA or a larger threshold alone would not solve identity or collusion.

## File-to-chain evidence loop

1. Save the actual file locally and compute its Keccak-256 digest.
2. Explicitly authorize a session with an existing Storacha account and provisioned space, then confirm publication. The SDK uploads the bytes and returns an IPFS CID. Alternatively, use another provider and enter its `ipfs://` URI.
3. Insert the CID URI and file digest into the evidence form; the creator separately submits the wallet transaction.
4. A reviewer loads that committed URI, chooses a gateway, downloads at most 20 MiB and independently recomputes the digest. Only matching bytes enter the verified preview. A mismatch, timeout or inaccessible gateway never counts as verification.

CID addressing and the application Keccak commitment are different checks. The browser trusts a gateway for availability, but rejects bytes that fail the chain commitment. IPFS content is public unless separately encrypted, and availability is not guaranteed by a CID. Upload acceptance, gateway verification and chain submission have distinct UI states. PNG/JPEG/GIF and escaped text preview inline; PDF/Office/HTML/SVG use download/external viewing. Encrypted ciphertext can be public while the file contents remain private; PDF/Office/HTML/SVG remain download-only.

The SDK uses a session-only memory store. It does not bundle an API secret, automatically buy a subscription or create a paid storage plan. Public data can remain available after removal. The provider's live authenticated upload flow still requires an actual provisioned account; mocked retrieval tests do not prove provider availability. NFT.Storage Classic no longer accepts new uploads; the legacy Storacha documentation domain currently redirects to another service. The integration follows the published SDK and must be tested against the user's authorized space before claiming a live deployment.

## Treasury rules implemented in v3

At creation, the creator may opt into an ERC4626 vault whose underlying equals the project's asset. Every contributor can inspect the immutable vault address before contributing. Permissionless deposits are capped at 20% of raised principal; bonds are not invested. Exact balance/share changes and nonzero minimum received shares are checked, and the allowance is cleared after deposit. A malicious or upgradeable chosen vault remains an external trust risk and can lose up to the invested principal. Review the actual vault deployment, not only its advertised name.

`finalizeFunding` redeems all held vault shares before activating or opening refunds. Realized yield belongs to contributors, allocated by original contribution with final-claimant rounding dust, independent of stage payments. A shortfall cancels activation and proportionally refunds liquid/recovered principal; the bond is returned because a strategy loss is not a proven creator delivery failure. If redemption reverts, the entire finalization reverts. Seven days after the funding deadline, `rescueTreasury` can cancel funding and distribute the liquid principal plus the vault shares in kind. Contributors claim refunds and shares separately; later share redemption is still subject to external liquidity. No claim has an expiry.

Cash accounting (excluding direct donations):

`raised - withdrawn - refunded - treasuryPrincipal - treasuryLoss + bondRequired - bondReturned - bondDistributed + yieldPool - yieldDistributed`.

On a rescue, `treasuryLoss` is the principal removed from the cash ledger and exchanged for rescue shares, not an asserted final market loss. The UI labels it accordingly. The share ledger is separate. Principal, rewards and bond claims preserve their own dust counters and cannot be claimed twice.

ResearchVault is a testnet-only ERC4626 vault. Its rewards must be transferred in by an external sponsor; there is no invented APY or market lending claim. AaveV3Vault is an ownerless, unleveraged adapter that calls Aave V3 `supply` and `withdraw`, checks aToken underlying/pool identity, accounts for rebasing aToken balances and idle assets, and uses virtual shares. Aave pause, reserve losses, asset depegging, liquidity outages and upstream proxy upgrades remain risks. Tests exercise an explicitly mocked Aave pool; this is not a public fork or live Aave integration result. The recipient must select official Sepolia reserve addresses and run the release acceptance steps. Custom TestUSD is unsupported by Aave.

## Private acceptance implemented in v3

The factory creates and pins the generated PLONK verifier. The creator chooses a different assessor address and immutable inclusive unsigned 64-bit measurement ranges. The UI applies one agreed range to all milestones; the contract supports per-stage ranges. State that metric and its units in the project description.

The assessor reviews the actual private evidence off chain and submits its Poseidon commitment and ciphertext/file digest. The creator generates a real PLONK proof locally. Public signals are `[commitment, minimum, maximum, context]`; the two witness inputs are measurement and salt. Context is `keccak256(abi.encode("StepFund.Acceptance.v1", chainId, campaign, stage, digest)) mod BN254_scalar_field`. Poseidon binds the measurement and salt to that context. The contract compares all signals to the recorded terms and assessor commitment, verifies the proof, and opens the usual backer vote. Proof replay is blocked by both domain separation and the stage state machine; there is no separate anonymous-voter or nullifier system.

PLONK uses the published multi-party Powers of Tau transcript and no new project-specific ceremony. The download script checks its published BLAKE2b-512 hash. A reproducible source/asset manifest and real valid/tampered proof tests accompany the generated verifier. This is educational cryptographic integration, not an independent audit of the circuit or upstream libraries.

ZK hides only measurement and salt. It does not hide wallet addresses, contributions, votes, public bounds or the content-addressed file's existence. It cannot establish physical delivery, prevent a dishonest measurement, identify a natural person or stop assessor/creator collusion. An independent wallet is not proof of an independent human. An honest reviewer must inspect the underlying evidence; the bond and backer vote remain relevant.

Private evidence can be encrypted with local AES-256-GCM before uploading. The application hashes ciphertext, authenticates it against the chain digest before decrypting, and safely previews only raster/text formats. The 256-bit file key, measurement and salt live in component memory, not browser persistent storage. The user must save and privately transmit them; losing the key is unrecoverable. Neither automatic key escrow nor multi-recipient access revocation is claimed.

## Primary references

- [OpenZeppelin governance interfaces and delegation](https://docs.openzeppelin.com/contracts/5.x/api/governance) — design reference; StepFund implements its own bounded contribution ledger rather than claiming ERC20Votes compatibility.
- [IPFS addressing on the web](https://docs.ipfs.tech/how-to/address-ipfs-on-web/) — CID addressing and gateway origins.
- [Storacha client source and API guide](https://github.com/storacha/upload-service/blob/main/packages/w3up-client/README.md) — uploadFile and account authorization.
- [NFT.Storage Classic service status](https://nft.storage/nft-storage-classic) — upload decommissioning.
- [Ethereum zero-knowledge proof overview](https://ethereum.org/zero-knowledge-proofs/) — proof properties and their limits.

Treasury and private-acceptance code are implemented and locally tested. Public deployment and authorized storage upload remain recipient acceptance steps. AI assistance is disclosed in README.md.

- [Aave V3 Pool API](https://aave.com/docs/aave-v3/smart-contracts/pool)
- [snarkjs source and Powers of Tau table](https://github.com/iden3/snarkjs)
- [OpenZeppelin ERC4626](https://docs.openzeppelin.com/contracts/5.x/erc4626)
