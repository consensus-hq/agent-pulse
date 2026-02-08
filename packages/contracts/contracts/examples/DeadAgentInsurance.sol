// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IPulseRegistry.sol";

/**
 * @title DeadAgentInsurance
 * @author Agent Pulse — Example Contract
 * @notice A peer-to-peer insurance pool where users stake PULSE against agent
 *         downtime. If the insured agent misses enough consecutive pulses
 *         (goes "dead"), stakers can claim the insurance pool.
 *
 * @dev **Pattern demonstrated: Reading PulseRegistry Timestamps**
 *
 *      This contract treats PulseRegistry as a decentralised dead-man's-switch.
 *      It reads `lastPulseAt` and `ttlSeconds` to compute how many consecutive
 *      TTL windows the agent has missed, and triggers payouts when the
 *      configured threshold is exceeded.
 *
 *      Key integration points:
 *        • `IPulseRegistry.getAgentStatus()` — read lastPulseAt
 *        • `IPulseRegistry.ttlSeconds()` — compute missed windows
 *        • `IPulseRegistry.isAlive()` — quick liveness check
 *
 *      Default addresses (Base mainnet):
 *        PulseRegistry  0xe61C615743A02983A46aFF66Db035297e8a43846
 *        PulseToken      0x21111B39A502335aC7e45c4574Dd083A69258b07
 *
 * @custom:security-considerations
 *      - Insurance pools are per-agent; stakers choose which agent to insure.
 *      - Funds can only move out via `claim()` after the dead threshold is met.
 *      - Stakers can unstake at any time BEFORE the agent dies (no lock-up).
 *      - Once a pool is resolved (agent dies and claim executes), it is settled.
 *      - A new pool can be created for the same agent after settlement.
 */
