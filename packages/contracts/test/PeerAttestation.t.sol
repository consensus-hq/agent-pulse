// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/PeerAttestation.sol";
import "../contracts/interfaces/IPulseRegistryV2.sol";

contract MockPulseRegistry is IPulseRegistryV2 {
    mapping(address => bool) public aliveStatus;
    mapping(address => uint256) public reliabilityScores;

    function setAlive(address agent, bool status) external {
        aliveStatus[agent] = status;
    }

    function setScore(address agent, uint256 score) external {
        reliabilityScores[agent] = score;
    }

    function isAlive(address agent) external view override returns (bool) {
        return aliveStatus[agent];
    }

    function getReliabilityScore(address agent) external view override returns (uint256) {
        return reliabilityScores[agent];
    }
    
    // Stubs
    function pulse(uint256) external override {}
    function getAgentStatus(address) external pure override returns (bool, uint256, uint256, uint256) { return (false, 0, 0, 0); }
    function stake(uint256) external override {}
    function unstake(uint256) external override {}
    function getAgentTier(address) external pure override returns (uint8) { return 0; }
    function stakedAmount(address) external pure override returns (uint256) { return 0; }
    function stakeUnlockTime(address) external pure override returns (uint256) { return 0; }
}

contract PeerAttestationTest is Test {
    PeerAttestation attestation;
    MockPulseRegistry registry;

    address attestor = address(0x1);
    address subject = address(0x2);
    address otherSubject = address(0x3);

    event AttestationSubmitted(
        address indexed attestor,
        address indexed subject,
        bool positive,
        uint256 weight,
        uint256 timestamp
    );

    function setUp() public {
        // Warp to epoch 1 so that epoch-start != 0 (avoids false-positive
        // "already attested" when lastAttestationTime defaults to 0)
        vm.warp(86400);

        registry = new MockPulseRegistry();
        attestation = new PeerAttestation(address(registry));

        // Setup default valid state
        registry.setAlive(attestor, true);
        registry.setAlive(subject, true);
        registry.setAlive(otherSubject, true);
        registry.setScore(attestor, 50);
        
        vm.label(attestor, "Attestor");
        vm.label(subject, "Subject");
    }

    // ============ Constructor Tests ============
    
    function test_Constructor_SetsRegistry() public {
        assertEq(address(attestation.pulseRegistry()), address(registry));
    }
    
    function test_Constructor_RevertsZeroAddress() public {
        vm.expectRevert(PeerAttestation.ZeroAddress.selector);
        new PeerAttestation(address(0));
    }

    // ============ Attestation Success Tests ============

    function test_Attest_Success_Positive() public {
        vm.prank(attestor);
        
        vm.expectEmit(true, true, false, true);
        emit AttestationSubmitted(attestor, subject, true, 50, block.timestamp);
        
        attestation.attest(subject, true);
        
        // Check state
        assertEq(attestation.positiveAttestationWeight(subject), 50);
        assertEq(attestation.negativeAttestationWeight(subject), 0);
        assertEq(attestation.totalAttestations(), 1);
    }

    function test_Attest_Success_Negative() public {
        vm.prank(attestor);
        
        vm.expectEmit(true, true, false, true);
        emit AttestationSubmitted(attestor, subject, false, 50, block.timestamp);
        
        attestation.attest(subject, false);
        
        assertEq(attestation.positiveAttestationWeight(subject), 0);
        assertEq(attestation.negativeAttestationWeight(subject), 50);
    }

    // ============ Sybil Protection Tests ============

    function test_Revert_SelfAttest() public {
        vm.prank(attestor);
        vm.expectRevert(PeerAttestation.SelfAttestationNotAllowed.selector);
        attestation.attest(attestor, true);
    }

    function test_Revert_AttestorDead() public {
        registry.setAlive(attestor, false);
        
        vm.prank(attestor);
        vm.expectRevert(PeerAttestation.AttestorNotAlive.selector);
        attestation.attest(subject, true);
    }

    function test_Revert_SubjectDead() public {
        registry.setAlive(subject, false);
        
        vm.prank(attestor);
        vm.expectRevert(abi.encodeWithSelector(PeerAttestation.SubjectNotRegistered.selector, subject));
        attestation.attest(subject, true);
    }

    function test_Revert_AlreadyAttestedThisEpoch() public {
        vm.startPrank(attestor);
        attestation.attest(subject, true);
        
        // Try again same epoch - should revert with AttestationAlreadySubmittedThisEpoch
        vm.expectRevert();
        attestation.attest(subject, false);
        vm.stopPrank();
    }

    function test_Success_NextEpoch() public {
        vm.startPrank(attestor);
        attestation.attest(subject, true);
        
        // Warp to next epoch (24 hours)
        vm.warp(block.timestamp + 1 days + 1);
        
        // Should succeed in new epoch
        attestation.attest(subject, true);
        vm.stopPrank();
        
        // Both attestations should count
        assertEq(attestation.positiveAttestationWeight(subject), 100); // 50 + 50
        assertEq(attestation.totalAttestations(), 2);
    }

    function test_Revert_DailyLimit() public {
        vm.startPrank(attestor);
        
        // Attest to 10 different subjects (max per epoch)
        for (uint160 i = 10; i < 20; i++) {
            address s = address(i);
            registry.setAlive(s, true);
            attestation.attest(s, true);
        }
        
        // 11th should fail
        address s11 = address(uint160(21));
        registry.setAlive(s11, true);
        
        vm.expectRevert(
            abi.encodeWithSelector(
                PeerAttestation.MaxAttestationsReached.selector, 
                10, 
                10
            )
        );
        attestation.attest(s11, true);
        vm.stopPrank();
    }

    // ============ Weight Tests ============

    function test_Weight_Dynamic() public {
        registry.setScore(attestor, 85);
        
        vm.prank(attestor);
        vm.expectEmit(true, true, false, true);
        emit AttestationSubmitted(attestor, subject, true, 85, block.timestamp);
        
        attestation.attest(subject, true);
        
        assertEq(attestation.positiveAttestationWeight(subject), 85);
    }
    
    function test_Weight_ZeroScore() public {
        registry.setScore(attestor, 0);
        
        vm.prank(attestor);
        attestation.attest(subject, true);
        
        // Weight should be 0
        assertEq(attestation.positiveAttestationWeight(subject), 0);
    }

    // ============ View Function Tests ============

    function test_GetRemainingAttestations_Fresh() public {
        assertEq(attestation.getRemainingAttestations(attestor), 10);
    }
    
    function test_GetRemainingAttestations_AfterSome() public {
        vm.startPrank(attestor);
        attestation.attest(subject, true);
        vm.stopPrank();
        
        assertEq(attestation.getRemainingAttestations(attestor), 9);
    }
    
    function test_GetRemainingAttestations_ResetAfterEpoch() public {
        vm.startPrank(attestor);
        attestation.attest(subject, true);
        vm.stopPrank();
        
        // Warp past epoch
        vm.warp(block.timestamp + 1 days + 1);
        
        assertEq(attestation.getRemainingAttestations(attestor), 10);
    }
    
    function test_CanAttest_Returns_True() public {
        (bool can, string memory reason) = attestation.canAttest(attestor, subject);
        assertTrue(can);
        assertEq(bytes(reason).length, 0);
    }
    
    function test_CanAttest_Returns_False_Self() public {
        (bool can, ) = attestation.canAttest(attestor, attestor);
        assertFalse(can);
    }
    
    function test_CanAttest_Returns_False_DeadAttestor() public {
        registry.setAlive(attestor, false);
        (bool can, ) = attestation.canAttest(attestor, subject);
        assertFalse(can);
    }
    
    function test_GetNetAttestationScore() public {
        // Positive attestation
        registry.setScore(attestor, 50);
        vm.prank(attestor);
        attestation.attest(subject, true);
        
        assertEq(attestation.getNetAttestationScore(subject), 50);
        
        // Negative from different attestor
        address attestor2 = address(0x4);
        registry.setAlive(attestor2, true);
        registry.setScore(attestor2, 30);
        
        vm.prank(attestor2);
        attestation.attest(subject, false);
        
        assertEq(attestation.getNetAttestationScore(subject), 20); // 50 - 30
    }
    
    function test_GetAttestationStats() public {
        registry.setScore(attestor, 50);
        vm.prank(attestor);
        attestation.attest(subject, true);
        
        (uint256 posWeight, uint256 negWeight, int256 netScore) = attestation.getAttestationStats(subject);
        assertEq(posWeight, 50);
        assertEq(negWeight, 0);
        assertEq(netScore, 50);
    }
    
    function test_GetTimeUntilEpochReset() public {
        vm.prank(attestor);
        attestation.attest(subject, true);
        
        uint256 timeLeft = attestation.getTimeUntilEpochReset(attestor);
        // Should be close to 24 hours (EPOCH_DURATION)
        assertGt(timeLeft, 0);
        assertLe(timeLeft, 1 days);
    }
    
    function test_GetTimeUntilEpochReset_ExpiredReturnsZero() public {
        vm.prank(attestor);
        attestation.attest(subject, true);
        
        // Warp past epoch
        vm.warp(block.timestamp + 1 days + 1);
        
        assertEq(attestation.getTimeUntilEpochReset(attestor), 0);
    }
    
    // ============ Multiple Attestor Tests ============
    
    function test_MultipleAttestorsAccumulateWeight() public {
        address attestor2 = address(0x4);
        address attestor3 = address(0x5);
        registry.setAlive(attestor2, true);
        registry.setAlive(attestor3, true);
        registry.setScore(attestor, 50);
        registry.setScore(attestor2, 30);
        registry.setScore(attestor3, 20);
        
        vm.prank(attestor);
        attestation.attest(subject, true);
        vm.prank(attestor2);
        attestation.attest(subject, true);
        vm.prank(attestor3);
        attestation.attest(subject, true);
        
        assertEq(attestation.positiveAttestationWeight(subject), 100); // 50+30+20
        assertEq(attestation.totalAttestations(), 3);
    }
}
