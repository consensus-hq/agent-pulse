// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/PulseToken.sol";
import "../contracts/PulseRegistry.sol";
import "../contracts/PeerAttestation.sol";
import "../contracts/BurnWithFee.sol";

/**
 * @title DeployMainnet
 * @notice Deploys the full Agent Pulse protocol to Base Mainnet
 * @dev Run: forge script script/DeployMainnet.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 *
 * Deployment order:
 * 1. PulseToken (ERC20) — 1B supply to deployer
 * 2. PulseRegistry — core liveness registry
 * 3. PeerAttestation — peer-to-peer attestation
 * 4. BurnWithFee — fee wrapper for burns
 */
contract DeployMainnet is Script {
    address constant SIGNAL_SINK = 0x000000000000000000000000000000000000dEaD;
    uint256 constant TTL_SECONDS = 86400;
    uint256 constant MIN_PULSE = 1e18;
    uint256 constant INITIAL_SUPPLY = 1_000_000_000e18;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("Balance:", deployer.balance);

        require(block.chainid == 8453, "Must be Base Mainnet (chainId 8453)");
        require(deployer.balance > 0.001 ether, "Insufficient ETH for gas");

        vm.startBroadcast(deployerKey);

        PulseToken token = new PulseToken("Pulse Token", "PULSE", INITIAL_SUPPLY, deployer);
        console.log("PulseToken:", address(token));

        PulseRegistry registry = new PulseRegistry(address(token), SIGNAL_SINK, TTL_SECONDS, MIN_PULSE);
        console.log("PulseRegistry:", address(registry));

        PeerAttestation attestation = new PeerAttestation(address(registry));
        console.log("PeerAttestation:", address(attestation));

        BurnWithFee burnWithFee = new BurnWithFee(address(token), SIGNAL_SINK);
        console.log("BurnWithFee:", address(burnWithFee));

        vm.stopBroadcast();

        console.log("\n=== DEPLOYMENT SUMMARY ===");
        console.log("PulseToken:", address(token));
        console.log("PulseRegistry:", address(registry));
        console.log("PeerAttestation:", address(attestation));
        console.log("BurnWithFee:", address(burnWithFee));
    }
}
