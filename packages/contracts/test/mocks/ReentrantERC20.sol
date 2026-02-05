// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title ReentrantERC20
 * @notice ERC20 that attempts to reenter a target during transferFrom
 */
contract ReentrantERC20 is ERC20 {
    address public hookTarget;
    bytes public hookCalldata;
    bool public hookEnabled;
    bool public reenterSucceeded;

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function enableReenter(address target, bytes calldata data, address spender) external {
        hookTarget = target;
        hookCalldata = data;
        hookEnabled = true;
        _approve(address(this), spender, type(uint256).max);
    }

    function disableReenter() external {
        hookEnabled = false;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (hookEnabled && hookTarget != address(0)) {
            (bool ok,) = hookTarget.call(hookCalldata);
            reenterSucceeded = ok;
        }
        return super.transferFrom(from, to, amount);
    }
}
