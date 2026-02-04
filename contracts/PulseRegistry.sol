// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.19;

import { IERC20 } from "./interfaces/IERC20.sol";

/// @title PulseRegistry
/// @notice Records on-chain pulse timestamps for routing eligibility.
/// @dev Pulse = transferFrom(msg.sender -> signal sink) for a fixed amount.
contract PulseRegistry {
    event Pulse(address indexed agent, uint256 amount, uint256 timestamp, uint256 blockNumber);

    IERC20 public immutable pulseToken;
    address public immutable signalSink;
    uint256 public immutable pulseAmount;

    mapping(address => uint64) public lastPulseAt;
    mapping(address => uint64) public lastPulseBlock;
    uint256 public totalPulses;

    constructor(address token, address sink, uint256 amount) {
        require(token != address(0), "TOKEN_ZERO_ADDRESS");
        require(sink != address(0), "SINK_ZERO_ADDRESS");
        require(amount > 0, "INVALID_PULSE_AMOUNT");

        pulseToken = IERC20(token);
        signalSink = sink;
        pulseAmount = amount;
    }

    /// @notice Send a pulse and record on-chain timestamp.
    function pulse() external {
        bool ok = pulseToken.transferFrom(msg.sender, signalSink, pulseAmount);
        require(ok, "PULSE_TRANSFER_FAILED");

        lastPulseAt[msg.sender] = uint64(block.timestamp);
        lastPulseBlock[msg.sender] = uint64(block.number);
        totalPulses += 1;

        emit Pulse(msg.sender, pulseAmount, block.timestamp, block.number);
    }

    /// @notice Check if an agent is alive within a TTL window (seconds).
    function isAlive(address agent, uint256 ttlSeconds) external view returns (bool) {
        uint64 last = lastPulseAt[agent];
        if (last == 0) return false;
        return block.timestamp - last <= ttlSeconds;
    }
}
