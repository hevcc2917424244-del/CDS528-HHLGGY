// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {MilestoneCampaign} from "./MilestoneCampaign.sol";
import {CampaignDeployer} from "./CampaignDeployer.sol";
import {AcceptanceVerifier} from "./AcceptanceVerifier.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Each project has an independent immutable escrow. No admin or upgrade key.
/// @dev Two changes keep this contract buildable with the stock Remix compiler settings
///      (0.8.30, optimizer 200, evmVersion paris, no via-IR), which the project previously
///      required because of `viaIR: true` in hardhat.config:
///      1. creation arguments travel as one `CreateRequest` tuple instead of eight positional
///         parameters — five dynamic parameters alone occupy ten stack slots under the legacy
///         code generator, leaving no room for the deployment itself;
///      2. the campaign creation code lives in `CampaignDeployer`, because embedding it here
///         pushed the runtime past the 24,576-byte EIP-170 limit once via-IR was disabled.
contract StepFundFactory is ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 public constant protocolVersion = 3;
    address public immutable asset;
    address public immutable acceptanceVerifier;
    CampaignDeployer public immutable deployer;
    address[] private campaigns;
    mapping(address => bool) public isCampaign;
    error UnsupportedToken();
    event CampaignCreated(address indexed campaign, address indexed creator, string title);
    constructor(address asset_) {
        require(asset_ != address(0), "Zero asset"); asset = asset_;
        acceptanceVerifier = address(new AcceptanceVerifier());
        deployer = new CampaignDeployer();
    }
    function campaignCount() external view returns (uint256) { return campaigns.length; }
    function campaignAt(uint256 index) external view returns (address) { return campaigns[index]; }
    function createCampaign(MilestoneCampaign.CreateRequest calldata request)
        external nonReentrant returns (address campaign)
    {
        campaign = deployer.deploy(msg.data[4:], asset, msg.sender);
        _register(campaign, request.title);
    }
    function createAdvancedCampaign(MilestoneCampaign.CreateRequest calldata request,
        MilestoneCampaign.AdvancedConfig calldata config
    ) external nonReentrant returns (address campaign) {
        require(config.verifier == address(0) || config.verifier == acceptanceVerifier, "Untrusted verifier");
        // `msg.data[4:]` is the encoded `request` tuple; the trailing config stays in place.
        campaign = deployer.deploy(msg.data[4:], asset, msg.sender);
        MilestoneCampaign(campaign).configureAdvanced(config);
        _register(campaign, request.title);
    }
    function _register(address campaign, string calldata title) private {
        // Effects before token callbacks; a later failure reverts the entire registration.
        campaigns.push(campaign); isCampaign[campaign] = true;
        uint256 bond = MilestoneCampaign(campaign).bondRequired();
        uint256 beforeBalance = IERC20(asset).balanceOf(campaign);
        IERC20(asset).safeTransferFrom(msg.sender, campaign, bond);
        if (IERC20(asset).balanceOf(campaign) - beforeBalance != bond) revert UnsupportedToken();
        MilestoneCampaign(campaign).initializeBond();
        emit CampaignCreated(campaign, msg.sender, title);
    }
}
