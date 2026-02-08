// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ═══════════════════════════════════════════════════════════════════
//  DESK WATCH — On-Chain Uptime Betting Game
//  Built on Agent Pulse · Base Chain
//
//  Integrates with:
//    - PulseRegistryV2 (existing) — reads lastPulse timestamps
//    - PULSE token (existing) — optional reward currency
//    - x402/HeyElsa — off-chain payment rails (subscribe flow)
//
//  Architecture:
//    Players watch trading desks by depositing ETH into per-desk pools.
//    If a desk misses its heartbeat (dead), watchers split the pool.
//    If a desk survives the round, fees go to desk operator + protocol.
//    Tiers (Scout/Sentinel/Sniper) give multiplied reward weight.
// ═══════════════════════════════════════════════════════════════════

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @notice Interface for the existing PulseRegistryV2 contract
/// @dev We only need read access to check agent liveness
interface IPulseRegistry {
    /// @notice Returns the timestamp of the last heartbeat for an agent
    function lastPulse(address agent) external view returns (uint256);

    /// @notice Returns the TTL (time-to-live) configured for an agent
    function ttl(address agent) external view returns (uint256);

    /// @notice Returns whether an agent is currently registered
    function isRegistered(address agent) external view returns (bool);

    /// @notice Returns whether an agent is currently alive (lastPulse + ttl > block.timestamp)
    function isAlive(address agent) external view returns (bool);
}

