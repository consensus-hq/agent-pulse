// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/PulseToken.sol";
import "../contracts/PulseRegistryV2.sol";
import "../contracts/PeerAttestation.sol";
import "../contracts/BurnWithFee.sol";

/**
 * @title DeployMainnet
 * @notice Deploys the full Agent Pulse protocol to Base Mainnet
 * @dev Run: forge script script/DeployMainnet.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
 *
 * Deployment order:
 * 1. PulseToken (ERC20) — 1B supply to deployer
 * 2. PulseRegistryV2 — core liveness registry with staking + reliability scoring
 * 3. PeerAttestation — peer-to-peer attestation (requires V2 for getReliabilityScore)
 * 4. BurnWithFee — fee wrapper for burns (feeWallet → Treasury Safe)
 *
 * Post-deploy: Transfer ownership of all contracts to Treasury Safe multisig.
 */
contract DeployMainnet is Script {
    // Treasury Safe (multisig: deployer + 2 hardware wallets)
    address constant TREASURY_SAFE = 0xA7940a42c30A7F492Ed578F3aC728c2929103E43;
    uint256 constant TTL_SECONDS = 86400;
    uint256 constant MIN_PULSE = 1e18;
    uint256 constant INITIAL_SUPPLY = 1_000_000_000e18;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Deployer:", deployer);
        console.log("Treasury Safe:", TREASURY_SAFE);
        console.log("Chain ID:", block.chainid);
        console.log("Balance:", deployer.balance);

        require(block.chainid == 8453, "Must be Base Mainnet (chainId 8453)");
        require(deployer.balance > 0.001 ether, "Insufficient ETH for gas");

        vm.startBroadcast(deployerKey);

        // 1. Deploy token — supply goes to deployer for initial distribution
        PulseToken token = new PulseToken("Pulse Token", "PULSE", INITIAL_SUPPLY, deployer);
        console.log("PulseToken:", address(token));

        // 2. Deploy V2 registry (uses DEAD_ADDRESS constant internally for burns)
        PulseRegistryV2 registry = new PulseRegistryV2(address(token), TTL_SECONDS, MIN_PULSE);
        console.log("PulseRegistryV2:", address(registry));

        // 3. Deploy PeerAttestation (requires V2 for getReliabilityScore)
        PeerAttestation attestation = new PeerAttestation(address(registry));
        console.log("PeerAttestation:", address(attestation));

        // 4. Deploy BurnWithFee (fee goes to Treasury Safe)
        BurnWithFee burnWithFee = new BurnWithFee(address(token), TREASURY_SAFE);
        console.log("BurnWithFee:", address(burnWithFee));

        vm.stopBroadcast();

        console.log("\n=== DEPLOYMENT SUMMARY ===");
        console.log("PulseToken:", address(token));
        console.log("PulseRegistryV2:", address(registry));
        console.log("PeerAttestation:", address(attestation));
        console.log("BurnWithFee:", address(burnWithFee));
        console.log("Fee Wallet:", TREASURY_SAFE);
        console.log("");
        console.log("IMPORTANT: Transfer contract ownership to Treasury Safe after verification:");
        console.log("  registry.transferOwnership(TREASURY_SAFE)");
        console.log("  burnWithFee.transferOwnership(TREASURY_SAFE)");
        console.log("  token.transferOwnership(TREASURY_SAFE)");
    }
}
