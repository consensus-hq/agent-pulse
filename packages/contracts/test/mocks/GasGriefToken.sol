// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title GasGriefToken
 * @notice ERC-20 that wastes gas during transferFrom (gas-griefing attack)
 * @dev Tests whether PulseRegistry's pulse() can be DoS'd via a gas-expensive token
 */
contract GasGriefToken is ERC20 {
    uint256 public wasteLoops;

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setWasteLoops(uint256 loops) external {
        wasteLoops = loops;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        // Waste gas in a loop
        uint256 sink;
        for (uint256 i = 0; i < wasteLoops; i++) {
            sink = uint256(keccak256(abi.encodePacked(sink, i)));
        }
        return super.transferFrom(from, to, amount);
    }
}