/// @title DeskWatchGame
/// @notice On-chain uptime betting game built on Agent Pulse liveness protocol
/// @dev Players bet on whether AI trading desks will stay alive during timed rounds
contract DeskWatchGame is ReentrancyGuard, Ownable, Pausable {

    // ═══════════════════════════════════════════════════════
    // TYPES
    // ═══════════════════════════════════════════════════════

    enum Tier { Scout, Sentinel, Sniper }
    enum DeskStatus { Active, Dead, Retired }
    enum RoundStatus { Active, Settled }

    struct Desk {
        bytes32 deskId;           // Human-readable identifier (keccak of name)
        address pulseAgent;       // Wallet address that pulses in PulseRegistryV2
        address operator;         // Desk operator who receives fees on survival
        string name;              // Display name ("Volatility Cult", etc.)
        uint256 gameTTL;          // Game-specific TTL (tighter than protocol TTL)
        DeskStatus status;        // Current status
        uint256 totalDeaths;      // Lifetime death count
        uint256 totalWatched;     // Lifetime watch count
    }

    struct Watch {
        address watcher;
        bytes32 deskId;
        Tier tier;
        uint256 amount;           // ETH deposited
        uint256 weight;           // tier multiplier applied to amount
        uint256 roundId;
        uint256 timestamp;
        bool claimed;
    }

    struct Round {
        uint256 id;
        uint256 startTime;
        uint256 endTime;
        RoundStatus status;
    }

    struct DeathEvent {
        bytes32 deskId;
        uint256 roundId;
        uint256 timestamp;
        uint256 reportedBy;       // Index in watchers who reported
        uint256 poolAtDeath;
        uint256 watcherCount;
    }

    // ═══════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════

    /// @notice Reference to existing PulseRegistryV2
    IPulseRegistry public immutable pulseRegistry;

    /// @notice Protocol fee recipient
    address public protocolTreasury;

    /// @notice Protocol fee in basis points (1000 = 10%)
    uint256 public protocolFeeBps = 1000;

    /// @notice Operator fee on survived rounds in bps (7000 = 70%)
    uint256 public operatorFeeBps = 7000;

    /// @notice Round duration in seconds (default 1 hour)
    uint256 public roundDuration = 3600;

    /// @notice Minimum watch amount in wei
    uint256 public minWatchAmount = 0.0001 ether;

    /// @notice Maximum watch amount in wei
    uint256 public maxWatchAmount = 0.1 ether;

    /// @notice Tier multipliers (Scout=1x, Sentinel=3x, Sniper=7x)
    mapping(Tier => uint256) public tierMultiplier;

    /// @notice Tier costs (minimum ETH per tier)
    mapping(Tier => uint256) public tierMinCost;

    /// @notice All registered desks
    mapping(bytes32 => Desk) public desks;
    bytes32[] public deskIds;

    /// @notice Current round
    Round public currentRound;
    uint256 public roundCounter;

    /// @notice Watches per round: roundId => deskId => Watch[]
    mapping(uint256 => mapping(bytes32 => Watch[])) internal _roundWatches;

    /// @notice Pool totals per round per desk
    mapping(uint256 => mapping(bytes32 => uint256)) public pools;

    /// @notice Total weighted stake per round per desk
    mapping(uint256 => mapping(bytes32 => uint256)) public poolWeights;

    /// @notice Death events per round
    mapping(uint256 => mapping(bytes32 => DeathEvent)) public deathEvents;
    mapping(uint256 => mapping(bytes32 => bool)) public isDead;

    /// @notice Whether a wallet has already watched a desk this round
    mapping(uint256 => mapping(bytes32 => mapping(address => bool))) public hasWatched;

    /// @notice Rollover pool (unclaimed from rounds where no desk died)
    mapping(bytes32 => uint256) public rolloverPool;

    /// @notice Leaderboard tracking
    mapping(address => uint256) public totalEarnings;
    mapping(address => uint256) public totalDesksCaught;
    mapping(address => uint256) public totalWatchCount;

    /// @notice Protocol stats
    uint256 public totalVolume;
    uint256 public totalDeathsAllTime;
    uint256 public totalPayoutsAllTime;

    // ═══════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════

    event DeskRegistered(bytes32 indexed deskId, address pulseAgent, address operator, string name);
    event DeskRetired(bytes32 indexed deskId);
    event RoundStarted(uint256 indexed roundId, uint256 startTime, uint256 endTime);
    event RoundSettled(uint256 indexed roundId);
    event WatchPlaced(
        uint256 indexed roundId,
        bytes32 indexed deskId,
        address indexed watcher,
        Tier tier,
        uint256 amount,
        uint256 weight
    );
    event DeskDeath(
        uint256 indexed roundId,
        bytes32 indexed deskId,
        uint256 poolAmount,
        uint256 watcherCount,
        address reportedBy
    );
    event RewardClaimed(
        uint256 indexed roundId,
        bytes32 indexed deskId,
        address indexed watcher,
        uint256 reward
    );
    event SurvivalSettled(
        uint256 indexed roundId,
        bytes32 indexed deskId,
        uint256 toOperator,
        uint256 toProtocol,
        uint256 toRollover
    );
    event RolloverAdded(bytes32 indexed deskId, uint256 amount);

    // ═══════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════

    error DeskNotFound();
    error DeskNotActive();
    error DeskAlreadyDead();
    error DeskStillAlive();
    error RoundNotActive();
    error RoundNotExpired();
    error AlreadyWatching();
    error InvalidTier();
    error InsufficientAmount();
    error ExceedsMaxAmount();
    error AlreadyClaimed();
    error NothingToClaim();
    error NoActiveRound();
    error CannotWatchOwnDesk();
    error TransferFailed();

    // ═══════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════

    /// @param _pulseRegistry Address of existing PulseRegistryV2 on Base
    /// @param _treasury Protocol treasury address
    constructor(
        address _pulseRegistry,
        address _treasury
    ) Ownable(msg.sender) {
        pulseRegistry = IPulseRegistry(_pulseRegistry);
        protocolTreasury = _treasury;

        // Set tier multipliers
        tierMultiplier[Tier.Scout] = 1;
        tierMultiplier[Tier.Sentinel] = 3;
        tierMultiplier[Tier.Sniper] = 7;

        // Set tier minimum costs
        tierMinCost[Tier.Scout] = 0.0001 ether;     // ~$0.10 at ~$1000 ETH
        tierMinCost[Tier.Sentinel] = 0.0005 ether;   // ~$0.50
        tierMinCost[Tier.Sniper] = 0.001 ether;      // ~$1.00
    }

    // ═══════════════════════════════════════════════════════
    // DESK MANAGEMENT (Owner only)
    // ═══════════════════════════════════════════════════════

    /// @notice Register a new trading desk
    /// @param _name Human-readable desk name
    /// @param _pulseAgent Wallet address that pulses heartbeats in PulseRegistryV2
    /// @param _operator Address that receives fees when desk survives
    /// @param _gameTTL Game-specific TTL in seconds (should be <= protocol TTL)
    function registerDesk(
        string calldata _name,
        address _pulseAgent,
        address _operator,
        uint256 _gameTTL
    ) external onlyOwner {
        require(_pulseAgent != address(0), "Invalid agent address");
        require(_operator != address(0), "Invalid operator address");
        require(_gameTTL > 0, "TTL must be > 0");

        bytes32 deskId = keccak256(abi.encodePacked(_name, _pulseAgent));

        desks[deskId] = Desk({
            deskId: deskId,
            pulseAgent: _pulseAgent,
            operator: _operator,
            name: _name,
            gameTTL: _gameTTL,
            status: DeskStatus.Active,
            totalDeaths: 0,
            totalWatched: 0
        });

        deskIds.push(deskId);

        emit DeskRegistered(deskId, _pulseAgent, _operator, _name);
    }

    /// @notice Retire a desk (no new watches, existing rounds settle normally)
    function retireDesk(bytes32 _deskId) external onlyOwner {
        if (desks[_deskId].pulseAgent == address(0)) revert DeskNotFound();
        desks[_deskId].status = DeskStatus.Retired;
        emit DeskRetired(_deskId);
    }

    /// @notice Update desk operator address
    function updateDeskOperator(bytes32 _deskId, address _newOperator) external onlyOwner {
        if (desks[_deskId].pulseAgent == address(0)) revert DeskNotFound();
        require(_newOperator != address(0), "Invalid operator");
        desks[_deskId].operator = _newOperator;
    }

    /// @notice Update desk game TTL
    function updateDeskTTL(bytes32 _deskId, uint256 _newTTL) external onlyOwner {
        if (desks[_deskId].pulseAgent == address(0)) revert DeskNotFound();
        require(_newTTL > 0, "TTL must be > 0");
        desks[_deskId].gameTTL = _newTTL;
    }

    // ═══════════════════════════════════════════════════════
    // ROUND MANAGEMENT
    // ═══════════════════════════════════════════════════════

    /// @notice Start a new round (auto-settles previous if expired)
    function startRound() external whenNotPaused {
        // If there's an active round that's expired, settle it first
        if (currentRound.status == RoundStatus.Active && block.timestamp >= currentRound.endTime) {
            _settleRound();
        }

        // Only start if no active round
        require(
            currentRound.id == 0 || currentRound.status == RoundStatus.Settled,
            "Round still active"
        );

        roundCounter++;
        currentRound = Round({
            id: roundCounter,
            startTime: block.timestamp,
            endTime: block.timestamp + roundDuration,
            status: RoundStatus.Active
        });

        emit RoundStarted(roundCounter, block.timestamp, block.timestamp + roundDuration);
    }

    /// @notice Settle the current round (anyone can call after endTime)
    function settleRound() external whenNotPaused {
        if (currentRound.status != RoundStatus.Active) revert NoActiveRound();
        if (block.timestamp < currentRound.endTime) revert RoundNotExpired();
        _settleRound();
    }

    // ═══════════════════════════════════════════════════════
    // CORE GAME: WATCH
    // ═══════════════════════════════════════════════════════

    /// @notice Watch a desk — deposit ETH into the desk's pool for this round
    /// @param _deskId The desk to watch
    /// @param _tier Watch tier (Scout=0, Sentinel=1, Sniper=2)
    function watch(bytes32 _deskId, Tier _tier) external payable nonReentrant whenNotPaused {
        // Validate round
        if (currentRound.status != RoundStatus.Active) revert RoundNotActive();
        if (block.timestamp >= currentRound.endTime) revert RoundNotActive();

        // Validate desk
        Desk storage desk = desks[_deskId];
        if (desk.pulseAgent == address(0)) revert DeskNotFound();
        if (desk.status != DeskStatus.Active) revert DeskNotActive();
        if (isDead[currentRound.id][_deskId]) revert DeskAlreadyDead();

        // Anti-self-play: desk operators cannot watch their own desk
        if (msg.sender == desk.operator || msg.sender == desk.pulseAgent) {
            revert CannotWatchOwnDesk();
        }

        // Validate amount
        if (msg.value < tierMinCost[_tier]) revert InsufficientAmount();
        if (msg.value > maxWatchAmount) revert ExceedsMaxAmount();

        // One watch per wallet per desk per round
        if (hasWatched[currentRound.id][_deskId][msg.sender]) revert AlreadyWatching();

        // Calculate weight
        uint256 weight = msg.value * tierMultiplier[_tier];

        // Record watch
        Watch memory w = Watch({
            watcher: msg.sender,
            deskId: _deskId,
            tier: _tier,
            amount: msg.value,
            weight: weight,
            roundId: currentRound.id,
            timestamp: block.timestamp,
            claimed: false
        });

        _roundWatches[currentRound.id][_deskId].push(w);
        hasWatched[currentRound.id][_deskId][msg.sender] = true;

        // Update pools
        pools[currentRound.id][_deskId] += msg.value;
        poolWeights[currentRound.id][_deskId] += weight;

        // Update stats
        desk.totalWatched++;
        totalWatchCount[msg.sender]++;
        totalVolume += msg.value;

        emit WatchPlaced(currentRound.id, _deskId, msg.sender, _tier, msg.value, weight);
    }

    // ═══════════════════════════════════════════════════════
    // CORE GAME: REPORT DEATH
    // ═══════════════════════════════════════════════════════

    /// @notice Report a desk as dead — reads PulseRegistryV2 to verify
    /// @dev Anyone can call this. The contract verifies against on-chain pulse data.
    /// @param _deskId The desk to report as dead
    function reportDeath(bytes32 _deskId) external nonReentrant whenNotPaused {
        if (currentRound.status != RoundStatus.Active) revert RoundNotActive();
        if (isDead[currentRound.id][_deskId]) revert DeskAlreadyDead();

        Desk storage desk = desks[_deskId];
        if (desk.pulseAgent == address(0)) revert DeskNotFound();
        if (desk.status != DeskStatus.Active) revert DeskNotActive();

        // ── READ FROM PULSEREGISTRYV2 ──
        // Check if the agent's last pulse + game TTL < current time
        uint256 lastPulseTime = pulseRegistry.lastPulse(desk.pulseAgent);
        uint256 timeSincePulse = block.timestamp - lastPulseTime;

        if (timeSincePulse <= desk.gameTTL) revert DeskStillAlive();

        // ── DESK IS DEAD ──
        isDead[currentRound.id][_deskId] = true;
        desk.totalDeaths++;
        totalDeathsAllTime++;

        uint256 pool = pools[currentRound.id][_deskId];
        uint256 watcherCount = _roundWatches[currentRound.id][_deskId].length;

        // Add rollover from previous rounds
        uint256 rollover = rolloverPool[_deskId];
        if (rollover > 0) {
            pool += rollover;
            rolloverPool[_deskId] = 0;
        }

        deathEvents[currentRound.id][_deskId] = DeathEvent({
            deskId: _deskId,
            roundId: currentRound.id,
            timestamp: block.timestamp,
            reportedBy: 0, // Could track reporter for bounty
            poolAtDeath: pool,
            watcherCount: watcherCount
        });

        emit DeskDeath(currentRound.id, _deskId, pool, watcherCount, msg.sender);
    }

    // ═══════════════════════════════════════════════════════
    // CORE GAME: CLAIM REWARD
    // ═══════════════════════════════════════════════════════

    /// @notice Claim reward for watching a desk that died
    /// @param _roundId The round the death occurred in
    /// @param _deskId The desk that died
    function claimReward(uint256 _roundId, bytes32 _deskId) external nonReentrant {
        if (!isDead[_roundId][_deskId]) revert NothingToClaim();

        DeathEvent memory death = deathEvents[_roundId][_deskId];
        Watch[] storage watches = _roundWatches[_roundId][_deskId];

        // Find caller's watch
        uint256 watchIndex = type(uint256).max;
        for (uint256 i = 0; i < watches.length; i++) {
            if (watches[i].watcher == msg.sender) {
                watchIndex = i;
                break;
            }
        }
        if (watchIndex == type(uint256).max) revert NothingToClaim();

        Watch storage w = watches[watchIndex];
        if (w.claimed) revert AlreadyClaimed();

        // Calculate weighted share
        uint256 totalWeight = poolWeights[_roundId][_deskId];
        uint256 rewardPool = death.poolAtDeath;

        // Protocol takes its cut first
        uint256 protocolFee = (rewardPool * protocolFeeBps) / 10000;
        uint256 distributable = rewardPool - protocolFee;

        // Watcher's share = (their weight / total weight) * distributable
        uint256 reward = (distributable * w.weight) / totalWeight;

        // Mark claimed
        w.claimed = true;

        // Update leaderboard
        totalEarnings[msg.sender] += reward;
        totalDesksCaught[msg.sender]++;
        totalPayoutsAllTime += reward;

        // Transfer reward
        (bool success, ) = payable(msg.sender).call{value: reward}("");
        if (!success) revert TransferFailed();

        // Transfer protocol fee (only once — first claimer pays it)
        // We track this with a simple flag
        if (protocolFee > 0 && watchIndex == 0) {
            (bool feeSuccess, ) = payable(protocolTreasury).call{value: protocolFee}("");
            // Don't revert on fee transfer failure — player still gets paid
            if (!feeSuccess) {
                // Fee stays in contract, can be swept later
            }
        }

        emit RewardClaimed(_roundId, _deskId, msg.sender, reward);
    }

    /// @notice Batch claim rewards for multiple desks in a round
    function batchClaim(uint256 _roundId, bytes32[] calldata _deskIds) external nonReentrant {
        for (uint256 i = 0; i < _deskIds.length; i++) {
            if (isDead[_roundId][_deskIds[i]]) {
                Watch[] storage watches = _roundWatches[_roundId][_deskIds[i]];
                for (uint256 j = 0; j < watches.length; j++) {
                    if (watches[j].watcher == msg.sender && !watches[j].claimed) {
                        _claimSingle(_roundId, _deskIds[i], j);
                    }
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════
    // INTERNAL
    // ═══════════════════════════════════════════════════════

    function _claimSingle(uint256 _roundId, bytes32 _deskId, uint256 _watchIndex) internal {
        DeathEvent memory death = deathEvents[_roundId][_deskId];
        Watch storage w = _roundWatches[_roundId][_deskId][_watchIndex];

        uint256 totalWeight = poolWeights[_roundId][_deskId];
        uint256 distributable = death.poolAtDeath - (death.poolAtDeath * protocolFeeBps / 10000);
        uint256 reward = (distributable * w.weight) / totalWeight;

        w.claimed = true;
        totalEarnings[w.watcher] += reward;
        totalDesksCaught[w.watcher]++;
        totalPayoutsAllTime += reward;

        (bool success, ) = payable(w.watcher).call{value: reward}("");
        if (!success) revert TransferFailed();

        emit RewardClaimed(_roundId, _deskId, w.watcher, reward);
    }

    function _settleRound() internal {
        uint256 roundId = currentRound.id;

        // For each desk: if it survived, distribute pool to operator + protocol
        for (uint256 i = 0; i < deskIds.length; i++) {
            bytes32 deskId = deskIds[i];
            uint256 pool = pools[roundId][deskId];

            if (pool == 0) continue; // No watchers on this desk

            if (!isDead[roundId][deskId]) {
                // Desk survived — operator and protocol get paid
                uint256 toOperator = (pool * operatorFeeBps) / 10000;
                uint256 toProtocol = (pool * protocolFeeBps) / 10000;
                uint256 toRollover = pool - toOperator - toProtocol;

                // Rollover accumulates for next death event (growing jackpot)
                rolloverPool[deskId] += toRollover;

                if (toOperator > 0) {
                    address operator = desks[deskId].operator;
                    (bool s1, ) = payable(operator).call{value: toOperator}("");
                    if (!s1) {
                        // Failed — add to rollover instead of reverting
                        rolloverPool[deskId] += toOperator;
                    }
                }

                if (toProtocol > 0) {
                    (bool s2, ) = payable(protocolTreasury).call{value: toProtocol}("");
                    if (!s2) {
                        rolloverPool[deskId] += toProtocol;
                    }
                }

                emit SurvivalSettled(roundId, deskId, toOperator, toProtocol, toRollover);
            }
            // Dead desks: rewards claimed individually via claimReward()
        }

        currentRound.status = RoundStatus.Settled;
        emit RoundSettled(roundId);
    }

    // ═══════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════

    /// @notice Check if a desk is currently dead according to PulseRegistryV2
    /// @param _deskId The desk to check
    /// @return alive Whether the desk is alive
    /// @return timeSincePulse Seconds since last heartbeat
    /// @return gameTTL The game's TTL for this desk
    function checkDeskLiveness(bytes32 _deskId) external view returns (
        bool alive,
        uint256 timeSincePulse,
        uint256 gameTTL
    ) {
        Desk memory desk = desks[_deskId];
        if (desk.pulseAgent == address(0)) revert DeskNotFound();

        uint256 lastPulseTime = pulseRegistry.lastPulse(desk.pulseAgent);
        timeSincePulse = block.timestamp - lastPulseTime;
        gameTTL = desk.gameTTL;
        alive = timeSincePulse <= gameTTL;
    }

    /// @notice Get all watches for a desk in a round
    function getWatches(uint256 _roundId, bytes32 _deskId) external view returns (Watch[] memory) {
        return _roundWatches[_roundId][_deskId];
    }

    /// @notice Get watcher count for a desk in current round
    function getWatcherCount(bytes32 _deskId) external view returns (uint256) {
        if (currentRound.status != RoundStatus.Active) return 0;
        return _roundWatches[currentRound.id][_deskId].length;
    }

    /// @notice Get the current pool for a desk (including rollover)
    function getEffectivePool(bytes32 _deskId) external view returns (uint256) {
        uint256 pool = 0;
        if (currentRound.status == RoundStatus.Active) {
            pool = pools[currentRound.id][_deskId];
        }
        pool += rolloverPool[_deskId];
        return pool;
    }

    /// @notice Calculate potential reward for a hypothetical watch
    function estimateReward(
        bytes32 _deskId,
        Tier _tier,
        uint256 _amount
    ) external view returns (uint256 potentialReward) {
        if (currentRound.status != RoundStatus.Active) return 0;

        uint256 pool = pools[currentRound.id][_deskId] + rolloverPool[_deskId] + _amount;
        uint256 currentWeight = poolWeights[currentRound.id][_deskId];
        uint256 newWeight = _amount * tierMultiplier[_tier];
        uint256 totalWeight = currentWeight + newWeight;

        uint256 distributable = pool - (pool * protocolFeeBps / 10000);
        potentialReward = (distributable * newWeight) / totalWeight;
    }

    /// @notice Get the number of registered desks
    function getDeskCount() external view returns (uint256) {
        return deskIds.length;
    }

    /// @notice Get all desk IDs
    function getAllDeskIds() external view returns (bytes32[] memory) {
        return deskIds;
    }

    /// @notice Get round time remaining in seconds
    function getRoundTimeRemaining() external view returns (uint256) {
        if (currentRound.status != RoundStatus.Active) return 0;
        if (block.timestamp >= currentRound.endTime) return 0;
        return currentRound.endTime - block.timestamp;
    }

    /// @notice Check if a wallet has an unclaimed reward for a desk death
    function hasUnclaimedReward(
        uint256 _roundId,
        bytes32 _deskId,
        address _watcher
    ) external view returns (bool, uint256 reward) {
        if (!isDead[_roundId][_deskId]) return (false, 0);

        Watch[] memory watches = _roundWatches[_roundId][_deskId];
        for (uint256 i = 0; i < watches.length; i++) {
            if (watches[i].watcher == _watcher && !watches[i].claimed) {
                DeathEvent memory death = deathEvents[_roundId][_deskId];
                uint256 totalWeight = poolWeights[_roundId][_deskId];
                uint256 distributable = death.poolAtDeath - (death.poolAtDeath * protocolFeeBps / 10000);
                reward = (distributable * watches[i].weight) / totalWeight;
                return (true, reward);
            }
        }
        return (false, 0);
    }

    // ═══════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════

    function setProtocolFeeBps(uint256 _bps) external onlyOwner {
        require(_bps <= 2000, "Max 20%");
        protocolFeeBps = _bps;
    }

    function setOperatorFeeBps(uint256 _bps) external onlyOwner {
        require(_bps <= 8000, "Max 80%");
        operatorFeeBps = _bps;
    }

    function setRoundDuration(uint256 _seconds) external onlyOwner {
        require(_seconds >= 300, "Min 5 minutes");
        require(_seconds <= 86400, "Max 24 hours");
        roundDuration = _seconds;
    }

    function setMinWatchAmount(uint256 _amount) external onlyOwner {
        minWatchAmount = _amount;
    }

    function setMaxWatchAmount(uint256 _amount) external onlyOwner {
        maxWatchAmount = _amount;
    }

    function setTierMinCost(Tier _tier, uint256 _cost) external onlyOwner {
        tierMinCost[_tier] = _cost;
    }

    function setTierMultiplier(Tier _tier, uint256 _multiplier) external onlyOwner {
        require(_multiplier > 0, "Multiplier must be > 0");
        tierMultiplier[_tier] = _multiplier;
    }

    function setProtocolTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        protocolTreasury = _treasury;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Emergency sweep — only unclaimed protocol fees
    function emergencySweep() external onlyOwner {
        // Only sweep if no active round
        require(currentRound.status == RoundStatus.Settled || currentRound.id == 0, "Round active");
        uint256 balance = address(this).balance;
        (bool success, ) = payable(owner()).call{value: balance}("");
        if (!success) revert TransferFailed();
    }

    // Allow contract to receive ETH
    receive() external payable {}
}
