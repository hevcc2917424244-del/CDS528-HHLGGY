// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {MilestoneCampaign} from "./MilestoneCampaign.sol";

/// @notice Holds the campaign creation code and performs the actual `CREATE`.
/// @dev `StepFundFactory` cannot embed `MilestoneCampaign`'s ~21 KB init code and still stay
///      under the EIP-170 24,576-byte runtime limit when the legacy code generator is used
///      (which is all Remix offers, since its compiler panel has no via-IR switch). Splitting
///      the deployment into this helper keeps both contracts comfortably deployable, and as a
///      side effect removes the factory's previously razor-thin size headroom.
///      The helper is created by the factory itself and rejects every other caller, so the
///      factory stays the single entry point and campaigns remain non-upgradeable.
contract CampaignDeployer {
    address public immutable factory;
    error Unauthorized();
    constructor() {
        factory = msg.sender;
    }
    /// @param payload ABI-encoded `MilestoneCampaign.CreateRequest` (the factory forwards
    ///        `msg.data[4:]` verbatim, so no re-encoding happens on the hot path).
    function deploy(bytes calldata payload, address token, address creator) external returns (address campaign) {
        if (msg.sender != factory) revert Unauthorized();
        MilestoneCampaign.CreateRequest memory r = abi.decode(payload, (MilestoneCampaign.CreateRequest));
        campaign = address(new MilestoneCampaign(r, token, creator, factory));
    }
}
