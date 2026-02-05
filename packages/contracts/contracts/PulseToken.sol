// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PulseToken
 * @notice ERC20 token for Agent Pulse protocol
 * @dev Standard ERC20 with burn functionality. Initial supply minted to recipient.
 */
contract PulseToken is ERC20, ERC20Burnable, Ownable {
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        address recipient
    ) ERC20(name, symbol) Ownable(msg.sender) {
        _mint(recipient, initialSupply);
    }

    /**
     * @notice Mint new tokens (only owner)
     * @param to Address to mint to
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
