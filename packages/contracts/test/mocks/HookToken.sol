// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title HookToken
 * @notice ERC-20 that calls back into the caller during transferFrom (simulates ERC-777 hooks)
 * @dev Used to test reentrancy protection in PulseRegistry
 */
contract HookToken is ERC20 {
    address public hookTarget;
    bytes public hookCalldata;
    bool public hookEnabled;

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Enable a callback during transferFrom
    function setHook(address target, bytes calldata data) external {
        hookTarget = target;
        hookCalldata = data;
        hookEnabled = true;
    }

    function disableHook() external {
        hookEnabled = false;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        // Execute hook BEFORE transfer (simulates tokensToSend in ERC-777)
        if (hookEnabled && hookTarget != address(0)) {
            (bool success,) = hookTarget.call(hookCalldata);
            // We don't care if it reverts — the point is to test if PulseRegistry blocks it
            // If success is true, reentrancy guard failed
        }
        return super.transferFrom(from, to, amount);
    }
}
