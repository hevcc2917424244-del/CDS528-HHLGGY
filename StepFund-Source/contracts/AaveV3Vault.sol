// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}
interface IAaveToken is IERC20 {
    function UNDERLYING_ASSET_ADDRESS() external view returns (address);
    function POOL() external view returns (address);
}

/// @notice Unleveraged, ownerless ERC4626 adapter. Aave liquidity and reserve
/// risk remain with depositors. Never deploy with StepFund's custom TestUSD:
/// the underlying must be a reserve actually supported by the selected pool.
contract AaveV3Vault is ERC4626, ReentrancyGuard {
    using SafeERC20 for IERC20;
    IAavePool public immutable pool;
    IAaveToken public immutable aToken;
    constructor(IERC20 asset_, IAavePool pool_, IAaveToken aToken_)
        ERC20("StepFund Aave Vault", "sfAV") ERC4626(asset_) {
        require(block.chainid == 31337 || block.chainid == 11155111, "Testnets only");
        require(address(pool_).code.length > 0 && address(aToken_).code.length > 0, "Missing pool");
        require(aToken_.UNDERLYING_ASSET_ADDRESS() == address(asset_) && aToken_.POOL() == address(pool_), "Reserve mismatch");
        pool = pool_; aToken = aToken_;
    }
    function totalAssets() public view override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this)) + aToken.balanceOf(address(this));
    }
    function _decimalsOffset() internal pure override returns (uint8) { return 6; }
    function maxWithdraw(address owner) public view override returns (uint256) {
        uint256 available = IERC20(asset()).balanceOf(address(this)) + IERC20(asset()).balanceOf(address(aToken));
        uint256 owned = super.maxWithdraw(owner);
        return owned < available ? owned : available;
    }
    function maxRedeem(address owner) public view override returns (uint256) {
        uint256 owned = balanceOf(owner);
        uint256 available = IERC20(asset()).balanceOf(address(this)) + IERC20(asset()).balanceOf(address(aToken));
        // Do not round assets -> shares twice: that can leave a solvent owner
        // unable to redeem their final shares after any positive yield.
        return previewRedeem(owned) <= available ? owned : convertToShares(available);
    }
    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override nonReentrant {
        super._deposit(caller, receiver, assets, shares);
        IERC20(asset()).forceApprove(address(pool), assets);
        pool.supply(asset(), assets, address(this), 0);
        IERC20(asset()).forceApprove(address(pool), 0);
    }
    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares) internal override nonReentrant {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        if (idle < assets) require(pool.withdraw(asset(), assets - idle, address(this)) == assets - idle, "Short withdrawal");
        super._withdraw(caller, receiver, owner, assets, shares);
    }
}
