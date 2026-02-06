// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/PulseRegistryV2.sol";
import "../contracts/PeerAttestation.sol";
import "../contracts/BurnWithFee.sol";

/**
 * @title DeployClankerContracts
 * @notice Deploys PulseRegistryV2, PeerAttestation, BurnWithFee using existing Clanker-deployed PULSE token
 * @dev Run: forge script script/DeployClankerContracts.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 *
 * The PULSE token was deployed via Clanker V4 at 0x21111B39A502335aC7e45c4574Dd083A69258b07
 * This script deploys the remaining protocol contracts pointing at that token.
 *
 * Deployment order:
 * 1. PulseRegistryV2 — core liveness registry
 * 2. PeerAttestation — peer-to-peer attestation (requires V2)
 * 3. BurnWithFee — fee wrapper for burns (feeWallet → Treasury Safe)
 */
contract DeployClankerContracts is Script {
    // Clanker-deployed PULSE token on Base mainnet
    address constant PULSE_TOKEN = 0x21111B39A502335aC7e45c4574Dd083A69258b07;
    // Treasury Safe (multisig)
    address constant TREASURY_SAFE = 0xA7940a42c30A7F492Ed578F3aC728c2929103E43;
    // Registry params
    uint256 constant TTL_SECONDS = 86400; // 24h
    uint256 constant MIN_PULSE = 1e18;    // 1 PULSE minimum

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Deployer:", deployer);
        console.log("PULSE Token:", PULSE_TOKEN);
        console.log("Treasury Safe:", TREASURY_SAFE);
        console.log("Chain ID:", block.chainid);
        console.log("Balance:", deployer.balance);

        require(block.chainid == 8453, "Must be Base Mainnet (chainId 8453)");
        require(deployer.balance > 0.001 ether, "Insufficient ETH for gas");

        vm.startBroadcast(deployerKey);

        // 1. Deploy V2 registry pointing at Clanker PULSE token
        PulseRegistryV2 registry = new PulseRegistryV2(PULSE_TOKEN, TTL_SECONDS, MIN_PULSE);
        console.log("PulseRegistryV2:", address(registry));

        // 2. Deploy PeerAttestation pointing at new registry
        PeerAttestation attestation = new PeerAttestation(address(registry));
        console.log("PeerAttestation:", address(attestation));

        // 3. Deploy BurnWithFee pointing at Clanker PULSE token, fees to Treasury
        BurnWithFee burnWithFee = new BurnWithFee(PULSE_TOKEN, TREASURY_SAFE);
        console.log("BurnWithFee:", address(burnWithFee));

        vm.stopBroadcast();

        console.log("\n=== DEPLOYMENT SUMMARY ===");
        console.log("PULSE Token (Clanker):", PULSE_TOKEN);
        console.log("PulseRegistryV2:", address(registry));
        console.log("PeerAttestation:", address(attestation));
        console.log("BurnWithFee:", address(burnWithFee));
        console.log("Fee Wallet:", TREASURY_SAFE);
        console.log("");
        console.log("POST-DEPLOY: Transfer ownership to Treasury Safe:");
        console.log("  registry.transferOwnership(TREASURY_SAFE)");
        console.log("  burnWithFee.transferOwnership(TREASURY_SAFE)");
    }
}
