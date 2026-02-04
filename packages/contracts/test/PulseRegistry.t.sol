// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";

import { PulseRegistry } from "../contracts/PulseRegistry.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";

contract PulseRegistryTest is Test {
    PulseRegistry registry;
    MockERC20 token;

    address alice = address(0xA11CE);
    address sink = address(0x000000000000000000000000000000000000dEaD);

    uint256 ttl = 86400;
    uint256 minPulse = 1e18;

    function setUp() public {
        token = new MockERC20("Pulse", "PULSE");
        registry = new PulseRegistry(address(token), sink, ttl, minPulse);

        token.mint(alice, 10e18);
        vm.startPrank(alice);
        token.approve(address(registry), type(uint256).max);
        vm.stopPrank();
    }

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
}
