// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PulseRegistry
 * @notice On-chain activity signal registry for autonomous agents
 * @dev Agents pay 1 PULSE to signal liveness. Tokens are burned to signalSink.
 *      isAlive is strictly TTL-based.
 *      postReputationFeedback is out-of-scope for MVP (see audit L-02).
 */
contract PulseRegistry is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Immutable Configuration ============
    IERC20 public immutable pulseToken;
    address public immutable signalSink;

    // ============ Mutable Parameters ============
    uint256 public ttlSeconds;          // default 86400 (24h)
    uint256 public minPulseAmount;      // default 1e18 (1 PULSE)

    // ============ Upper Bounds (audit M-02) ============
    uint256 public constant MAX_TTL = 30 days;
    uint256 public constant MAX_MIN_PULSE = 1000e18; // 1000 PULSE

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
    uint256 private constant MIN_STREAK_GAP = 20 hours; // RED-4: prevent day-boundary streak gaming

    // ============ Constructor ============
    constructor(
        address _pulseToken,
        address _signalSink,
        uint256 _ttlSeconds,
        uint256 _minPulseAmount
    ) Ownable(msg.sender) {
        if (_pulseToken == address(0) || _signalSink == address(0)) revert ZeroAddress();
        if (_ttlSeconds == 0 || _ttlSeconds > MAX_TTL) revert InvalidTTL();
        if (_minPulseAmount == 0 || _minPulseAmount > MAX_MIN_PULSE) revert InvalidMinPulseAmount();

        pulseToken = IERC20(_pulseToken);
        signalSink = _signalSink;
        ttlSeconds = _ttlSeconds;
        minPulseAmount = _minPulseAmount;
    }

    // ============ Core Logic ============
    /// @notice Send a pulse to signal agent liveness
    /// @dev CEI pattern: checks → effects → interactions (audit I-01)
    function pulse(uint256 amount) external whenNotPaused nonReentrant {
        if (amount < minPulseAmount) revert BelowMinimumPulse(amount, minPulseAmount);

        // Effects first (CEI pattern — audit I-01)
        AgentStatus storage s = agents[msg.sender];
        uint32 today = uint32(block.timestamp / SECONDS_PER_DAY);

        if (s.lastPulseAt == 0) {
            s.streak = 1;
        } else if (today == s.lastStreakDay) {
            // same day: streak unchanged
        } else if (today == s.lastStreakDay + 1) {
            // RED-4 fix: require MIN_STREAK_GAP between streak-advancing pulses
            // Prevents gaming at day boundaries (pulse at 23:59 + 00:00 = 2 streak in 1s)
            if (block.timestamp - uint256(s.lastPulseAt) >= MIN_STREAK_GAP) {
                s.streak += 1; // Safe math — no unchecked (audit M-01)
            }
            // else: too soon after last pulse, streak unchanged (like same-day)
        } else {
            s.streak = 1;
        }

        s.lastPulseAt = uint64(block.timestamp);
        s.lastStreakDay = today;

        emit Pulse(msg.sender, amount, block.timestamp, s.streak);

        // Interaction last (CEI pattern — audit I-01)
        pulseToken.safeTransferFrom(msg.sender, signalSink, amount);
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
        if (newTTL == 0 || newTTL > MAX_TTL) revert InvalidTTL();
        ttlSeconds = newTTL;
        emit TTLUpdated(newTTL);
    }

    function setMinPulseAmount(uint256 newMin) external onlyOwner {
        if (newMin == 0 || newMin > MAX_MIN_PULSE) revert InvalidMinPulseAmount();
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
