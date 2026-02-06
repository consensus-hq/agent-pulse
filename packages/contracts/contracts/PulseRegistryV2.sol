// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interfaces/IPulseRegistryV2.sol";
import "./interfaces/IAgentVerifiable.sol";

/**
 * @title PulseRegistryV2
 * @notice V2 registry with staking, reliability scoring, and agent tiers
 * @dev Wraps V1 registry state or acts as standalone authoritative source
 *      Score = streak (max 50) + log volume (max 30) + log(stake * duration) (max 20)
 */
contract PulseRegistryV2 is IPulseRegistryV2, IAgentVerifiable, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    uint256 private constant SECONDS_PER_DAY = 86400;
    uint256 private constant MIN_STREAK_GAP = 20 hours;
    
    // Score weights (must sum to 100)
    uint256 public constant MAX_STREAK_SCORE = 50;
    uint256 public constant MAX_VOLUME_SCORE = 30;
    uint256 public constant MAX_STAKE_SCORE = 20;
    
    // Tier thresholds (based on total score 0-100)
    uint256 public constant TIER_PRO_THRESHOLD = 40;      // Score >= 40 = Pro
    uint256 public constant TIER_PARTNER_THRESHOLD = 70;  // Score >= 70 = Partner
    
    // Stake lockup period
    uint256 public constant STAKE_LOCKUP_PERIOD = 7 days;
    
    // ============ Immutable Configuration ============
    IERC20 public immutable pulseToken;
    
    // ============ V1 Compatibility State ============
    struct AgentStatus {
        uint64 lastPulseAt;
        uint32 streak;
        uint32 lastStreakDay;
        uint256 totalBurned;
    }
    
    mapping(address => AgentStatus) public agents;
    
    // ============ V2 Extensions ============
    struct AgentV2 {
        uint256 stakedAmount;
        uint256 stakeStartTime;
        uint256 stakeUnlockTime;
    }
    
    mapping(address => AgentV2) public agentExtensions;
    
    // ============ Mutable Parameters ============
    uint256 public ttlSeconds;
    uint256 public minPulseAmount;
    
    // ============ Upper Bounds ============
    uint256 public constant MAX_TTL = 30 days;
    uint256 public constant MAX_MIN_PULSE = 1000e18;
    
    // ============ Events ============
    // ReliabilityUpdate, Staked, Unstaked, PulseV2 inherited from IPulseRegistryV2
    event TTLUpdated(uint256 newTTL);
    event MinPulseAmountUpdated(uint256 newMin);
    
    // ============ Errors ============
    error BelowMinimumPulse(uint256 provided, uint256 minimum);
    error InvalidTTL();
    error InvalidMinPulseAmount();
    error ZeroAddress();
    error StakeLockupActive(uint256 unlockTime);
    error InsufficientStake(uint256 requested, uint256 available);
    error AgentNotAlive();
    error ReliabilityTooLow(uint256 score, uint256 required);
    error NotVerifiedAgent();
    error TransferFailed();
    
    // ============ Constructor ============
    constructor(
        address _pulseToken,
        uint256 _ttlSeconds,
        uint256 _minPulseAmount
    ) Ownable(msg.sender) {
        if (_pulseToken == address(0)) revert ZeroAddress();
        if (_ttlSeconds == 0 || _ttlSeconds > MAX_TTL) revert InvalidTTL();
        if (_minPulseAmount == 0 || _minPulseAmount > MAX_MIN_PULSE) revert InvalidMinPulseAmount();
        
        pulseToken = IERC20(_pulseToken);
        ttlSeconds = _ttlSeconds;
        minPulseAmount = _minPulseAmount;
    }
    
    // ============ Core V2 Pulse Logic ============
    /**
     * @notice Send a pulse to signal agent liveness with V2 tracking
     * @param amount Amount of PULSE to burn (must be >= minPulseAmount)
     */
    function pulse(uint256 amount) external whenNotPaused nonReentrant {
        if (amount < minPulseAmount) revert BelowMinimumPulse(amount, minPulseAmount);
        
        // Effects first (CEI pattern)
        AgentStatus storage s = agents[msg.sender];
        uint32 today = uint32(block.timestamp / SECONDS_PER_DAY);
        
        if (s.lastPulseAt == 0) {
            s.streak = 1;
        } else if (today == s.lastStreakDay) {
            // same day: streak unchanged
        } else if (today == s.lastStreakDay + 1) {
            // Check MIN_STREAK_GAP to prevent day-boundary gaming
            if (block.timestamp - uint256(s.lastPulseAt) >= MIN_STREAK_GAP) {
                s.streak += 1;
            }
        } else {
            s.streak = 1;
        }
        
        s.lastPulseAt = uint64(block.timestamp);
        s.lastStreakDay = today;
        s.totalBurned += amount;
        
        emit PulseV2(msg.sender, amount, block.timestamp, s.streak, s.totalBurned);
        
        // Calculate and emit reliability update
        uint256 score = _calculateReliabilityScore(msg.sender);
        uint8 tier = _calculateTier(score);
        emit ReliabilityUpdate(msg.sender, score, tier);
        
        // Interaction last (CEI pattern)
        pulseToken.safeTransferFrom(msg.sender, DEAD_ADDRESS, amount);
    }
    
    // ============ Staking Functions ============
    /**
     * @notice Stakes PULSE to increase reliability score
     * @param amount Amount of PULSE to stake
     */
    function stake(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert BelowMinimumPulse(0, 1);
        
        AgentV2 storage ext = agentExtensions[msg.sender];
        if (ext.stakedAmount == 0) {
            ext.stakeStartTime = block.timestamp;
        } else {
            // Weighted average start time
            uint256 totalAmount = ext.stakedAmount + amount;
            uint256 weightedStart = (ext.stakedAmount * ext.stakeStartTime + amount * block.timestamp) / totalAmount;
            ext.stakeStartTime = weightedStart;
        }
        ext.stakedAmount += amount;
        ext.stakeUnlockTime = block.timestamp + STAKE_LOCKUP_PERIOD;
        
        emit Staked(msg.sender, amount, ext.stakeUnlockTime);
        
        // Calculate and emit reliability update
        uint256 score = _calculateReliabilityScore(msg.sender);
        uint8 tier = _calculateTier(score);
        emit ReliabilityUpdate(msg.sender, score, tier);
        
        pulseToken.safeTransferFrom(msg.sender, address(this), amount);
    }
    
    /**
     * @notice Unstakes PULSE after lockup period expires
     * @param amount Amount of PULSE to unstake
     */
    function unstake(uint256 amount) external whenNotPaused nonReentrant {
        AgentV2 storage ext = agentExtensions[msg.sender];
        
        if (block.timestamp < ext.stakeUnlockTime) {
            revert StakeLockupActive(ext.stakeUnlockTime);
        }
        if (amount > ext.stakedAmount) {
            revert InsufficientStake(amount, ext.stakedAmount);
        }
        
        ext.stakedAmount -= amount;
        if (ext.stakedAmount == 0) {
            ext.stakeStartTime = 0;
        }
        
        emit Unstaked(msg.sender, amount);
        
        // Calculate and emit reliability update
        uint256 score = _calculateReliabilityScore(msg.sender);
        uint8 tier = _calculateTier(score);
        emit ReliabilityUpdate(msg.sender, score, tier);
        
        pulseToken.safeTransfer(msg.sender, amount);
    }
    
    // ============ Reliability Score Calculation ============
    /**
     * @notice Calculates reliability score (0-100) based on on-chain metrics
     * @dev Pure calculation, gas efficient (~5k gas)
     * @param agent The agent address
     * @return score The calculated score (0-100)
     */
    function getReliabilityScore(address agent) external view returns (uint256 score) {
        return _calculateReliabilityScore(agent);
    }
    
    /**
     * @notice Internal function to calculate reliability score
     * @param agent The agent address
     * @return score The calculated score (0-100)
     */
    function _calculateReliabilityScore(address agent) internal view returns (uint256 score) {
        AgentStatus memory s = agents[agent];
        AgentV2 memory ext = agentExtensions[agent];
        
        // Dead agents get 0 score
        if (s.lastPulseAt == 0) return 0;
        if (block.timestamp > uint256(s.lastPulseAt) + ttlSeconds) return 0;
        
        // 1. Streak score (max 50 points, 1 per day streak, capped at 50)
        uint256 streakScore = uint256(s.streak) > MAX_STREAK_SCORE ? MAX_STREAK_SCORE : uint256(s.streak);
        
        // 2. Volume score: logarithmic (max 30)
        uint256 volumeInput = s.totalBurned / 1e18 + 1;
        uint256 volumeScore = log2(volumeInput);
        if (volumeScore > MAX_VOLUME_SCORE) volumeScore = MAX_VOLUME_SCORE;
        
        // 3. Stake score: logarithmic on (amount * duration_days) (max 20)
        uint256 stakeScore = 0;
        if (ext.stakedAmount > 0 && ext.stakeStartTime > 0) {
            uint256 duration = block.timestamp - ext.stakeStartTime;
            uint256 durationDays = duration / SECONDS_PER_DAY;
            uint256 effective = (ext.stakedAmount / 1e18) * durationDays + 1;
            stakeScore = log2(effective);
            if (stakeScore > MAX_STAKE_SCORE) stakeScore = MAX_STAKE_SCORE;
        }
        
        return streakScore + volumeScore + stakeScore;
    }
    
    /**
     * @notice Approximate log2 function using bit operations
     * @param value The input value
     * @return result floor(log2(value))
     */
    function log2(uint256 value) internal pure returns (uint256) {
        uint256 result = 0;
        unchecked {
            if (value >> 128 > 0) {
                value >>= 128;
                result += 128;
            }
            if (value >> 64 > 0) {
                value >>= 64;
                result += 64;
            }
            if (value >> 32 > 0) {
                value >>= 32;
                result += 32;
            }
            if (value >> 16 > 0) {
                value >>= 16;
                result += 16;
            }
            if (value >> 8 > 0) {
                value >>= 8;
                result += 8;
            }
            if (value >> 4 > 0) {
                value >>= 4;
                result += 4;
            }
            if (value >> 2 > 0) {
                value >>= 2;
                result += 2;
            }
            if (value >> 1 > 0) {
                result += 1;
            }
        }
        return result;
    }
    
    // ============ Tier System ============
    /**
     * @notice Returns current Tier for API gating
     * @param agent The agent address
     * @return tier 0=Basic, 1=Pro, 2=Partner
     */
    function getAgentTier(address agent) external view returns (uint8 tier) {
        uint256 score = _calculateReliabilityScore(agent);
        return _calculateTier(score);
    }
    
    /**
     * @notice Internal function to calculate tier from score
     * @param score The reliability score
     * @return tier 0=Basic, 1=Pro, 2=Partner
     */
    function _calculateTier(uint256 score) internal pure returns (uint8 tier) {
        if (score >= TIER_PARTNER_THRESHOLD) return 2; // Partner
        if (score >= TIER_PRO_THRESHOLD) return 1;     // Pro
        return 0;                                      // Basic
    }
    
    // ============ IAgentVerifiable Implementation ============
    /**
     * @notice Reverts if agent is dead or below minimum score threshold
     * @param agent The agent address to verify
     * @param minScore Minimum reliability score required (0-100)
     */
    function requireReliability(address agent, uint256 minScore) external view {
        if (!isAlive(agent)) revert AgentNotAlive();
        uint256 score = _calculateReliabilityScore(agent);
        if (score < minScore) revert ReliabilityTooLow(score, minScore);
    }
    
    /**
     * @notice Returns true if agent is in "Good Standing" (Alive + Streak > 7)
     * @param agent The agent address to check
     * @return True if agent is verified
     */
    function isVerifiedAgent(address agent) external view returns (bool) {
        if (!isAlive(agent)) return false;
        return agents[agent].streak > 7;
    }
    
    // ============ View Functions ============
    /**
     * @notice Check if agent is alive (within TTL)
     * @param agent The agent address
     * @return True if agent has pulsed within TTL
     */
    function isAlive(address agent) public view returns (bool) {
        AgentStatus memory s = agents[agent];
        if (s.lastPulseAt == 0) return false;
        return block.timestamp <= uint256(s.lastPulseAt) + ttlSeconds;
    }
    
    /**
     * @notice Get full agent status from V1 structure
     * @param agent The agent address
     * @return alive Whether agent is alive
     * @return lastPulseAt Timestamp of last pulse
     * @return streak Current streak count
     * @return totalBurned Total PULSE burned
     */
    function getAgentStatus(address agent) external view returns (
        bool alive,
        uint256 lastPulseAt,
        uint256 streak,
        uint256 totalBurned
    ) {
        AgentStatus memory s = agents[agent];
        alive = (s.lastPulseAt != 0) && (block.timestamp <= uint256(s.lastPulseAt) + ttlSeconds);
        return (alive, s.lastPulseAt, s.streak, s.totalBurned);
    }
    
    /**
     * @notice Get staked amount for an agent
     * @param agent The agent address
     * @return Amount of PULSE staked
     */
    function stakedAmount(address agent) external view returns (uint256) {
        return agentExtensions[agent].stakedAmount;
    }
    
    /**
     * @notice Get stake unlock time for an agent
     * @param agent The agent address
     * @return Timestamp when stake can be unlocked
     */
    function stakeUnlockTime(address agent) external view returns (uint256) {
        return agentExtensions[agent].stakeUnlockTime;
    }
    
    // ============ Admin Functions ============
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
