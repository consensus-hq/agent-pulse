// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IPulseRegistry.sol";

/**
 * @title LivenessGatedVault
 * @author Agent Pulse — Example Contract
 * @notice An ERC-4626 tokenised vault that restricts deposits and withdrawals
 *         to agents whose on-chain pulse streak is at least `minStreak`.
 *
 * @dev **Pattern demonstrated: Liveness as Access Control**
 *
 *      This contract shows how any DeFi primitive can gate participation on
 *      Agent Pulse liveness data. The PulseRegistry is treated as a read-only
 *      oracle — no PULSE tokens are transferred here.
 *
 *      Key integration points:
 *        • `IPulseRegistry.getAgentStatus()` — read streak
 *        • `IPulseRegistry.isAlive()` — verify TTL freshness
 *
 *      Default addresses (Base mainnet):
 *        PulseRegistry  0xe61C615743A02983A46aFF66Db035297e8a43846
 *        PulseToken      0x21111B39A502335aC7e45c4574Dd083A69258b07
 *
 * @custom:security-considerations
 *      - The vault inherits ERC-4626 rounding behaviour from OpenZeppelin.
 *      - Streak can drop to zero if an agent stops pulsing; callers should
 *        monitor their own streak off-chain and pulse before interacting.
 *      - `minStreak` is immutable to prevent governance rug-pulls.
 */
contract LivenessGatedVault is ERC4626, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── State ────────────────────────────────────────────────────────
    /// @notice PulseRegistry used for liveness checks.
    IPulseRegistry public immutable pulseRegistry;

    /// @notice Minimum consecutive-day streak required to deposit or withdraw.
    uint256 public immutable minStreak;

    // ─── Errors ───────────────────────────────────────────────────────
    /// @notice Thrown when an agent's streak is below the minimum.
    /// @param agent   The caller.
    /// @param streak  The caller's current streak.
    /// @param required The minimum streak.
    error InsufficientStreak(address agent, uint256 streak, uint256 required);

    /// @notice Thrown when the agent is not alive (TTL expired).
    /// @param agent The caller whose pulse has expired.
    error AgentNotAlive(address agent);

    // ─── Events ───────────────────────────────────────────────────────
    /// @notice Emitted when a deposit passes the liveness gate.
    event LivenessGatedDeposit(address indexed agent, uint256 assets, uint256 streak);

    /// @notice Emitted when a withdrawal passes the liveness gate.
    event LivenessGatedWithdraw(address indexed agent, uint256 assets, uint256 streak);

    // ─── Constructor ──────────────────────────────────────────────────
    /**
     * @notice Deploy a new LivenessGatedVault.
     * @param asset_        The underlying ERC-20 asset (e.g. PULSE token).
     * @param name_         ERC-20 share token name.
     * @param symbol_       ERC-20 share token symbol.
     * @param pulseRegistry_ Address of the PulseRegistry contract.
     * @param minStreak_    Minimum streak required for deposits / withdrawals.
     */
    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        address pulseRegistry_,
        uint256 minStreak_
    ) ERC4626(asset_) ERC20(name_, symbol_) {
        require(pulseRegistry_ != address(0), "zero registry");
        require(minStreak_ > 0, "zero streak");
        pulseRegistry = IPulseRegistry(pulseRegistry_);
        minStreak = minStreak_;
    }

    // ─── Internal Hooks ───────────────────────────────────────────────
    /**
     * @dev Gate check: caller must be alive AND have streak >= minStreak.
     *      Reverts with descriptive errors.
     */
    function _requireLiveness(address caller) internal view {
        (bool alive, , uint256 streak, ) = pulseRegistry.getAgentStatus(caller);
        if (!alive) revert AgentNotAlive(caller);
        if (streak < minStreak) revert InsufficientStreak(caller, streak, minStreak);
    }

    // ─── ERC-4626 Overrides ───────────────────────────────────────────

    /// @inheritdoc ERC4626
    function deposit(uint256 assets, address receiver)
        public
        override
        nonReentrant
        returns (uint256)
    {
        _requireLiveness(msg.sender);
        (, , uint256 streak, ) = pulseRegistry.getAgentStatus(msg.sender);
        emit LivenessGatedDeposit(msg.sender, assets, streak);
        return super.deposit(assets, receiver);
    }

    /// @inheritdoc ERC4626
    function mint(uint256 shares, address receiver)
        public
        override
        nonReentrant
        returns (uint256)
    {
        _requireLiveness(msg.sender);
        return super.mint(shares, receiver);
    }

    /// @inheritdoc ERC4626
    function withdraw(uint256 assets, address receiver, address owner_)
        public
        override
        nonReentrant
        returns (uint256)
    {
        _requireLiveness(msg.sender);
        (, , uint256 streak, ) = pulseRegistry.getAgentStatus(msg.sender);
        emit LivenessGatedWithdraw(msg.sender, assets, streak);
        return super.withdraw(assets, receiver, owner_);
    }

    /// @inheritdoc ERC4626
    function redeem(uint256 shares, address receiver, address owner_)
        public
        override
        nonReentrant
        returns (uint256)
    {
        _requireLiveness(msg.sender);
        return super.redeem(shares, receiver, owner_);
    }
}
