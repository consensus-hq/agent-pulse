// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {DeskWatchGame} from "../contracts/DeskWatchGame.sol";
import {DeskWatchLens} from "../contracts/DeskWatchLens.sol";

/// @notice Mock PulseRegistryV2 for testing
contract MockPulseRegistry {
    mapping(address => uint256) public lastPulse;
    mapping(address => uint256) public ttl;
    mapping(address => bool) public isRegistered;

    function setAgent(address agent, uint256 _ttl) external {
        isRegistered[agent] = true;
        ttl[agent] = _ttl;
        lastPulse[agent] = block.timestamp;
    }

    function pulse(address agent) external {
        lastPulse[agent] = block.timestamp;
    }

    function setLastPulse(address agent, uint256 ts) external {
        lastPulse[agent] = ts;
    }

    function isAlive(address agent) external view returns (bool) {
        return block.timestamp - lastPulse[agent] <= ttl[agent];
    }
}

contract DeskWatchGameTest is Test {
    DeskWatchGame public game;
    DeskWatchLens public lens;
    MockPulseRegistry public registry;

    address treasury = makeAddr("treasury");
    address deployer = makeAddr("deployer");

    // Desk agents
    address vcAgent = makeAddr("volatilityCult");
    address cbAgent = makeAddr("coldBlood");
    address pgAgent = makeAddr("phantomGrid");

    // Desk operators
    address vcOperator = makeAddr("vcOperator");
    address cbOperator = makeAddr("cbOperator");
    address pgOperator = makeAddr("pgOperator");

    // Players
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    bytes32 vcDeskId;
    bytes32 cbDeskId;
    bytes32 pgDeskId;

    function setUp() public {
        vm.startPrank(deployer);

        // Deploy mock registry
        registry = new MockPulseRegistry();
        registry.setAgent(vcAgent, 600);   // 10 min protocol TTL
        registry.setAgent(cbAgent, 900);   // 15 min protocol TTL
        registry.setAgent(pgAgent, 300);   // 5 min protocol TTL

        // Deploy game
        game = new DeskWatchGame(address(registry), treasury);
        lens = new DeskWatchLens();

        // Register desks
        game.registerDesk("Volatility Cult", vcAgent, vcOperator, 300);  // 5 min game TTL
        game.registerDesk("Cold Blood", cbAgent, cbOperator, 420);       // 7 min game TTL
        game.registerDesk("Phantom Grid", pgAgent, pgOperator, 240);     // 4 min game TTL

        // Compute desk IDs
        vcDeskId = keccak256(abi.encodePacked("Volatility Cult", vcAgent));
        cbDeskId = keccak256(abi.encodePacked("Cold Blood", cbAgent));
        pgDeskId = keccak256(abi.encodePacked("Phantom Grid", pgAgent));

        // Start first round
        game.startRound();

        vm.stopPrank();

        // Fund players
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(carol, 10 ether);

        // Fund operators/agents for tests that simulate self-play attempts (they send ETH).
        vm.deal(vcAgent, 10 ether);
        vm.deal(cbAgent, 10 ether);
        vm.deal(pgAgent, 10 ether);
        vm.deal(vcOperator, 10 ether);
        vm.deal(cbOperator, 10 ether);
        vm.deal(pgOperator, 10 ether);
    }

    // ═══ BASIC FUNCTIONALITY ═══

    function test_DeskRegistration() public {
        assertEq(game.getDeskCount(), 3);

        (bytes32 id,, address op, string memory name,,,,) = game.desks(vcDeskId);
        assertEq(id, vcDeskId);
        assertEq(op, vcOperator);
        assertEq(name, "Volatility Cult");
    }

    function test_RoundStarted() public {
        (uint256 id, uint256 start, uint256 end, DeskWatchGame.RoundStatus status) = game.currentRound();
        assertEq(id, 1);
        assertGt(start, 0);
        assertEq(end, start + 3600);
        assertEq(uint8(status), 0); // Active
    }

    function test_WatchDesk() public {
        vm.prank(alice);
        game.watch{value: 0.001 ether}(vcDeskId, DeskWatchGame.Tier.Sniper);

        assertEq(game.getWatcherCount(vcDeskId), 1);
        assertEq(game.pools(1, vcDeskId), 0.001 ether);
        // Sniper = 7x multiplier
        assertEq(game.poolWeights(1, vcDeskId), 0.001 ether * 7);
        assertTrue(game.hasWatched(1, vcDeskId, alice));
    }

    function test_MultipleWatchers() public {
        vm.prank(alice);
        game.watch{value: 0.001 ether}(vcDeskId, DeskWatchGame.Tier.Sniper);

        vm.prank(bob);
        game.watch{value: 0.0005 ether}(vcDeskId, DeskWatchGame.Tier.Sentinel);

        vm.prank(carol);
        game.watch{value: 0.0001 ether}(vcDeskId, DeskWatchGame.Tier.Scout);

        assertEq(game.getWatcherCount(vcDeskId), 3);
        assertEq(game.pools(1, vcDeskId), 0.001 ether + 0.0005 ether + 0.0001 ether);
    }

    function test_WatchMultipleDesks() public {
        vm.startPrank(alice);
        game.watch{value: 0.001 ether}(vcDeskId, DeskWatchGame.Tier.Sniper);
        game.watch{value: 0.0005 ether}(cbDeskId, DeskWatchGame.Tier.Sentinel);
        game.watch{value: 0.0001 ether}(pgDeskId, DeskWatchGame.Tier.Scout);
        vm.stopPrank();

        assertEq(game.getWatcherCount(vcDeskId), 1);
        assertEq(game.getWatcherCount(cbDeskId), 1);
        assertEq(game.getWatcherCount(pgDeskId), 1);
    }

    // ═══ DEATH AND REWARDS ═══

    function test_ReportDeath() public {
        // Alice watches VC desk
        vm.prank(alice);
        game.watch{value: 0.001 ether}(vcDeskId, DeskWatchGame.Tier.Sniper);

        // VC agent stops pulsing (simulate by setting last pulse to past)
        vm.warp(block.timestamp + 302);
        registry.setLastPulse(vcAgent, block.timestamp - 301); // 301s > 300s game TTL

        // Anyone can report the death
        vm.prank(bob);
        game.reportDeath(vcDeskId);

        assertTrue(game.isDead(1, vcDeskId));
    }

    function test_ClaimReward_SingleWatcher() public {
        // Alice watches with Sniper tier
        vm.prank(alice);
        game.watch{value: 0.001 ether}(vcDeskId, DeskWatchGame.Tier.Sniper);

        // VC dies
        vm.warp(block.timestamp + 302);
        registry.setLastPulse(vcAgent, block.timestamp - 301);
        game.reportDeath(vcDeskId);

        // Alice claims
        uint256 balBefore = alice.balance;
        vm.prank(alice);
        game.claimReward(1, vcDeskId);

        uint256 balAfter = alice.balance;
        uint256 reward = balAfter - balBefore;

        // Pool = 0.001 ETH, protocol fee = 10%, so Alice gets 0.0009 ETH
        assertEq(reward, 0.0009 ether);
        assertEq(game.totalEarnings(alice), 0.0009 ether);
    }

    function test_ClaimReward_MultipleWatchers_WeightedDistribution() public {
        // Alice: Sniper ($0.001 * 7 = 0.007 weight)
        vm.prank(alice);
        game.watch{value: 0.001 ether}(vcDeskId, DeskWatchGame.Tier.Sniper);

        // Bob: Scout ($0.001 * 1 = 0.001 weight)
        vm.prank(bob);
        game.watch{value: 0.001 ether}(vcDeskId, DeskWatchGame.Tier.Scout);

        // Total pool = 0.002 ETH
        // Total weight = 0.007 + 0.001 = 0.008
        // Distributable = 0.002 * 0.9 = 0.0018 ETH (after 10% protocol fee)
        // Alice share = 0.007/0.008 * 0.0018 = 0.001575 ETH
        // Bob share = 0.001/0.008 * 0.0018 = 0.000225 ETH

        // Kill desk
        vm.warp(block.timestamp + 302);
        registry.setLastPulse(vcAgent, block.timestamp - 301);
        game.reportDeath(vcDeskId);

        // Alice claims
        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        game.claimReward(1, vcDeskId);
        uint256 aliceReward = alice.balance - aliceBefore;

        // Bob claims
        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        game.claimReward(1, vcDeskId);
        uint256 bobReward = bob.balance - bobBefore;

        // Sniper gets 7x the Scout reward
        assertEq(aliceReward, 0.001575 ether);
        assertEq(bobReward, 0.000225 ether);

        // Verify total distributed ≈ 90% of pool
        assertEq(aliceReward + bobReward, 0.0018 ether);
    }

    // ═══ ROUND SETTLEMENT (Desk Survives) ═══

    function test_RoundSettlement_DeskSurvives() public {
        // Alice watches VC desk
        vm.prank(alice);
        game.watch{value: 0.01 ether}(vcDeskId, DeskWatchGame.Tier.Sniper);

        // Fast forward past round end
        vm.warp(block.timestamp + 3601);

        uint256 operatorBefore = vcOperator.balance;
        uint256 treasuryBefore = treasury.balance;

        // Settle round
        game.settleRound();

        // Operator gets 70% = 0.007 ETH
        assertEq(vcOperator.balance - operatorBefore, 0.007 ether);
        // Protocol gets 10% = 0.001 ETH
        assertEq(treasury.balance - treasuryBefore, 0.001 ether);
        // Remaining 20% = 0.002 ETH goes to rollover
        assertEq(game.rolloverPool(vcDeskId), 0.002 ether);
    }

    function test_RolloverAccumulates() public {
        // Round 1: Alice watches, desk survives
        vm.prank(alice);
        game.watch{value: 0.01 ether}(vcDeskId, DeskWatchGame.Tier.Sniper);

        vm.warp(block.timestamp + 3601);
        game.settleRound();
        assertEq(game.rolloverPool(vcDeskId), 0.002 ether);

        // Start round 2
        vm.prank(deployer);
        game.startRound();

        // Bob watches, desk survives again
        vm.prank(bob);
        game.watch{value: 0.01 ether}(vcDeskId, DeskWatchGame.Tier.Sniper);

        vm.warp(block.timestamp + 3601);
        game.settleRound();

        // Rollover = round1 rollover + round2 rollover
        assertEq(game.rolloverPool(vcDeskId), 0.004 ether);
    }

    function test_RolloverPaidOnDeath() public {
        // Accumulate rollover
        vm.prank(alice);
        game.watch{value: 0.01 ether}(vcDeskId, DeskWatchGame.Tier.Sniper);
        vm.warp(block.timestamp + 3601);
        game.settleRound();
        uint256 rollover = game.rolloverPool(vcDeskId);
        assertGt(rollover, 0);

        // Start round 2, watch, then desk dies
        vm.prank(deployer);
        game.startRound();

        vm.prank(bob);
        game.watch{value: 0.001 ether}(vcDeskId, DeskWatchGame.Tier.Scout);

        vm.warp(block.timestamp + 302);
        registry.setLastPulse(vcAgent, block.timestamp - 301);
        game.reportDeath(vcDeskId);

        // Rollover should be cleared (added to death pool)
        assertEq(game.rolloverPool(vcDeskId), 0);

        // Bob's reward includes rollover
        (bool has, uint256 reward) = game.hasUnclaimedReward(2, vcDeskId, bob);
        assertTrue(has);
        // Pool = 0.001 + 0.002 rollover = 0.003, minus 10% = 0.0027
        assertEq(reward, 0.0027 ether);
    }

    // ═══ SECURITY: ANTI-SELF-PLAY ═══

    function test_RevertWhen_OperatorWatchesOwnDesk() public {
        vm.prank(vcOperator);
        vm.expectRevert(DeskWatchGame.CannotWatchOwnDesk.selector);
        game.watch{value: 0.001 ether}(vcDeskId, DeskWatchGame.Tier.Sniper);
    }

    function test_RevertWhen_AgentWatchesOwnDesk() public {
        vm.prank(vcAgent);
        vm.expectRevert(DeskWatchGame.CannotWatchOwnDesk.selector);
        game.watch{value: 0.001 ether}(vcDeskId, DeskWatchGame.Tier.Scout);
    }

    // ═══ SECURITY: DOUBLE WATCH / DOUBLE CLAIM ═══

    function test_RevertWhen_DoubleWatch() public {
        vm.startPrank(alice);
        game.watch{value: 0.001 ether}(vcDeskId, DeskWatchGame.Tier.Sniper);

        vm.expectRevert(DeskWatchGame.AlreadyWatching.selector);
        game.watch{value: 0.001 ether}(vcDeskId, DeskWatchGame.Tier.Scout);
        vm.stopPrank();
    }

    function test_RevertWhen_DoubleClaim() public {
        vm.prank(alice);
        game.watch{value: 0.001 ether}(vcDeskId, DeskWatchGame.Tier.Sniper);

        vm.warp(block.timestamp + 302);
        registry.setLastPulse(vcAgent, block.timestamp - 301);
        game.reportDeath(vcDeskId);

        vm.startPrank(alice);
        game.claimReward(1, vcDeskId);

        vm.expectRevert(DeskWatchGame.AlreadyClaimed.selector);
        game.claimReward(1, vcDeskId);
        vm.stopPrank();
    }

    // ═══ SECURITY: DESK NOT ACTUALLY DEAD ═══

    function test_RevertWhen_DeskStillAlive() public {
        // VC just pulsed — not dead
        registry.pulse(vcAgent);

        vm.expectRevert(DeskWatchGame.DeskStillAlive.selector);
        game.reportDeath(vcDeskId);
    }

    // ═══ EDGE: INSUFFICIENT AMOUNT ═══

    function test_RevertWhen_InsufficientAmount() public {
        vm.prank(alice);
        vm.expectRevert(DeskWatchGame.InsufficientAmount.selector);
        game.watch{value: 0.00001 ether}(vcDeskId, DeskWatchGame.Tier.Sniper); // Sniper min = 0.001
    }

    // ═══ VIEW FUNCTIONS ═══

    function test_EstimateReward() public {
        vm.prank(alice);
        game.watch{value: 0.001 ether}(vcDeskId, DeskWatchGame.Tier.Sniper);

        // If Bob joins as Scout with 0.001 ETH:
        // Pool would be 0.002, Bob's weight = 0.001*1 = 0.001
        // Total weight = 0.007 + 0.001 = 0.008
        // Bob's share = 0.001/0.008 * (0.002*0.9) = 0.000225
        uint256 estimate = game.estimateReward(vcDeskId, DeskWatchGame.Tier.Scout, 0.001 ether);
        assertEq(estimate, 0.000225 ether);
    }

    function test_CheckDeskLiveness() public {
        registry.pulse(vcAgent); // Refresh pulse

        (bool alive, uint256 timeSince, uint256 gameTTL) = game.checkDeskLiveness(vcDeskId);
        assertTrue(alive);
        assertLt(timeSince, 5);
        assertEq(gameTTL, 300);

        // Fast forward past game TTL
        vm.warp(block.timestamp + 301);
        (alive,,) = game.checkDeskLiveness(vcDeskId);
        assertFalse(alive);
    }

    function test_GetEffectivePool() public {
        vm.prank(alice);
        game.watch{value: 0.01 ether}(vcDeskId, DeskWatchGame.Tier.Sniper);

        assertEq(game.getEffectivePool(vcDeskId), 0.01 ether);
    }

    // ═══ LENS CONTRACT ═══

    function test_LensGetFullState() public {
        vm.prank(alice);
        game.watch{value: 0.001 ether}(vcDeskId, DeskWatchGame.Tier.Sniper);

        DeskWatchLens.FullStateView memory state = lens.getFullState(address(game));

        assertEq(state.round.id, 1);
        assertEq(state.desks.length, 3);
        assertEq(state.stats.totalVolume, 0.001 ether);

        // First desk should show VC data
        bool foundVC = false;
        for (uint256 i = 0; i < state.desks.length; i++) {
            if (state.desks[i].deskId == vcDeskId) {
                assertEq(state.desks[i].watcherCount, 1);
                assertEq(state.desks[i].pool, 0.001 ether);
                assertTrue(state.desks[i].isAliveForGame);
                foundVC = true;
            }
        }
        assertTrue(foundVC);
    }
}
