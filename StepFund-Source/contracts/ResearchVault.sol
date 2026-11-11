// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Testnet-only ERC4626 integration vault. Yield is externally funded
/// rewards (transfers to this vault), never an advertised market rate.
/// No owner, minting privilege, withdrawal fee or investment strategy.
contract ResearchVault is ERC4626 {
    constructor(IERC20 asset_) ERC20("StepFund Research Vault", "sfRV") ERC4626(asset_) {
        require(block.chainid == 31337 || block.chainid == 11155111, "Testnets only");
    }
    function _decimalsOffset() internal pure override returns (uint8) { return 6; }
}
