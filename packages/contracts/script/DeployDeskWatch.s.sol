// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ═══════════════════════════════════════════════════════════════════
//  DESK WATCH — Deployment Script (Foundry)
//
//  Deploy to Base mainnet:
//    forge script script/DeployDeskWatch.s.sol:DeployDeskWatch \
//      --rpc-url https://mainnet.base.org \
//      --broadcast \
//      --verify \
//      --etherscan-api-key $BASESCAN_API_KEY \
//      -vvvv
//
//  Required env vars:
//    PRIVATE_KEY          — deployer wallet
//    PULSE_REGISTRY       — PulseRegistryV2 address on Base
//    PROTOCOL_TREASURY    — treasury wallet for fees
//    VC_PULSE_AGENT       — Volatility Cult's pulse wallet
//    VC_OPERATOR          — Volatility Cult's operator wallet
//    CB_PULSE_AGENT       — Cold Blood's pulse wallet
//    CB_OPERATOR          — Cold Blood's operator wallet
//    PG_PULSE_AGENT       — Phantom Grid's pulse wallet
//    PG_OPERATOR          — Phantom Grid's operator wallet
// ═══════════════════════════════════════════════════════════════════

import {Script, console2} from "forge-std/Script.sol";
import {DeskWatchGame} from "../contracts/DeskWatchGame.sol";
import {DeskWatchLens} from "../contracts/DeskWatchLens.sol";

contract DeployDeskWatch is Script {
    function run() public {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address pulseRegistry = vm.envAddress("PULSE_REGISTRY");
        address treasury = vm.envAddress("PROTOCOL_TREASURY");

        // Trading desk agent wallets
        address vcPulseAgent = vm.envAddress("VC_PULSE_AGENT");
        address vcOperator = vm.envAddress("VC_OPERATOR");
        address cbPulseAgent = vm.envAddress("CB_PULSE_AGENT");
        address cbOperator = vm.envAddress("CB_OPERATOR");
        address pgPulseAgent = vm.envAddress("PG_PULSE_AGENT");
        address pgOperator = vm.envAddress("PG_OPERATOR");

        vm.startBroadcast(deployerKey);

        // ── DEPLOY GAME CONTRACT ──
        DeskWatchGame game = new DeskWatchGame(pulseRegistry, treasury);
        console2.log("DeskWatchGame deployed at:", address(game));

        // ── CONFIGURE GAME PARAMETERS ──
        // 1 hour rounds for hackathon
        game.setRoundDuration(3600);

        // Tier costs tuned for Base (sub-cent gas makes micro-bets viable)
        // Scout: 0.0001 ETH (~$0.25)
        // Sentinel: 0.0005 ETH (~$1.25)
        // Sniper: 0.001 ETH (~$2.50)
        game.setTierMinCost(DeskWatchGame.Tier.Scout, 0.0001 ether);
        game.setTierMinCost(DeskWatchGame.Tier.Sentinel, 0.0005 ether);
        game.setTierMinCost(DeskWatchGame.Tier.Sniper, 0.001 ether);

        // Max watch amount: 0.05 ETH (~$125) — prevents whale domination
        game.setMaxWatchAmount(0.05 ether);

        // ── REGISTER TRADING DESKS ──

        // Volatility Cult — HIGH risk, 3-min cycles, 50x leverage
        // Game TTL: 300s (5 min) — tighter than its 3-min pulse cycle
        // This means if VC misses ~2 consecutive heartbeats, it's dead for the game
        game.registerDesk(
            "Volatility Cult",
            vcPulseAgent,
            vcOperator,
            300 // 5 minute game TTL
        );
        console2.log("Registered: Volatility Cult");

        // Cold Blood — MEDIUM risk, 5-min cycles, 25x max leverage
        // Game TTL: 420s (7 min) — slightly more generous given 5-min cycle
        game.registerDesk(
            "Cold Blood",
            cbPulseAgent,
            cbOperator,
            420 // 7 minute game TTL
        );
        console2.log("Registered: Cold Blood");

        // Phantom Grid — LOW risk, 2-min cycles, spot only
        // Game TTL: 240s (4 min) — tight for a 2-min cycle bot
        game.registerDesk(
            "Phantom Grid",
            pgPulseAgent,
            pgOperator,
            240 // 4 minute game TTL
        );
        console2.log("Registered: Phantom Grid");

        // ── DEPLOY LENS CONTRACT ──
        DeskWatchLens lens = new DeskWatchLens();
        console2.log("DeskWatchLens deployed at:", address(lens));

        // ── START FIRST ROUND ──
        game.startRound();
        console2.log("First round started");

        vm.stopBroadcast();

        // ── OUTPUT DEPLOYMENT INFO ──
        console2.log("");
        console2.log("========================================");
        console2.log("  DESK WATCH - DEPLOYMENT COMPLETE");
        console2.log("========================================");
        console2.log("  Game:     ", address(game));
        console2.log("  Lens:     ", address(lens));
        console2.log("  Registry: ", pulseRegistry);
        console2.log("  Treasury: ", treasury);
        console2.log("  Chain:     Base Mainnet (8453)");
        console2.log("========================================");
        console2.log("");
        console2.log("Next steps:");
        console2.log("  1. Verify on Basescan");
        console2.log("  2. Update frontend with contract addresses");
        console2.log("  3. Set up death detection cron");
        console2.log("  4. Announce Desk Watch launch");
    }
}

// ═══════════════════════════════════════════════════════════════════
//  QUICK DEPLOY — For when you need it NOW
//  Deploys with hardcoded addresses (fill in before running)
// ═══════════════════════════════════════════════════════════════════

contract QuickDeploy is Script {
    function run() public {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        // ┌────────────────────────────────────────────┐
        // │  FILL THESE IN BEFORE DEPLOYING            │
        // └────────────────────────────────────────────┘
        address PULSE_REGISTRY = address(0); // TODO: PulseRegistryV2 on Base
        address TREASURY = address(0);       // TODO: Protocol treasury
        
        // Trading desk pulse wallets (the addresses that call heartbeat())
        address VC_AGENT = address(0);  // TODO: Volatility Cult
        address CB_AGENT = address(0);  // TODO: Cold Blood  
        address PG_AGENT = address(0);  // TODO: Phantom Grid
        
        // Operator wallets (receive fees when desk survives)
        address VC_OP = address(0);  // TODO
        address CB_OP = address(0);  // TODO
        address PG_OP = address(0);  // TODO

        require(PULSE_REGISTRY != address(0), "Set PULSE_REGISTRY");
        require(TREASURY != address(0), "Set TREASURY");

        vm.startBroadcast(deployerKey);

        DeskWatchGame game = new DeskWatchGame(PULSE_REGISTRY, TREASURY);
        DeskWatchLens lens = new DeskWatchLens();

        game.setRoundDuration(3600);
        game.registerDesk("Volatility Cult", VC_AGENT, VC_OP, 300);
        game.registerDesk("Cold Blood", CB_AGENT, CB_OP, 420);
        game.registerDesk("Phantom Grid", PG_AGENT, PG_OP, 240);
        game.startRound();

        vm.stopBroadcast();

        console2.log("Game:", address(game));
        console2.log("Lens:", address(lens));
    }
}
