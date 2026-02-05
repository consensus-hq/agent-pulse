// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title FeeOnTransferToken
 * @notice ERC20 that takes a fee on transferFrom
 */
contract FeeOnTransferToken is ERC20 {
    uint256 public feeBps; // e.g., 1000 = 10%
    address public feeCollector;

    constructor(string memory name, string memory symbol, uint256 _feeBps, address _feeCollector)
        ERC20(name, symbol)
    {
        feeBps = _feeBps;
        feeCollector = _feeCollector;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        uint256 fee = (amount * feeBps) / 10_000;
        uint256 net = amount - fee;
        _spendAllowance(from, msg.sender, amount);
        _transfer(from, to, net);
        if (fee > 0) {
            _transfer(from, feeCollector, fee);
        }
        return true;
    }
}