contract DeadAgentInsurance is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Types ────────────────────────────────────────────────────────

    /// @notice State of an insurance pool.
    enum PoolStatus {
        Active,   // accepting stakes
        Claimable, // agent died, not yet claimed
        Settled   // funds distributed
    }

    /// @notice Per-agent insurance pool.
    struct Pool {
        uint256 totalStaked;      // total PULSE staked into this pool
        uint256 createdAt;        // block.timestamp of pool creation
        PoolStatus status;
    }

    // ─── State ────────────────────────────────────────────────────────

    /// @notice PulseRegistry used for liveness checks.
    IPulseRegistry public immutable pulseRegistry;

    /// @notice The PULSE ERC-20 token staked into pools.
    IERC20 public immutable pulseToken;

    /// @notice Number of consecutive missed TTL windows required to trigger a claim.
    uint256 public immutable missedWindowsThreshold;

    /// @notice poolId ⇒ Pool metadata.
    mapping(uint256 => Pool) public pools;

    /// @notice poolId ⇒ insured agent address.
    mapping(uint256 => address) public poolAgent;

    /// @notice poolId ⇒ staker ⇒ amount staked.
    mapping(uint256 => mapping(address => uint256)) public stakes;

    /// @notice Auto-incrementing pool ID counter.
    uint256 public nextPoolId;

    // ─── Errors ───────────────────────────────────────────────────────

    error PoolNotActive(uint256 poolId);
    error PoolNotClaimable(uint256 poolId);
    error AgentStillAlive(address agent);
    error AgentNeverPulsed(address agent);
    error NotEnoughMissedWindows(uint256 missed, uint256 required);
    error NothingStaked(uint256 poolId, address staker);
    error ZeroAmount();

    // ─── Events ───────────────────────────────────────────────────────

    /// @notice Emitted when a new insurance pool is opened.
    event PoolCreated(uint256 indexed poolId, address indexed agent, address indexed creator);

    /// @notice Emitted when someone stakes into a pool.
    event Staked(uint256 indexed poolId, address indexed staker, uint256 amount);

    /// @notice Emitted when someone unstakes from an active pool.
    event Unstaked(uint256 indexed poolId, address indexed staker, uint256 amount);

    /// @notice Emitted when a pool transitions to Claimable.
    event AgentDeclaredDead(uint256 indexed poolId, address indexed agent, uint256 missedWindows);

    /// @notice Emitted when a staker claims their share of the settled pool.
    event Claimed(uint256 indexed poolId, address indexed staker, uint256 amount);

    // ─── Constructor ──────────────────────────────────────────────────

    /**
     * @notice Deploy a new DeadAgentInsurance contract.
     * @param pulseRegistry_         Address of the PulseRegistry.
     * @param pulseToken_            Address of the PULSE ERC-20 token.
     * @param missedWindowsThreshold_ Number of missed TTL windows to trigger payout (e.g. 3).
     */
    constructor(
        address pulseRegistry_,
        address pulseToken_,
        uint256 missedWindowsThreshold_
    ) {
        require(pulseRegistry_ != address(0), "zero registry");
        require(pulseToken_ != address(0), "zero token");
        require(missedWindowsThreshold_ > 0, "zero threshold");
        pulseRegistry = IPulseRegistry(pulseRegistry_);
        pulseToken = IERC20(pulseToken_);
        missedWindowsThreshold = missedWindowsThreshold_;
    }

    // ─── Pool Management ──────────────────────────────────────────────

    /**
     * @notice Open a new insurance pool for an agent.
     * @param agent The agent address to insure against downtime.
     * @return poolId The ID of the newly created pool.
     */
    function createPool(address agent) external returns (uint256 poolId) {
        require(agent != address(0), "zero agent");
        poolId = nextPoolId++;
        pools[poolId] = Pool({
            totalStaked: 0,
            createdAt: block.timestamp,
            status: PoolStatus.Active
        });
        poolAgent[poolId] = agent;
        emit PoolCreated(poolId, agent, msg.sender);
    }

    /**
     * @notice Stake PULSE into an active insurance pool.
     * @param poolId The pool to stake into.
     * @param amount Amount of PULSE to stake.
     */
    function stake(uint256 poolId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Pool storage pool = pools[poolId];
        if (pool.status != PoolStatus.Active) revert PoolNotActive(poolId);

        stakes[poolId][msg.sender] += amount;
        pool.totalStaked += amount;

        pulseToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(poolId, msg.sender, amount);
    }

    /**
     * @notice Withdraw staked PULSE from an active pool (before agent dies).
     * @param poolId The pool to unstake from.
     * @param amount Amount of PULSE to withdraw.
     */
    function unstake(uint256 poolId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Pool storage pool = pools[poolId];
        if (pool.status != PoolStatus.Active) revert PoolNotActive(poolId);

        uint256 staked = stakes[poolId][msg.sender];
        if (staked < amount) revert NothingStaked(poolId, msg.sender);

        stakes[poolId][msg.sender] = staked - amount;
        pool.totalStaked -= amount;

        pulseToken.safeTransfer(msg.sender, amount);
        emit Unstaked(poolId, msg.sender, amount);
    }

    // ─── Dead Agent Detection ─────────────────────────────────────────

    /**
     * @notice Calculate the number of consecutive TTL windows an agent has missed.
     * @dev    missedWindows = (block.timestamp − lastPulseAt) / ttlSeconds.
     *         Returns 0 if the agent is still alive (within current TTL).
     * @param agent The agent to check.
     * @return missedWindows Number of full TTL windows elapsed since last pulse.
     */
    function getMissedWindows(address agent) public view returns (uint256 missedWindows) {
        (, uint256 lastPulseAt, , ) = pulseRegistry.getAgentStatus(agent);
        if (lastPulseAt == 0) revert AgentNeverPulsed(agent);

        uint256 ttl = pulseRegistry.ttlSeconds();
        uint256 elapsed = block.timestamp - lastPulseAt;

        // If still within the first TTL window, agent is alive — 0 missed windows.
        if (elapsed <= ttl) return 0;

        missedWindows = elapsed / ttl;
    }

    /**
     * @notice Declare an agent dead and transition the pool to Claimable.
     * @dev    Anyone can call this (permissionless dead-man's switch trigger).
     * @param poolId The pool whose agent to check.
     */
    function declareAgentDead(uint256 poolId) external {
        Pool storage pool = pools[poolId];
        if (pool.status != PoolStatus.Active) revert PoolNotActive(poolId);

        address agent = poolAgent[poolId];
        uint256 missed = getMissedWindows(agent);
        if (missed < missedWindowsThreshold) {
            revert NotEnoughMissedWindows(missed, missedWindowsThreshold);
        }

        pool.status = PoolStatus.Claimable;
        emit AgentDeclaredDead(poolId, agent, missed);
    }

    /**
     * @notice Claim your proportional share of the insurance pool.
     * @dev    Only callable after `declareAgentDead` transitions pool to Claimable.
     *         Each staker receives (theirStake / totalStaked) × totalStaked = theirStake.
     *         Pool transitions to Settled once a claim is processed.
     * @param poolId The pool to claim from.
     */
    function claim(uint256 poolId) external nonReentrant {
        Pool storage pool = pools[poolId];
        if (pool.status != PoolStatus.Claimable) revert PoolNotClaimable(poolId);

        uint256 staked = stakes[poolId][msg.sender];
        if (staked == 0) revert NothingStaked(poolId, msg.sender);

        // Zero out staker's position (CEI pattern).
        stakes[poolId][msg.sender] = 0;

        // If this was the last claim, settle the pool.
        pool.totalStaked -= staked;
        if (pool.totalStaked == 0) {
            pool.status = PoolStatus.Settled;
        }

        pulseToken.safeTransfer(msg.sender, staked);
        emit Claimed(poolId, msg.sender, staked);
    }
}
