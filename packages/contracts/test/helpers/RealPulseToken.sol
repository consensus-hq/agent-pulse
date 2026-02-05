// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract RealPulseToken is ERC20, ERC20Permit, ERC20Burnable {
    constructor(string memory name, string memory symbol, uint256 initialSupply, address recipient)
        ERC20(name, symbol)
        ERC20Permit(name)
    {
        _mint(recipient, initialSupply);
    }
}
