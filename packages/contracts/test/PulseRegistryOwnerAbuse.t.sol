// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";

import { PulseRegistry } from "../contracts/PulseRegistry.sol";
import { RealPulseToken } from "./helpers/RealPulseToken.sol";

/**
 * @title PulseRegistryOwnerAbuseTest
 * @notice Demonstrates owner-parameter side effects (TTL changes + pause) that can retroactively
 *         kill or resurrect agents. These are design risks, not reentrancy bugs.
 */
contract PulseRegistryOwnerAbuseTest is Test {
    PulseRegistry registry;
    RealPulseToken token;

    address alice = address(0xA11CE);
    address sink = address(0x000000000000000000000000000000000000dEaD);

    uint256 ttl = 1 days;
    uint256 minPulse = 1e18;

    function setUp() public {
        uint256 initialSupply = 1_000_000e18;
        token = new RealPulseToken("Pulse", "PULSE", initialSupply, address(this));
        registry = new PulseRegistry(address(token), sink, ttl, minPulse);

        token.transfer(alice, 100e18);
        vm.prank(alice);
        token.approve(address(registry), type(uint256).max);
    }

    function testTTLReductionRetroactivelyKillsAgent() public {
        vm.prank(alice);
        registry.pulse(minPulse);

        // Agent is alive under original TTL
        vm.warp(block.timestamp + 1 hours);
        assertTrue(registry.isAlive(alice));

        // Owner reduces TTL to 1 second — retroactively kills agent
        registry.setTTL(1);
        assertFalse(registry.isAlive(alice));
    }

    function testTTLIncreaseResurrectsAgent() public {
        vm.prank(alice);
        registry.pulse(minPulse);

        // Let TTL expire
        vm.warp(block.timestamp + ttl + 1);
        assertFalse(registry.isAlive(alice));

        // Owner increases TTL — agent becomes alive again
        registry.setTTL(registry.MAX_TTL());
        assertTrue(registry.isAlive(alice));
    }

    function testPauseDoesNotFreezeTTL() public {
        vm.prank(alice);
        registry.pulse(minPulse);

        registry.pause();

        // Even while paused, TTL continues to elapse
        vm.warp(block.timestamp + ttl + 1);
        assertFalse(registry.isAlive(alice));
    }
}
