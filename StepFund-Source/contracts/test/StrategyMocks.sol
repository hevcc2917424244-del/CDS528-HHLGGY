// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Intentionally controllable ONLY for tests, never exported or deployed by release scripts.
contract StrategyTestVault is ERC4626 {
    using SafeERC20 for IERC20;
    bool public blocked;
    address public callback;
    bytes public payload;
    bool public callbackSucceeded;
    constructor(IERC20 token) ERC20("Test only", "TEST") ERC4626(token) {}
    function _decimalsOffset() internal pure override returns (uint8) { return 6; }
    function setBlocked(bool value) external { blocked = value; }
    function setCallback(address target, bytes calldata data) external { callback = target; payload = data; }
    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        super._deposit(caller, receiver, assets, shares);
        if (callback != address(0)) (callbackSucceeded,) = callback.call(payload);
    }
    function simulateLoss(uint256 value) external { IERC20(asset()).safeTransfer(address(0xdead), value); }
    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares) internal override {
        require(!blocked, "Test liquidity outage");
        if (callback != address(0)) (callbackSucceeded,) = callback.call(payload);
        super._withdraw(caller, receiver, owner, assets, shares);
    }
}
contract AaveTestAToken is ERC20 {
    using SafeERC20 for IERC20;
    address public immutable UNDERLYING_ASSET_ADDRESS;
    address public immutable POOL;
    constructor(address underlying) ERC20("Test aToken", "aTEST") { UNDERLYING_ASSET_ADDRESS = underlying; POOL = msg.sender; }
    function mint(address to, uint256 n) external { require(msg.sender == POOL); _mint(to, n); }
    function redeem(address from, address to, uint256 n) external { require(msg.sender == POOL); _burn(from, n); IERC20(UNDERLYING_ASSET_ADDRESS).safeTransfer(to, n); }
}
contract AaveTestPool {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    AaveTestAToken public immutable aToken;
    bool public blocked;
    constructor(IERC20 token_) { token = token_; aToken = new AaveTestAToken(address(token_)); }
    function setBlocked(bool value) external { blocked = value; }
    function supply(address asset, uint256 n, address to, uint16) external {
        require(asset == address(token)); token.safeTransferFrom(msg.sender, address(aToken), n); aToken.mint(to, n);
    }
    function withdraw(address asset, uint256 n, address to) external returns (uint256) {
        require(!blocked && asset == address(token)); aToken.redeem(msg.sender, to, n); return n;
    }
    function fundedReward(address to, uint256 n) external { token.safeTransferFrom(msg.sender, address(aToken), n); aToken.mint(to, n); }
}
