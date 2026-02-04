// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PulseRegistry
 * @notice On-chain activity signal registry for autonomous agents
 * @dev Agents pay 1 PULSE to signal liveness. Tokens are burned to signalSink.
 *      isAlive is strictly TTL-based. Reputation feedback is gated on isAlive.
 */
contract PulseRegistry is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Immutable Configuration ============
    IERC20 public immutable pulseToken;
    address public immutable signalSink;

    // ============ Mutable Parameters ============
    uint256 public ttlSeconds;          // default 86400 (24h)
    uint256 public minPulseAmount;      // default 1e18 (1 PULSE)

    // ============ Agent State ============
    struct AgentStatus {
        uint64 lastPulseAt;
        uint32 streak;
        uint32 lastStreakDay;
        uint8 hazardScore; // 0-100
    }

    mapping(address => AgentStatus) public agents;

    // ============ Events ============
    event Pulse(address indexed agent, uint256 amount, uint256 timestamp, uint256 streak);
    event HazardUpdated(address indexed agent, uint8 score);
    event TTLUpdated(uint256 newTTL);
    event MinPulseAmountUpdated(uint256 newMin);

    // ============ Errors ============
    error BelowMinimumPulse(uint256 provided, uint256 minimum);
    error InvalidHazardScore(uint256 score, uint256 max);
    error InvalidTTL();
    error InvalidMinPulseAmount();
    error ZeroAddress();

    // ============ Constants ============
    uint256 private constant SECONDS_PER_DAY = 86400;

    // ============ Constructor ============
    constructor(
        address _pulseToken,
        address _signalSink,
        uint256 _ttlSeconds,
        uint256 _minPulseAmount
    ) Ownable(msg.sender) {
        if (_pulseToken == address(0) || _signalSink == address(0)) revert ZeroAddress();
        if (_ttlSeconds == 0) revert InvalidTTL();
        if (_minPulseAmount == 0) revert InvalidMinPulseAmount();

        pulseToken = IERC20(_pulseToken);
        signalSink = _signalSink;
        ttlSeconds = _ttlSeconds;
        minPulseAmount = _minPulseAmount;
    }

    // ============ Core Logic ============
    function pulse(uint256 amount) external whenNotPaused nonReentrant {
        if (amount < minPulseAmount) revert BelowMinimumPulse(amount, minPulseAmount);

        // Transfer to sink (burn)
        pulseToken.safeTransferFrom(msg.sender, signalSink, amount);

        // Streak calculation
        AgentStatus storage s = agents[msg.sender];
        uint32 today = uint32(block.timestamp / SECONDS_PER_DAY);

        if (s.lastPulseAt == 0) {
            s.streak = 1;
        } else if (today == s.lastStreakDay) {
            // same day: streak unchanged
        } else if (today == s.lastStreakDay + 1) {
            unchecked { s.streak += 1; }
        } else {
            s.streak = 1;
        }

        s.lastPulseAt = uint64(block.timestamp);
        s.lastStreakDay = today;

        emit Pulse(msg.sender, amount, block.timestamp, s.streak);
    }

    // ============ View Functions ============
    function isAlive(address agent) external view returns (bool) {
        AgentStatus memory s = agents[agent];
        if (s.lastPulseAt == 0) return false;
        return block.timestamp <= uint256(s.lastPulseAt) + ttlSeconds;
    }

    function getAgentStatus(address agent) external view returns (
        bool alive,
        uint256 lastPulseAt,
        uint256 streak,
        uint256 hazardScore
    ) {
        AgentStatus memory s = agents[agent];
        alive = (s.lastPulseAt != 0) && (block.timestamp <= uint256(s.lastPulseAt) + ttlSeconds);
        return (alive, s.lastPulseAt, s.streak, s.hazardScore);
    }

    // ============ Admin Functions ============
    function updateHazard(address agent, uint8 score) external onlyOwner {
        if (score > 100) revert InvalidHazardScore(score, 100);
        agents[agent].hazardScore = score;
        emit HazardUpdated(agent, score);
    }

    function setTTL(uint256 newTTL) external onlyOwner {
        if (newTTL == 0) revert InvalidTTL();
        ttlSeconds = newTTL;
        emit TTLUpdated(newTTL);
    }

    function setMinPulseAmount(uint256 newMin) external onlyOwner {
        if (newMin == 0) revert InvalidMinPulseAmount();
        minPulseAmount = newMin;
        emit MinPulseAmountUpdated(newMin);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
