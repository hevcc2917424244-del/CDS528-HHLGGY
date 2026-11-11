// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test fixture only: configurable transfer fee and callback attempts.
contract HostileToken is ERC20 {
    bool public chargeFee;
    address public callbackTarget;
    bytes public callbackData;
    bool public callbackSucceeded;
    bytes4 public callbackError;
    bool private inside;
    constructor() ERC20("Hostile fixture", "EVIL") { _mint(msg.sender, 1_000_000); }
    function configure(bool fee, address target, bytes calldata data) external { chargeFee = fee; callbackTarget = target; callbackData = data; }
    function _update(address from, address to, uint256 value) internal override {
        if (chargeFee && from != address(0) && to != address(0) && value > 0) {
            super._update(from, address(0), 1);
            super._update(from, to, value - 1);
        } else super._update(from, to, value);
        if (!inside && callbackTarget != address(0)) {
            inside = true;
            (bool ok, bytes memory result) = callbackTarget.call(callbackData);
            callbackSucceeded = ok;
            callbackError = result.length >= 4 ? bytes4(result) : bytes4(0);
            inside = false;
        }
    }
}
