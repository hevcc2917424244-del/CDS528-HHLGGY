// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Valueless classroom token. Faucet is deliberately permissionless.
contract TestUSD is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 1_000 * 1e6;
    mapping(address => uint256) public nextFaucet;
    error FaucetCooldown(uint256 availableAt);
    constructor() ERC20("StepFund Test USD", "tUSD") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function faucet() external {
        if (block.timestamp < nextFaucet[msg.sender]) revert FaucetCooldown(nextFaucet[msg.sender]);
        nextFaucet[msg.sender] = block.timestamp + 1 days;
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}
