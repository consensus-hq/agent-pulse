// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";

import { PulseRegistry } from "../contracts/PulseRegistry.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";

contract PulseRegistryTest is Test {
    PulseRegistry registry;
    MockERC20 token;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address sink = address(0x000000000000000000000000000000000000dEaD);

    uint256 ttl = 86400;
    uint256 minPulse = 1e18;

    function setUp() public {
        token = new MockERC20("Pulse", "PULSE");
        registry = new PulseRegistry(address(token), sink, ttl, minPulse);

        token.mint(alice, 100e18);
        token.mint(bob, 100e18);

        vm.startPrank(alice);
        token.approve(address(registry), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(bob);
        token.approve(address(registry), type(uint256).max);
        vm.stopPrank();
    }

    // ============ Original Tests ============

    function testFirstPulseSetsStreak() public {
        vm.startPrank(alice);
        registry.pulse(minPulse);
        vm.stopPrank();

        (uint64 lastPulseAt, uint32 streak, uint32 lastStreakDay, uint8 hazardScore) = registry.agents(alice);
        assertGt(lastPulseAt, 0);
        assertEq(streak, 1);
        assertEq(lastStreakDay, uint32(block.timestamp / 86400));
        assertEq(hazardScore, 0);
    }

    function testSameDayPulseKeepsStreak() public {
        vm.startPrank(alice);
        registry.pulse(minPulse);
        registry.pulse(minPulse);
        vm.stopPrank();

        (, uint32 streak,,) = registry.agents(alice);
        assertEq(streak, 1);
    }

    function testNextDayIncrementsStreak() public {
        vm.startPrank(alice);
        registry.pulse(minPulse);
        vm.stopPrank();

        vm.warp(block.timestamp + 1 days);

        vm.startPrank(alice);
        registry.pulse(minPulse);
        vm.stopPrank();

        (, uint32 streak,,) = registry.agents(alice);
        assertEq(streak, 2);
    }

    function testGapResetsStreak() public {
        vm.startPrank(alice);
        registry.pulse(minPulse);
        vm.stopPrank();

        vm.warp(block.timestamp + 2 days);

        vm.startPrank(alice);
        registry.pulse(minPulse);
        vm.stopPrank();

        (, uint32 streak,,) = registry.agents(alice);
        assertEq(streak, 1);
    }

    function testIsAliveTTL() public {
        bool aliveBefore = registry.isAlive(alice);
        assertFalse(aliveBefore);

        vm.startPrank(alice);
        registry.pulse(minPulse);
        vm.stopPrank();

        bool aliveAfter = registry.isAlive(alice);
        assertTrue(aliveAfter);

        vm.warp(block.timestamp + ttl + 1);
        bool aliveExpired = registry.isAlive(alice);
        assertFalse(aliveExpired);
    }

    function testBelowMinimumPulseReverts() public {
        vm.startPrank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                PulseRegistry.BelowMinimumPulse.selector,
                minPulse - 1,
                minPulse
            )
        );
        registry.pulse(minPulse - 1);
        vm.stopPrank();
    }

    function testUpdateHazard() public {
        registry.updateHazard(alice, 55);
        (,,, uint8 hazardScore) = registry.agents(alice);
        assertEq(hazardScore, 55);
    }

    function testUpdateHazardInvalidReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                PulseRegistry.InvalidHazardScore.selector,
                101,
                100
            )
        );
        registry.updateHazard(alice, 101);
    }

    function testPauseBlocksPulse() public {
        registry.pause();
        vm.startPrank(alice);
        vm.expectRevert();
        registry.pulse(minPulse);
        vm.stopPrank();
    }

    // ============ Audit I-04: Fuzz Tests ============

    function testFuzzPulseAmount(uint256 amount) public {
        // Bound to valid range: minPulse <= amount <= alice balance
        amount = bound(amount, minPulse, 100e18);

        vm.startPrank(alice);
        registry.pulse(amount);
        vm.stopPrank();

        (uint64 lastPulseAt, uint32 streak,,) = registry.agents(alice);
        assertGt(lastPulseAt, 0);
        assertEq(streak, 1);

        // Verify tokens moved to sink
        assertEq(token.balanceOf(sink), amount);
    }

    function testFuzzBelowMinPulseReverts(uint256 amount) public {
        amount = bound(amount, 0, minPulse - 1);

        vm.startPrank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                PulseRegistry.BelowMinimumPulse.selector,
                amount,
                minPulse
            )
        );
        registry.pulse(amount);
        vm.stopPrank();
    }

    // ============ Audit I-04: Access Control Tests ============

    function testSetTTLOnlyOwner() public {
        vm.startPrank(alice);
        vm.expectRevert();
        registry.setTTL(3600);
        vm.stopPrank();
    }

    function testSetMinPulseOnlyOwner() public {
        vm.startPrank(alice);
        vm.expectRevert();
        registry.setMinPulseAmount(2e18);
        vm.stopPrank();
    }

    function testUpdateHazardOnlyOwner() public {
        vm.startPrank(alice);
        vm.expectRevert();
        registry.updateHazard(bob, 50);
        vm.stopPrank();
    }

    function testPauseOnlyOwner() public {
        vm.startPrank(alice);
        vm.expectRevert();
        registry.pause();
        vm.stopPrank();
    }

    function testUnpauseOnlyOwner() public {
        registry.pause();
        vm.startPrank(alice);
        vm.expectRevert();
        registry.unpause();
        vm.stopPrank();
    }

    // ============ Audit M-02: Upper Bound Tests ============

    function testSetTTLUpperBound() public {
        // Should revert if TTL exceeds MAX_TTL (30 days)
        vm.expectRevert(PulseRegistry.InvalidTTL.selector);
        registry.setTTL(31 days);
    }

    function testSetTTLAtMaxIsOk() public {
        registry.setTTL(30 days);
        assertEq(registry.ttlSeconds(), 30 days);
    }

    function testSetMinPulseUpperBound() public {
        // Should revert if minPulse exceeds MAX_MIN_PULSE (1000e18)
        vm.expectRevert(PulseRegistry.InvalidMinPulseAmount.selector);
        registry.setMinPulseAmount(1001e18);
    }

    function testSetMinPulseAtMaxIsOk() public {
        registry.setMinPulseAmount(1000e18);
        assertEq(registry.minPulseAmount(), 1000e18);
    }

    function testSetTTLZeroReverts() public {
        vm.expectRevert(PulseRegistry.InvalidTTL.selector);
        registry.setTTL(0);
    }

    function testSetMinPulseZeroReverts() public {
        vm.expectRevert(PulseRegistry.InvalidMinPulseAmount.selector);
        registry.setMinPulseAmount(0);
    }

    // ============ Audit L-03: Ownable2Step Tests ============

    function testOwnable2StepTransfer() public {
        // transferOwnership should set pending owner (not transfer immediately)
        registry.transferOwnership(alice);

        // Owner should still be deployer (this contract)
        assertEq(registry.owner(), address(this));

        // Alice must accept
        vm.startPrank(alice);
        registry.acceptOwnership();
        vm.stopPrank();

        assertEq(registry.owner(), alice);
    }

    function testOwnable2StepPendingOwnerCannotActBeforeAccept() public {
        registry.transferOwnership(alice);

        // Alice cannot use admin functions until she accepts
        vm.startPrank(alice);
        vm.expectRevert();
        registry.setTTL(7200);
        vm.stopPrank();
    }

    // ============ Audit I-04: Edge Case Tests ============

    function testPulseAtDayBoundary() public {
        // Warp to exactly a day boundary
        uint256 dayBoundary = (block.timestamp / 86400 + 1) * 86400;
        vm.warp(dayBoundary);

        vm.startPrank(alice);
        registry.pulse(minPulse);
        vm.stopPrank();

        (, uint32 streak, uint32 lastStreakDay,) = registry.agents(alice);
        assertEq(streak, 1);
        assertEq(lastStreakDay, uint32(dayBoundary / 86400));

        // Pulse 1 second before next day
        vm.warp(dayBoundary + 86399);
        vm.startPrank(alice);
        registry.pulse(minPulse);
        vm.stopPrank();

        (, streak,,) = registry.agents(alice);
        assertEq(streak, 1); // Same day, streak unchanged
    }

    function testIsAliveAtExactTTLBoundary() public {
        vm.startPrank(alice);
        registry.pulse(minPulse);
        vm.stopPrank();

        uint256 pulseTime = block.timestamp;

        // At exactly TTL boundary: should be alive
        vm.warp(pulseTime + ttl);
        assertTrue(registry.isAlive(alice));

        // One second past TTL: should be dead
        vm.warp(pulseTime + ttl + 1);
        assertFalse(registry.isAlive(alice));
    }

    function testPulseInsufficientBalance() public {
        address broke = address(0xDEAD1);
        vm.startPrank(broke);
        token.approve(address(registry), type(uint256).max);
        vm.expectRevert(); // SafeERC20 will revert
        registry.pulse(minPulse);
        vm.stopPrank();
    }

    function testPulseNoApproval() public {
        address unapproved = address(0xDEAD2);
        token.mint(unapproved, 10e18);
        vm.startPrank(unapproved);
        // No approval
        vm.expectRevert(); // SafeERC20 will revert
        registry.pulse(minPulse);
        vm.stopPrank();
    }

    function testMultipleAgentsIndependent() public {
        vm.prank(alice);
        registry.pulse(minPulse);

        vm.prank(bob);
        registry.pulse(minPulse);

        // Both alive
        assertTrue(registry.isAlive(alice));
        assertTrue(registry.isAlive(bob));

        // Alice expires, Bob still alive (pulse later)
        vm.warp(block.timestamp + ttl + 1);
        assertFalse(registry.isAlive(alice));
        assertFalse(registry.isAlive(bob));

        // Only Bob pulses again
        vm.prank(bob);
        registry.pulse(minPulse);
        assertFalse(registry.isAlive(alice));
        assertTrue(registry.isAlive(bob));
    }

    function testGetAgentStatusReturnsCorrect() public {
        vm.prank(alice);
        registry.pulse(minPulse);

        (bool alive, uint256 lastPulseAt, uint256 streak, uint256 hazardScore) = registry.getAgentStatus(alice);
        assertTrue(alive);
        assertEq(lastPulseAt, block.timestamp);
        assertEq(streak, 1);
        assertEq(hazardScore, 0);

        // Unregistered agent
        (bool alive2,,,) = registry.getAgentStatus(address(0x999));
        assertFalse(alive2);
    }

    function testUnpauseReenablesPulse() public {
        registry.pause();

        vm.startPrank(alice);
        vm.expectRevert();
        registry.pulse(minPulse);
        vm.stopPrank();

        registry.unpause();

        vm.startPrank(alice);
        registry.pulse(minPulse);
        vm.stopPrank();

        assertTrue(registry.isAlive(alice));
    }

    // ============ Constructor Validation Tests ============

    function testConstructorZeroTokenReverts() public {
        vm.expectRevert(PulseRegistry.ZeroAddress.selector);
        new PulseRegistry(address(0), sink, ttl, minPulse);
    }

    function testConstructorZeroSinkReverts() public {
        vm.expectRevert(PulseRegistry.ZeroAddress.selector);
        new PulseRegistry(address(token), address(0), ttl, minPulse);
    }

    function testConstructorZeroTTLReverts() public {
        vm.expectRevert(PulseRegistry.InvalidTTL.selector);
        new PulseRegistry(address(token), sink, 0, minPulse);
    }

    function testConstructorExcessiveTTLReverts() public {
        vm.expectRevert(PulseRegistry.InvalidTTL.selector);
        new PulseRegistry(address(token), sink, 31 days, minPulse);
    }

    function testConstructorZeroMinPulseReverts() public {
        vm.expectRevert(PulseRegistry.InvalidMinPulseAmount.selector);
        new PulseRegistry(address(token), sink, ttl, 0);
    }

    function testConstructorExcessiveMinPulseReverts() public {
        vm.expectRevert(PulseRegistry.InvalidMinPulseAmount.selector);
        new PulseRegistry(address(token), sink, ttl, 1001e18);
    }

    // ============ Streak Edge Cases ============

    function testLongStreakBuildup() public {
        vm.startPrank(alice);
        for (uint256 i = 0; i < 10; i++) {
            registry.pulse(minPulse);
            vm.warp(block.timestamp + 1 days);
        }
        vm.stopPrank();

        (, uint32 streak,,) = registry.agents(alice);
        assertEq(streak, 10);
    }

    function testStreakResetAfterLongGap() public {
        // Build a 5-day streak
        vm.startPrank(alice);
        for (uint256 i = 0; i < 5; i++) {
            registry.pulse(minPulse);
            vm.warp(block.timestamp + 1 days);
        }
        vm.stopPrank();

        (, uint32 streak,,) = registry.agents(alice);
        assertEq(streak, 5);

        // Gap of 30 days
        vm.warp(block.timestamp + 30 days);

        vm.prank(alice);
        registry.pulse(minPulse);

        (, streak,,) = registry.agents(alice);
        assertEq(streak, 1); // Reset
    }

    // ============ Token Balance Verification ============

    function testTokensAreSentToSink() public {
        uint256 sinkBefore = token.balanceOf(sink);
        uint256 aliceBefore = token.balanceOf(alice);

        vm.prank(alice);
        registry.pulse(2e18);

        assertEq(token.balanceOf(sink), sinkBefore + 2e18);
        assertEq(token.balanceOf(alice), aliceBefore - 2e18);
    }
}
