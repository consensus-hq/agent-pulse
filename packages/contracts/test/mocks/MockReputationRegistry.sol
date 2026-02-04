// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockReputationRegistry {
    event FeedbackReceived(address indexed from, uint256 agentId, uint8 score);

    function giveFeedback(
        uint256 agentId,
        uint8 score,
        bytes32,
        bytes32,
        string calldata,
        bytes32,
        bytes calldata
    ) external {
        emit FeedbackReceived(msg.sender, agentId, score);
    }
}
