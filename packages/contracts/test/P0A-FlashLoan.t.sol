// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

import "../contracts/PulseRegistryV2.sol";
import "../contracts/interfaces/IPulseRegistryV2.sol";
import "../contracts/interfaces/IAgentVerifiable.sol";

/**
 * @title MockPulseToken
 * @notice Mock ERC20 token for testing with mint capability
 */
contract MockPulseToken is ERC20, ERC20Burnable {
    constructor(uint256 initialSupply) ERC20("Pulse", "PULSE") {
        _mint(msg.sender, initialSupply);
    }
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/**
 * @title FlashLoanAttacker
 * @notice Simulates a flash loan contract that attempts to exploit staking
 * @dev This contract attempts the flash loan attack pattern:
 *      1. Receive flash loan
 *      2. Stake tokens to boost reliability score
 *      3. Call victim contract (gated by reliability)
 *      4. Attempt to unstake (should fail due to 7-day lockup)
 *      5. Repay flash loan
 */
contract FlashLoanAttacker {
    PulseRegistryV2 public registry;
    MockPulseToken public token;
    
    // Attack state
    bool public attackSucceeded;
    uint256 public scoreDuringAttack;
    string public failureReason;
    
    constructor(address _registry, address _token) {
        registry = PulseRegistryV2(_registry);
        token = MockPulseToken(_token);
    }
    
    /**
     * @notice Attempts the flash loan staking attack in a single transaction
     * @param amount The flash loan amount to stake
     * @return success Whether the attack succeeded
     * @return score The reliability score obtained during attack
     */
    function executeAttack(uint256 amount) external returns (bool success, uint256 score) {
        // Step 1: Stake the flash loaned tokens
        token.approve(address(registry), amount);
        registry.stake(amount);
        
        // Step 2: Check reliability score immediately (same block)
        score = registry.getReliabilityScore(address(this));
        scoreDuringAttack = score;
        
        // Step 3: Try to unstake immediately (should revert due to 7-day lockup)
        try registry.unstake(amount) {
            // If unstake succeeds, attack succeeded (funds can be returned)
            attackSucceeded = true;
            return (true, score);
        } catch Error(string memory reason) {
            // Expected: unstake should fail due to lockup
            failureReason = reason;
            attackSucceeded = false;
            return (false, score);
        } catch (bytes memory) {
            failureReason = "low-level revert";
            attackSucceeded = false;
            return (false, score);
        }
    }
    
    /**
     * @notice Attempts a "griefing" attack where stake is left locked
     * @dev Even if attacker can't recover funds, they might try to boost score
     *      and abandon the stake. This tests that score is 0 in same block.
     */
    function executeGriefingAttack(uint256 amount) external returns (uint256 score) {
        // Stake and check score
        token.approve(address(registry), amount);
        registry.stake(amount);
        
        score = registry.getReliabilityScore(address(this));
        scoreDuringAttack = score;
        
        // Don't try to unstake - just return the score
        return score;
    }
}

/**
 * @title P0A_FlashLoanTest
 * @notice Foundry test suite for P0-A: Flash Loan Staking vulnerability verification
 * @dev Confirms that existing 7-day lockup and durationDays flooring prevents
 *      flash loan staking attacks.
 */
contract P0A_FlashLoanTest is Test {
    PulseRegistryV2 public registry;
    MockPulseToken public token;
    FlashLoanAttacker public attacker;
    
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public flashLoanPool = address(0xF1A54);
    
    // Helper to get stakeStartTime from the agentExtensions tuple
    function _getStakeStartTime(address agent) internal view returns (uint256) {
        (, uint256 stakeStartTime, ) = registry.agentExtensions(agent);
        return stakeStartTime;
    }
    
    uint256 public constant TTL = 86400;
    uint256 public constant MIN_PULSE = 1e18;
    uint256 public constant STAKE_LOCKUP = 7 days;
    
    // Events
    event Staked(address indexed agent, uint256 amount, uint256 unlockTime);
    event Unstaked(address indexed agent, uint256 amount);
    event ReliabilityUpdate(address indexed agent, uint256 newScore, uint8 newTier);

    function setUp() public {
        // Deploy contracts
        uint256 initialSupply = 10_000_000e18;
        token = new MockPulseToken(initialSupply);
        registry = new PulseRegistryV2(address(token), TTL, MIN_PULSE);
        attacker = new FlashLoanAttacker(address(registry), address(token));
        
        // Fund test accounts
        token.transfer(alice, 100_000e18);
        token.transfer(bob, 100_000e18);
        token.transfer(flashLoanPool, 1_000_000e18);
        
        // Approve registry for test accounts
        vm.prank(alice);
        token.approve(address(registry), type(uint256).max);
        vm.prank(bob);
        token.approve(address(registry), type(uint256).max);
        vm.prank(flashLoanPool);
        token.approve(address(registry), type(uint256).max);
    }
    
    // ============ P0-A: Flash Loan Attack Simulation Tests ============
    
    /**
     * @notice TEST: Direct flash loan attack - stake, get score, unstake in one tx
     * @dev EXPECTED: unstake() reverts with StakeLockupActive
     */
    function test_FlashLoanAttack_RevertsOnUnstake() public {
        uint256 flashLoanAmount = 1_000_000e18;
        
        // Record state before attack
        uint256 poolBalanceBefore = token.balanceOf(flashLoanPool);
        
        // Simulate flash loan: pool sends tokens to attacker
        vm.prank(flashLoanPool);
        token.transfer(address(attacker), flashLoanAmount);
        
        // Execute attack
        (bool attackSucceeded, uint256 scoreDuringAttack) = attacker.executeAttack(flashLoanAmount);
        
        // ASSERTIONS
        
        // 1. Attack should fail (unstake reverted)
        assertFalse(attackSucceeded, "Attack should have failed due to lockup");
        
        // 2. Score should be 0 (durationDays floors to 0 in same block)
        assertEq(scoreDuringAttack, 0, "Score should be 0 when stakeStartTime == block.timestamp");
        
        // 3. Tokens should still be locked in registry
        assertEq(registry.stakedAmount(address(attacker)), flashLoanAmount, 
            "Stake should remain locked in registry");
        
        // 4. Unlock time should be 7 days in the future
        uint256 expectedUnlockTime = block.timestamp + STAKE_LOCKUP;
        assertEq(registry.stakeUnlockTime(address(attacker)), expectedUnlockTime,
            "Unlock time should be 7 days from now");
        
        // 5. Attacker cannot recover funds
        assertEq(token.balanceOf(address(attacker)), 0, "Attacker should have no tokens");
        
        // Log results
        emit log_named_string("Flash Loan Attack Result", "BLOCKED");
        emit log_named_string("Failure Reason", attacker.failureReason());
        emit log_named_uint("Score During Attack", scoreDuringAttack);
    }
    
    /**
     * @notice TEST: Griefing attack - stake large amount, check score, abandon
     * @dev EXPECTED: Score = 0 because durationDays = 0 in same block
     */
    function test_FlashLoanGriefingAttack_ScoreIsZero() public {
        uint256 flashLoanAmount = 1_000_000e18;
        
        // Fund attacker
        vm.prank(flashLoanPool);
        token.transfer(address(attacker), flashLoanAmount);
        
        // Execute griefing attack (stake but don't unstake)
        uint256 score = attacker.executeGriefingAttack(flashLoanAmount);
        
        // ASSERTION: Score must be 0
        assertEq(score, 0, "Score should be 0 for same-block stake (durationDays=0)");
        
        // Explanation: durationDays = (block.timestamp - stakeStartTime) / 86400 = 0
        // effective = (stakedAmount / 1e18) * 0 + 1 = 1
        // log2(1) = 0, so stakeScore = 0
        
        emit log_named_string("Griefing Attack Result", "INEFFECTIVE");
        emit log_named_uint("Score Obtained", score);
        emit log_named_string("Reason", "durationDays floors to 0 in same block");
    }
    
    /**
     * @notice TEST: Score progression over time - prove score only accrues after 1 day
     * @dev Demonstrates that stakeScore requires time to accumulate
     */
    function test_StakeScoreProgressionOverTime() public {
        uint256 stakeAmount = 100_000e18;
        
        // First pulse to be "alive"
        vm.prank(alice);
        registry.pulse(MIN_PULSE);
        
        // Stake (stakeAmount minus what was burned by pulse)
        vm.prank(alice);
        registry.stake(stakeAmount - MIN_PULSE);
        
        // Check score at various time intervals
        uint256 scoreDay0 = registry.getReliabilityScore(alice);
        
        // Warp 12 hours - still 0 days
        vm.warp(block.timestamp + 12 hours);
        uint256 score12h = registry.getReliabilityScore(alice);
        
        // Warp 1 day
        vm.warp(block.timestamp + 12 hours);
        uint256 score1d = registry.getReliabilityScore(alice);
        
        // Warp 7 days (lockup period)
        vm.warp(block.timestamp + 6 days);
        uint256 score7d = registry.getReliabilityScore(alice);
        
        // Warp 30 days
        vm.warp(block.timestamp + 23 days);
        uint256 score30d = registry.getReliabilityScore(alice);
        
        // Log progression
        emit log_named_uint("Score at T=0 (same block)", scoreDay0);
        emit log_named_uint("Score at T=12h", score12h);
        emit log_named_uint("Score at T=1d", score1d);
        emit log_named_uint("Score at T=7d", score7d);
        emit log_named_uint("Score at T=30d", score30d);
        
        // ASSERTIONS
        
        // At T=0: score should be minimal (just streak + volume)
        assertEq(scoreDay0, 2, "Day 0 score should be 2 (streak=1, volume=log2(2)=1, stake=0)");
        
        // At T<1d: stakeScore still 0
        assertEq(score12h, 2, "12h score should still be 2 (durationDays=0)");
        
        // At T=1d: stakeScore starts accruing
        // effective = 100 * 1 + 1 = 101, log2(101) ≈ 6
        assertGt(score1d, 2, "Day 1 score should include stake component");
        
        // Verify lockup still active at day 1
        vm.prank(alice);
        vm.expectRevert();
        registry.unstake(stakeAmount);
    }
    
    /**
     * @notice TEST: Cannot unstake during 7-day lockup period
     * @dev Verifies exact lockup enforcement at boundary conditions
     */
    function test_CannotUnstakeDuringLockup() public {
        uint256 stakeAmount = 100e18;
        
        vm.prank(alice);
        registry.stake(stakeAmount);
        
        uint256 unlockTime = registry.stakeUnlockTime(alice);
        
        // Try at various points during lockup
        for (uint256 i = 0; i < 7; i++) {
            vm.warp(block.timestamp + 1 days);
            
            bool canUnstake = block.timestamp >= unlockTime;
            
            if (!canUnstake) {
                vm.prank(alice);
                vm.expectRevert(
                    abi.encodeWithSelector(PulseRegistryV2.StakeLockupActive.selector, unlockTime)
                );
                registry.unstake(stakeAmount);
            }
        }
        
        // At day 7 (exact unlock time), contract uses strict `<` so unstake succeeds
        vm.warp(unlockTime);
        vm.prank(alice);
        registry.unstake(stakeAmount);
        
        assertEq(registry.stakedAmount(alice), 0, "Should be fully unstaked");
    }
    
    /**
     * @notice TEST: Multiple stakes extend lockup but don't reset duration for existing stake
     * @dev Verifies that additional staking doesn't unfairly benefit attacker
     */
    function test_AdditionalStakingWeightedAverage() public {
        uint256 initialStake = 100e18;
        
        // First pulse and stake
        vm.prank(alice);
        registry.pulse(MIN_PULSE);
        vm.prank(alice);
        registry.stake(initialStake);
        
        uint256 startTime1 = _getStakeStartTime(alice);
        
        // Warp 3 days
        vm.warp(block.timestamp + 3 days);
        
        // Record score before additional stake
        uint256 scoreBefore = registry.getReliabilityScore(alice);
        
        // Add more stake
        uint256 additionalStake = 200e18;
        vm.prank(alice);
        registry.stake(additionalStake);
        
        uint256 startTime2 = _getStakeStartTime(alice);
        
        // ASSERTIONS
        
        // 1. New start time should be weighted average (later than original but earlier than now)
        assertGt(startTime2, startTime1, "New start time should be after original");
        assertLt(startTime2, block.timestamp, "New start time should be before now");
        
        // 2. Score should not jump dramatically
        uint256 scoreAfter = registry.getReliabilityScore(alice);
        emit log_named_uint("Score before additional stake", scoreBefore);
        emit log_named_uint("Score after additional stake", scoreAfter);
        
        // Score should be reasonable (not maxed out instantly)
        assertLt(scoreAfter, 50, "Score should not be maxed out from stake alone");
        
        // 3. Lockup extended
        assertEq(registry.stakeUnlockTime(alice), block.timestamp + STAKE_LOCKUP,
            "Lockup should extend from new stake");
    }
    
    /**
     * @notice TEST: Maximum possible flash loan attack scenario
     * @dev Tests with astronomical amounts to prove score formula is resistant
     */
    function test_MaximumFlashLoanAttack() public {
        // Impossibly large amount (more than total supply of most tokens)
        uint256 massiveAmount = 1_000_000_000e18; // 1 billion tokens
        
        // Mint to flash loan pool
        token.mint(flashLoanPool, massiveAmount);
        
        // Fund attacker
        vm.prank(flashLoanPool);
        token.transfer(address(attacker), massiveAmount);
        
        // Execute attack
        uint256 score = attacker.executeGriefingAttack(massiveAmount);
        
        // ASSERTION: Even with massive amount, same-block score is still 0 for stake component
        assertEq(score, 0, "Massive same-block stake should still yield 0 score");
        
        // Warp 1 day to see potential maximum score
        vm.warp(block.timestamp + 1 days);
        
        uint256 score1d = registry.getReliabilityScore(address(attacker));
        
        // Even with 1B tokens staked for 1 day:
        // effective = 1e9 * 1 + 1 = 1e9 + 1
        // log2(1e9) ≈ 29.9, capped at 20
        // So max stake score is 20
        assertLe(score1d, 20, "Max stake score capped at 20");
        
        emit log_named_uint("Score with 1B tokens staked for 1 day", score1d);
    }
    
    /**
     * @notice TEST: Verify complete attack flow with all checks
     * @dev Comprehensive test of the entire flash loan attack surface
     */
    function test_CompleteFlashLoanAttackFlow() public {
        emit log_string("\n=== P0-A FLASH LOAN ATTACK SIMULATION ===\n");
        
        uint256 flashLoanAmount = 1_000_000e18;
        
        // STEP 1: Setup - Flash loan pool has liquidity
        token.mint(flashLoanPool, flashLoanAmount);
        uint256 poolBefore = token.balanceOf(flashLoanPool);
        
        emit log_named_uint("Flash loan amount", flashLoanAmount);
        emit log_named_uint("Pool balance before", poolBefore);
        
        // STEP 2: Execute flash loan
        vm.prank(flashLoanPool);
        token.transfer(address(attacker), flashLoanAmount);
        
        emit log_named_uint("Attacker balance", token.balanceOf(address(attacker)));
        
        // STEP 3: Attempt attack
        (bool success, uint256 score) = attacker.executeAttack(flashLoanAmount);
        
        // STEP 4: Verify attack failed
        assertFalse(success, "Attack must fail");
        assertEq(score, 0, "Score must be 0 in same block");
        
        emit log_named_string("Attack succeeded?", success ? "YES (VULNERABLE!)" : "NO (PROTECTED)");
        emit log_named_uint("Score obtained", score);
        emit log_named_string("Failure reason", attacker.failureReason());
        
        // STEP 5: Verify funds are locked
        uint256 lockedAmount = registry.stakedAmount(address(attacker));
        uint256 unlockTime = registry.stakeUnlockTime(address(attacker));
        
        emit log_named_uint("Locked amount", lockedAmount);
        emit log_named_uint("Unlock time (days from now)", (unlockTime - block.timestamp) / 1 days);
        
        assertEq(lockedAmount, flashLoanAmount, "Full amount should be locked");
        assertEq(unlockTime, block.timestamp + 7 days, "7-day lockup enforced");
        
        // STEP 6: Verify attacker cannot recover funds
        assertEq(token.balanceOf(address(attacker)), 0, "Attacker has no liquid tokens");
        
        emit log_string("\n=== P0-A VERIFICATION COMPLETE ===");
        emit log_string("Result: EXISTING LOCKUP MECHANISM IS SUFFICIENT");
        emit log_string("- 7-day lockup prevents same-block unstake");
        emit log_string("- durationDays flooring prevents same-block score");
        emit log_string("- Attacker loses access to flash loaned funds for 7 days");
    }
    
    /**
     * @notice TEST: Edge case - stake exactly at day boundary
     * @dev Ensures no off-by-one errors in duration calculation
     */
    function test_StakeAtDayBoundary() public {
        // Pulse so agent is alive
        vm.prank(alice);
        registry.pulse(MIN_PULSE);

        // Stake immediately after pulse
        vm.prank(alice);
        registry.stake(100e18);

        // Same-block: durationDays = 0, so stakeScore = log2(1) = 0
        uint256 baseScore = registry.getReliabilityScore(alice);

        // Warp 1 day — still within TTL (pulse was at t=1, TTL=86400, alive until t=86401)
        vm.warp(block.timestamp + 1 days);

        // Agent might be dead at this point (TTL expiry), pulse to stay alive
        vm.prank(alice);
        registry.pulse(MIN_PULSE);

        uint256 scoreAfterOneDay = registry.getReliabilityScore(alice);

        // durationDays >= 1 now, stakeScore > 0 (plus streak may have grown)
        assertGt(scoreAfterOneDay, baseScore, "Score after 1 day should exceed base score");
    }
}
