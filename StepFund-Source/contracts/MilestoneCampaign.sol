// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

interface IAcceptanceVerifier {
    function verifyProof(uint256[24] calldata proof, uint256[4] calldata signals) external view returns (bool);
}

/// @notice Immutable milestone escrow. Only new contributions can be paused.
contract MilestoneCampaign is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    enum Status { Funding, Active, Refunding, Completed }
    enum StageStatus { Pending, Voting, Approved, Rejected }
    struct Stage {
        string title;
        uint256 budget;
        uint256 due;
        StageStatus state;
        string evidenceURI;
        bytes32 evidenceHash;
        uint256 votingEnds;
        uint256 yes;
        uint256 no;
    }

    /// @notice Creation parameters bundled into a single struct. The factory forwards one tuple
    ///         instead of eight separate arguments: with the legacy (non via-IR) Solidity codegen
    ///         five dynamic parameters alone occupy ten stack slots, which left no room for the
    ///         deployment itself. Keeping the payload as a struct brings the frame back to a few
    ///         slots, so the project compiles in plain Remix as well as with via-IR.
    struct CreateRequest {
        string title;
        string summary;
        uint8 category;
        uint256 fundingEnds;
        uint256 votingPeriod;
        string[] names;
        uint256[] budgets;
        uint256[] dues;
    }

    IERC20 public immutable asset;
    address public immutable creator;
    uint256 public immutable fundingEnds;
    uint256 public immutable votingPeriod;
    uint256 public immutable goal;
    uint256 public constant APPROVAL_PERCENT = 60;
    uint256 public constant QUORUM_PERCENT = 70;
    uint256 public constant BOND_PERCENT = 5;
    address private immutable factory;
    uint256 public immutable bondRequired;
    bool public bondFunded;
    uint256 public bondLocked;
    uint256 public bondCredit;
    uint256 public bondReturned;
    uint256 public bondRefundPool;
    uint256 public bondDistributed;
    uint256 public constant MAX_GOAL = 1_000_000 * 1e6;
    string public title;
    string public summary;
    uint8 public immutable category;
    uint256 public immutable createdAt;
    Status public status;
    Stage[] private stages;
    uint256 public currentStage;
    uint256 public totalRaised;
    uint256 public released;
    uint256 public creatorCredit;
    uint256 public withdrawn;
    uint256 public refundPool;
    uint256 public totalRefunded;
    uint256 public contributorCount;
    uint256 public refundClaimCount;
    mapping(address => uint256) public contributions;
    mapping(address => uint256) public refunds;
    mapping(address => bool) public refundClaimed;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(address => address)) public delegates;
    mapping(uint256 => mapping(address => uint256)) public delegatedWeight;

    struct AdvancedConfig {
        address vault;
        address verifier;
        address assessor;
        uint64[] minimums;
        uint64[] maximums;
    }
    IERC4626 public treasuryVault;
    uint256 public treasuryPrincipal;
    uint256 public treasuryLoss;
    uint256 public yieldPool;
    uint256 public yieldDistributed;
    uint256 public yieldClaimCount;
    uint256 public rescueShares;
    uint256 public sharesDistributed;
    mapping(address => bool) public yieldClaimed;
    address public verifier;
    address public assessor;
    uint64[] public minimums;
    uint64[] public maximums;
    mapping(uint256 => uint256) public acceptedCommitment;
    mapping(uint256 => bytes32) public acceptedDigest;
    mapping(uint256 => bool) public privacyVerified;
    uint256 public constant FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 public constant TREASURY_PERCENT = 20;
    uint256 public constant RESCUE_DELAY = 7 days;

    error Unauthorized();
    error InvalidConfig();
    error WrongState();
    error InvalidAmount();
    error TooEarly();
    error Expired();
    error AlreadyVoted();
    error NotContributor();
    error NothingToClaim();
    error InvalidEvidence();
    error UnsupportedToken();
    error InvalidDelegate();
    error InvalidProof();

    event Contributed(address indexed account, uint256 amount);
    event FundingFinalized(Status status);
    event EvidenceSubmitted(uint256 indexed stage, string uri, bytes32 digest, uint256 votingEnds);
    event Voted(uint256 indexed stage, address indexed account, bool support, uint256 weight);
    event StageSettled(uint256 indexed stage, bool approved, uint256 amount);
    event RefundsOpened(uint256 pool);
    event Refunded(address indexed account, uint256 amount);
    event CreatorWithdrawn(uint256 amount);
    event BondFunded(uint256 amount);
    event BondResolved(bool slashed, uint256 amount);
    event BondWithdrawn(uint256 amount);
    event BondCompensated(address indexed account, uint256 amount);
    event DelegateChanged(uint256 indexed stage, address indexed account, address indexed delegate);
    event TreasuryInvested(uint256 principal, uint256 shares);
    event TreasuryClosed(uint256 recovered, uint256 loss, uint256 yield);
    event StrategyRescued(uint256 liquidRefunds, uint256 shares);
    event YieldClaimed(address indexed account, uint256 amount, uint256 shares);
    event PrivateAttested(uint256 indexed stage, uint256 commitment, bytes32 digest);
    event PrivateVerified(uint256 indexed stage, uint256 commitment);

    constructor(CreateRequest memory r, address token_, address creator_, address factory_) {
        if (token_ == address(0) || creator_ == address(0) || bytes(r.title).length == 0 || bytes(r.title).length > 120 ||
            bytes(r.summary).length == 0 || bytes(r.summary).length > 1200 || r.category > 2 ||
            r.fundingEnds <= block.timestamp || r.fundingEnds > block.timestamp + 90 days ||
            r.votingPeriod < 1 hours || r.votingPeriod > 14 days ||
            r.names.length == 0 || r.names.length > 8 || r.names.length != r.budgets.length || r.names.length != r.dues.length) revert InvalidConfig();
        uint256 sum = 0;
        uint256 lastDue = r.fundingEnds;
        for (uint256 i; i < r.names.length; ++i) {
            if (bytes(r.names[i]).length == 0 || bytes(r.names[i]).length > 120 || r.budgets[i] == 0 ||
                r.dues[i] < lastDue + r.votingPeriod + 1 hours || r.dues[i] > block.timestamp + 730 days) revert InvalidConfig();
            sum += r.budgets[i];
            stages.push(Stage(r.names[i], r.budgets[i], r.dues[i], StageStatus.Pending, "", bytes32(0), 0, 0, 0));
            lastDue = r.dues[i];
        }
        if (sum > MAX_GOAL) revert InvalidConfig();
        asset = IERC20(token_); creator = creator_; title = r.title; summary = r.summary; category = r.category;
        fundingEnds = r.fundingEnds; votingPeriod = r.votingPeriod; goal = sum; createdAt = block.timestamp;
        factory = factory_;
        bondRequired = Math.mulDiv(sum, BOND_PERCENT, 100, Math.Rounding.Ceil);
    }

    /// @dev The factory funds the bond and initializes it atomically before registering this campaign.
    function initializeBond() external {
        if (msg.sender != factory) revert Unauthorized();
        if (bondFunded) revert WrongState();
        if (asset.balanceOf(address(this)) < bondRequired) revert InvalidAmount();
        bondFunded = true; bondLocked = bondRequired;
        emit BondFunded(bondRequired);
    }

    function getStages() external view returns (Stage[] memory) { return stages; }
    function stageCount() external view returns (uint256) { return stages.length; }

    /// @dev Atomic factory initialization, before the first contribution.
    function configureAdvanced(AdvancedConfig calldata c) external {
        if (msg.sender != factory || bondFunded) revert Unauthorized();
        if (c.vault != address(0)) {
            if (c.vault.code.length == 0 || IERC4626(c.vault).asset() != address(asset)) revert InvalidConfig();
            treasuryVault = IERC4626(c.vault);
        }
        if (c.verifier != address(0)) {
            if (c.verifier.code.length == 0 || c.assessor == address(0) || c.assessor == creator ||
                c.minimums.length != stages.length || c.maximums.length != stages.length) revert InvalidConfig();
            for (uint256 i; i < stages.length; ++i) if (c.minimums[i] > c.maximums[i]) revert InvalidConfig();
            verifier = c.verifier; assessor = c.assessor; minimums = c.minimums; maximums = c.maximums;
        } else if (c.assessor != address(0) || c.minimums.length != 0 || c.maximums.length != 0) revert InvalidConfig();
    }

    /// @notice Permissionless, opted in at creation, at most 20% of raised principal.
    /// Bonds are excluded. Slippage protection also protects against donation attacks.
    function investTreasury(uint256 amount, uint256 minShares) external nonReentrant whenNotPaused {
        if (status != Status.Funding || block.timestamp >= fundingEnds || address(treasuryVault) == address(0)) revert WrongState();
        if (amount == 0 || minShares == 0 || amount + treasuryPrincipal > totalRaised * TREASURY_PERCENT / 100) revert InvalidAmount();
        uint256 beforeBalance = asset.balanceOf(address(this));
        uint256 beforeShares = treasuryVault.balanceOf(address(this));
        treasuryPrincipal += amount;
        asset.forceApprove(address(treasuryVault), amount);
        uint256 shares = treasuryVault.deposit(amount, address(this));
        asset.forceApprove(address(treasuryVault), 0);
        if (shares < minShares || treasuryVault.balanceOf(address(this)) - beforeShares != shares ||
            beforeBalance - asset.balanceOf(address(this)) != amount) revert UnsupportedToken();
        emit TreasuryInvested(amount, shares);
    }

    function _closeTreasury() private {
        uint256 principal = treasuryPrincipal;
        if (principal == 0) return;
        treasuryPrincipal = 0;
        uint256 beforeBalance = asset.balanceOf(address(this));
        uint256 reported = treasuryVault.redeem(treasuryVault.balanceOf(address(this)), address(this), address(this));
        uint256 recovered = asset.balanceOf(address(this)) - beforeBalance;
        if (reported != recovered) revert UnsupportedToken();
        if (recovered >= principal) yieldPool = recovered - principal;
        else treasuryLoss = principal - recovered;
        emit TreasuryClosed(recovered, treasuryLoss, yieldPool);
    }

    /// @notice After a seven-day liquidity outage anyone can cancel funding.
    /// Liquid principal is refunded; vault shares are distributed in kind so
    /// contributors can redeem individually when the external vault recovers.
    function rescueTreasury() external nonReentrant {
        if (status != Status.Funding || treasuryPrincipal == 0) revert WrongState();
        if (block.timestamp < fundingEnds + RESCUE_DELAY) revert TooEarly();
        treasuryLoss = treasuryPrincipal; treasuryPrincipal = 0;
        rescueShares = treasuryVault.balanceOf(address(this));
        _openRefunds(false);
        emit StrategyRescued(refundPool, rescueShares);
    }

    function claimableYield(address account) public view returns (uint256 reward, uint256 shares) {
        if (status == Status.Funding || yieldClaimed[account] || contributions[account] == 0) return (0, 0);
        if (yieldClaimCount + 1 == contributorCount) return (yieldPool - yieldDistributed, rescueShares - sharesDistributed);
        return (Math.mulDiv(contributions[account], yieldPool, totalRaised), Math.mulDiv(contributions[account], rescueShares, totalRaised));
    }

    function claimYield() external nonReentrant {
        if (status == Status.Funding || yieldClaimed[msg.sender] || contributions[msg.sender] == 0) revert NothingToClaim();
        (uint256 reward, uint256 shares) = claimableYield(msg.sender);
        yieldClaimed[msg.sender] = true; ++yieldClaimCount;
        yieldDistributed += reward; sharesDistributed += shares;
        if (reward != 0) asset.safeTransfer(msg.sender, reward);
        if (shares != 0) IERC20(address(treasuryVault)).safeTransfer(msg.sender, shares);
        emit YieldClaimed(msg.sender, reward, shares);
    }

    function privacyContext(uint256 stage, bytes32 digest) public view returns (uint256) {
        return uint256(keccak256(abi.encode("StepFund.Acceptance.v1", block.chainid, address(this), stage, digest))) % FIELD;
    }

    function attestPrivate(uint256 stage, uint256 commitment, bytes32 digest) external nonReentrant {
        if (msg.sender != assessor || verifier == address(0)) revert Unauthorized();
        if (status != Status.Active || stage != currentStage || stages[stage].state != StageStatus.Pending) revert WrongState();
        if (block.timestamp >= stages[stage].due) revert Expired();
        if (commitment == 0 || commitment >= FIELD || digest == bytes32(0)) revert InvalidProof();
        acceptedCommitment[stage] = commitment; acceptedDigest[stage] = digest;
        emit PrivateAttested(stage, commitment, digest);
    }

    function submitPrivateEvidence(string calldata uri, bytes32 digest, uint256[24] calldata proof, uint256[4] calldata signals) external nonReentrant {
        if (msg.sender != creator) revert Unauthorized();
        if (status != Status.Active || verifier == address(0) || currentStage >= stages.length) revert WrongState();
        if (acceptedCommitment[currentStage] == 0 || signals[0] != acceptedCommitment[currentStage] ||
            digest != acceptedDigest[currentStage] || signals[1] != minimums[currentStage] || signals[2] != maximums[currentStage] ||
            signals[3] != privacyContext(currentStage, digest)) revert InvalidProof();
        if (!IAcceptanceVerifier(verifier).verifyProof(proof, signals)) revert InvalidProof();
        privacyVerified[currentStage] = true;
        emit PrivateVerified(currentStage, signals[0]);
        _submitEvidence(uri, digest);
    }

    function contribute(uint256 amount) external nonReentrant whenNotPaused {
        if (status != Status.Funding || !bondFunded) revert WrongState();
        if (block.timestamp >= fundingEnds) revert Expired();
        if (amount == 0 || amount > goal - totalRaised) revert InvalidAmount();
        uint256 beforeBalance = asset.balanceOf(address(this));
        if (contributions[msg.sender] == 0) ++contributorCount;
        contributions[msg.sender] += amount;
        address delegate = delegates[0][msg.sender];
        if (delegate != address(0)) delegatedWeight[0][delegate] += amount;
        totalRaised += amount;
        asset.safeTransferFrom(msg.sender, address(this), amount);
        if (asset.balanceOf(address(this)) - beforeBalance != amount) revert UnsupportedToken();
        emit Contributed(msg.sender, amount);
    }

    /// @dev Permissionless to prevent reliance on creator availability.
    function finalizeFunding() external nonReentrant {
        if (status != Status.Funding || !bondFunded) revert WrongState();
        if (totalRaised < goal && block.timestamp < fundingEnds) revert TooEarly();
        _closeTreasury();
        if (totalRaised == goal && treasuryLoss == 0) status = Status.Active;
        else _openRefunds(false);
        emit FundingFinalized(status);
    }

    function submitEvidence(string calldata uri, bytes32 digest) external nonReentrant {
        if (verifier != address(0)) revert InvalidProof();
        _submitEvidence(uri, digest);
    }

    function _submitEvidence(string calldata uri, bytes32 digest) private {
        if (msg.sender != creator) revert Unauthorized();
        if (status != Status.Active) revert WrongState();
        Stage storage s = stages[currentStage];
        if (s.state != StageStatus.Pending) revert WrongState();
        if (block.timestamp >= s.due) revert Expired();
        bytes calldata u = bytes(uri);
        if (u.length < 8 || u.length > 500 || digest == bytes32(0)) revert InvalidEvidence();
        bytes7 prefix = bytes7(u[:7]);
        if (prefix != bytes7("ipfs://") && !(u.length >= 9 && bytes8(u[:8]) == bytes8("https://"))) revert InvalidEvidence();
        s.evidenceURI = uri; s.evidenceHash = digest; s.votingEnds = block.timestamp + votingPeriod; s.state = StageStatus.Voting;
        emit EvidenceSubmitted(currentStage, uri, digest, s.votingEnds);
    }

    function vote(bool support) external nonReentrant {
        if (status != Status.Active) revert WrongState();
        Stage storage s = stages[currentStage];
        if (s.state != StageStatus.Voting) revert WrongState();
        if (block.timestamp >= s.votingEnds) revert Expired();
        uint256 weight = votingWeight(currentStage, msg.sender);
        if (weight == 0) revert NotContributor();
        if (hasVoted[currentStage][msg.sender]) revert AlreadyVoted();
        hasVoted[currentStage][msg.sender] = true;
        if (support) s.yes += weight; else s.no += weight;
        emit Voted(currentStage, msg.sender, support, weight);
    }

    function settleStage() external nonReentrant {
        if (status != Status.Active) revert WrongState();
        Stage storage s = stages[currentStage];
        if (s.state != StageStatus.Voting) revert WrongState();
        if (block.timestamp < s.votingEnds) revert TooEarly();
        // Total stake is bounded by MAX_GOAL, so multiplication cannot overflow.
        bool quorum = (s.yes + s.no) * 100 >= totalRaised * QUORUM_PERCENT;
        bool approved = quorum && s.yes * 100 >= totalRaised * APPROVAL_PERCENT;
        if (approved) {
            s.state = StageStatus.Approved; released += s.budget; creatorCredit += s.budget;
            emit StageSettled(currentStage, true, s.budget);
            ++currentStage;
            if (currentStage >= stages.length) { status = Status.Completed; _resolveBond(false); }
        } else {
            s.state = StageStatus.Rejected;
            emit StageSettled(currentStage, false, 0);
            // Abstention alone must not confiscate the creator's bond.
            _openRefunds(quorum);
        }
    }

    function expireStage() external nonReentrant {
        if (status != Status.Active) revert WrongState();
        Stage storage s = stages[currentStage];
        if (s.state != StageStatus.Pending) revert WrongState();
        if (block.timestamp < s.due) revert TooEarly();
        s.state = StageStatus.Rejected;
        _openRefunds(true);
    }

    function _resolveBond(bool slash) private {
        uint256 value = bondLocked;
        bondLocked = 0;
        if (slash) bondRefundPool = value; else bondCredit = value;
        emit BondResolved(slash, value);
    }

    function _openRefunds(bool slash) private {
        status = Status.Refunding; refundPool = totalRaised - released - treasuryLoss;
        _resolveBond(slash);
        emit RefundsOpened(refundPool);
    }

    /// @notice Single-hop, stage-specific delegation. No re-delegation, chains or cycles.
    /// @dev Contributions are locked before voting; delegation is frozen when evidence opens the vote.
    function delegateVote(address recipient) external nonReentrant {
        if (status != Status.Funding && status != Status.Active) revert WrongState();
        Stage storage s = stages[currentStage];
        if (s.state != StageStatus.Pending) revert WrongState();
        if (block.timestamp >= s.due) revert Expired();
        uint256 weight = contributions[msg.sender];
        if (weight == 0) revert NotContributor();
        if (recipient == msg.sender || delegatedWeight[currentStage][msg.sender] != 0 ||
            (recipient != address(0) && delegates[currentStage][recipient] != address(0))) revert InvalidDelegate();
        address previous = delegates[currentStage][msg.sender];
        if (previous != address(0)) delegatedWeight[currentStage][previous] -= weight;
        delegates[currentStage][msg.sender] = recipient;
        if (recipient != address(0)) delegatedWeight[currentStage][recipient] += weight;
        emit DelegateChanged(currentStage, msg.sender, recipient);
    }

    function votingWeight(uint256 stage, address account) public view returns (uint256) {
        if (delegates[stage][account] != address(0)) return 0;
        return contributions[account] + delegatedWeight[stage][account];
    }

    function hasParticipated(uint256 stage, address account) external view returns (bool) {
        address delegate = delegates[stage][account];
        return hasVoted[stage][delegate == address(0) ? account : delegate];
    }

    function claimableRefund(address account) public view returns (uint256) {
        if (status != Status.Refunding || refundClaimed[account] || contributions[account] == 0) return 0;
        // The last contributor receives rounding dust, at most contributorCount - 1 base units.
        if (refundClaimCount + 1 == contributorCount) return refundPool - totalRefunded;
        return Math.mulDiv(contributions[account], refundPool, totalRaised);
    }

    function claimRefund() external nonReentrant {
        if (status != Status.Refunding) revert WrongState();
        if (contributions[msg.sender] == 0 || refundClaimed[msg.sender]) revert NothingToClaim();
        uint256 amount = claimableRefund(msg.sender);
        uint256 compensation = claimableBondShare(msg.sender);
        refundClaimed[msg.sender] = true; ++refundClaimCount;
        refunds[msg.sender] = amount; totalRefunded += amount;
        bondDistributed += compensation;
        // Zero-rounded claims must still advance the counter so the final claimant can receive dust.
        if (amount + compensation != 0) asset.safeTransfer(msg.sender, amount + compensation);
        emit Refunded(msg.sender, amount);
        emit BondCompensated(msg.sender, compensation);
    }

    function claimableBondShare(address account) public view returns (uint256) {
        if (status != Status.Refunding || refundClaimed[account] || contributions[account] == 0) return 0;
        if (refundClaimCount + 1 == contributorCount) return bondRefundPool - bondDistributed;
        return Math.mulDiv(contributions[account], bondRefundPool, totalRaised);
    }

    function withdrawBond() external nonReentrant {
        if (msg.sender != creator) revert Unauthorized();
        uint256 value = bondCredit;
        if (value == 0) revert NothingToClaim();
        bondCredit = 0; bondReturned += value;
        asset.safeTransfer(creator, value);
        emit BondWithdrawn(value);
    }

    function withdrawCreator() external nonReentrant {
        if (msg.sender != creator) revert Unauthorized();
        uint256 amount = creatorCredit;
        if (amount == 0) revert NothingToClaim();
        creatorCredit = 0; withdrawn += amount;
        asset.safeTransfer(creator, amount);
        emit CreatorWithdrawn(amount);
    }

    function setFundingPaused(bool value) external nonReentrant {
        if (msg.sender != creator) revert Unauthorized();
        if (status != Status.Funding) revert WrongState();
        if (value) _pause(); else _unpause();
    }
}
