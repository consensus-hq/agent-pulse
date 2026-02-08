// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPulseRegistry
 * @author Agent Pulse
 * @notice Minimal interface for reading PulseRegistry state in composable contracts.
 * @dev Covers the view surface needed by downstream integrations.
 *      Deployed on Base at 0xe61C615743A02983A46aFF66Db035297e8a43846.
 */
interface IPulseRegistry {
    /// @notice Whether the agent's last pulse is within the TTL window.
    function isAlive(address agent) external view returns (bool);

    /// @notice Full agent status tuple.
    /// @return alive   True when lastPulseAt + ttl >= block.timestamp.
    /// @return lastPulseAt  Unix timestamp of the most recent pulse.
    /// @return streak  Consecutive-day pulse count.
    /// @return hazardScore  Owner-assigned risk score (0-100).
    function getAgentStatus(address agent)
        external
        view
        returns (bool alive, uint256 lastPulseAt, uint256 streak, uint256 hazardScore);

    /// @notice The TTL window in seconds (default 86 400 = 24 h).
    function ttlSeconds() external view returns (uint256);
}
