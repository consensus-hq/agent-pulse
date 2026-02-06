// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IPulseRegistryV2.sol";

/**
 * @title PeerAttestation
 * @notice Peer-to-peer attestation layer for agent reputation
 * @dev Agents with valid pulses can attest to other agents' reliability.
 *      Attestation weight is derived from the attestor's reliability score.
 *      Implements sybil-resistant rate limiting per epoch.
 */
contract PeerAttestation is Ownable2Step, ReentrancyGuard {
    // ============ Constants ============
    
    /// @notice Duration of an epoch in seconds (24 hours)
    uint256 public constant EPOCH_DURATION = 24 hours;
    
    /// @notice Maximum attestations an agent can submit per epoch
    uint256 public constant MAX_ATTESTATIONS_PER_EPOCH = 10;
    
    // ============ Immutables ============
    
    /// @notice Reference to the PulseRegistryV2 contract for reliability scores
    IPulseRegistryV2 public immutable pulseRegistry;
    
    // ============ State ============
    
    /**
     * @notice Tracks the last attestation timestamp for each (attestor, subject) pair
     * @dev Used to enforce max 1 attestation per pair per epoch
     */
    mapping(address attestor => mapping(address subject => uint256 timestamp)) public lastAttestationTime;
    
    /**
     * @notice Tracks the number of attestations submitted by each attestor in the current epoch
     * @dev Combined with epoch start tracking for rate limiting
     */
    mapping(address attestor => uint256 count) public attestationsThisEpoch;
    
    /**
     * @notice Tracks the epoch start time for each attestor's attestation count
     * @dev Used to reset counters when a new epoch begins
     */
    mapping(address attestor => uint256 epochStart) public attestorEpochStart;
    
    /**
     * @notice Cumulative positive attestation weight received by each subject
     * @dev Used for aggregate reputation calculations
     */
    mapping(address subject => uint256 totalWeight) public positiveAttestationWeight;
    
    /**
     * @notice Cumulative negative attestation weight received by each subject
     * @dev Used for aggregate reputation calculations
     */
    mapping(address subject => uint256 totalWeight) public negativeAttestationWeight;
    
    /**
     * @notice Total number of attestations submitted (for analytics)
     */
    uint256 public totalAttestations;
    
    // ============ Events ============
    
    /**
     * @notice Emitted when an attestation is successfully submitted
     * @param attestor The address of the agent submitting the attestation
     * @param subject The address of the agent being attested to
     * @param positive True for positive attestation, false for negative
     * @param weight The weight of the attestation (attestor's reliability score)
     * @param timestamp The block timestamp of the attestation
     */
    event AttestationSubmitted(
        address indexed attestor,
        address indexed subject,
        bool positive,
        uint256 weight,
        uint256 timestamp
    );
    
    /**
     * @notice Emitted when epoch parameters are reset for an attestor
     * @param attestor The address whose epoch was reset
     * @param newEpochStart The timestamp marking the start of the new epoch
     */
    event EpochReset(address indexed attestor, uint256 newEpochStart);
    
    // ============ Errors ============
    
    /// @notice Thrown when an agent attempts to attest to themselves
    error SelfAttestationNotAllowed();
    
    /// @notice Thrown when the subject agent is not registered or alive in PulseRegistryV2
    error SubjectNotRegistered(address subject);
    
    /// @notice Thrown when the attestor has already attested to this subject in the current epoch
    error AttestationAlreadySubmittedThisEpoch(address attestor, address subject, uint256 nextAllowedTime);
    
    /// @notice Thrown when the attestor has reached the maximum attestations for the current epoch
    error MaxAttestationsReached(uint256 currentCount, uint256 maxAllowed);
    
    /// @notice Thrown when the attestor is not a valid, pulsed agent
    error AttestorNotAlive();
    
    /// @notice Thrown when attempting to set a zero address for the registry
    error ZeroAddress();
    
    // ============ Constructor ============
    
    /**
     * @notice Initializes the PeerAttestation contract
     * @param _pulseRegistry The address of the deployed PulseRegistryV2 contract
     */
    constructor(address _pulseRegistry) Ownable(msg.sender) {
        if (_pulseRegistry == address(0)) revert ZeroAddress();
        pulseRegistry = IPulseRegistryV2(_pulseRegistry);
    }
    
    // ============ External Functions ============
    
    /**
     * @notice Submit an attestation for another agent
     * @dev Callable only by agents that are alive in PulseRegistryV2.
     *      Weight is automatically calculated from attestor's reliability score.
     *      Enforces sybil protections: no self-attest, one per pair per epoch, max 10 per epoch.
     * @param agent The address of the agent being attested to (the subject)
     * @param positive True for a positive attestation, false for negative
     */
    function attest(address agent, bool positive) external nonReentrant {
        // Verify attestor is alive
        if (!pulseRegistry.isAlive(msg.sender)) {
            revert AttestorNotAlive();
        }
        
        // Sybil: No self-attestation
        if (agent == msg.sender) {
            revert SelfAttestationNotAllowed();
        }
        
        // Sybil: Subject must be registered and alive
        if (!pulseRegistry.isAlive(agent)) {
            revert SubjectNotRegistered(agent);
        }
        
        // Check and update epoch state for attestor
        _checkAndUpdateEpoch(msg.sender);
        
        // Sybil: Max 10 attestations per agent per epoch
        uint256 currentCount = attestationsThisEpoch[msg.sender];
        if (currentCount >= MAX_ATTESTATIONS_PER_EPOCH) {
            revert MaxAttestationsReached(currentCount, MAX_ATTESTATIONS_PER_EPOCH);
        }
        
        // Sybil: Max 1 per pair per epoch
        uint256 lastAttestation = lastAttestationTime[msg.sender][agent];
        uint256 currentEpochStart = attestorEpochStart[msg.sender];
        if (lastAttestation >= currentEpochStart) {
            revert AttestationAlreadySubmittedThisEpoch(
                msg.sender, 
                agent, 
                currentEpochStart + EPOCH_DURATION
            );
        }
        
        // Get attestor's weight from reliability score
        uint256 weight = pulseRegistry.getReliabilityScore(msg.sender);
        
        // Update state
        attestationsThisEpoch[msg.sender] = currentCount + 1;
        lastAttestationTime[msg.sender][agent] = block.timestamp;
        totalAttestations++;
        
        // Update cumulative weights
        if (positive) {
            positiveAttestationWeight[agent] += weight;
        } else {
            negativeAttestationWeight[agent] += weight;
        }
        
        // Emit event
        emit AttestationSubmitted(msg.sender, agent, positive, weight, block.timestamp);
    }
    
    /**
     * @notice Get the remaining attestations available for an attestor in the current epoch
     * @param attestor The address of the attestor to check
     * @return remaining The number of attestations still allowed this epoch
     */
    function getRemainingAttestations(address attestor) external view returns (uint256 remaining) {
        uint256 epochStart = attestorEpochStart[attestor];
        
        // If epoch has expired, reset to max
        if (block.timestamp >= epochStart + EPOCH_DURATION) {
            return MAX_ATTESTATIONS_PER_EPOCH;
        }
        
        uint256 used = attestationsThisEpoch[attestor];
        return used >= MAX_ATTESTATIONS_PER_EPOCH ? 0 : MAX_ATTESTATIONS_PER_EPOCH - used;
    }
    
    /**
     * @notice Check if an attestor can attest to a specific subject in the current epoch
     * @param attestor The address of the potential attestor
     * @param subject The address of the potential subject
     * @return allowed True if attestation is allowed
     * @return reason Empty string if allowed, otherwise contains the blocking reason
     */
    function canAttest(address attestor, address subject) external view returns (bool allowed, string memory reason) {
        // Check attestor is alive
        if (!pulseRegistry.isAlive(attestor)) {
            return (false, "Attestor not alive");
        }
        
        // Check self-attestation
        if (subject == attestor) {
            return (false, "Self-attestation not allowed");
        }
        
        // Check subject is registered
        if (!pulseRegistry.isAlive(subject)) {
            return (false, "Subject not registered");
        }
        
        // Check epoch attestations
        uint256 epochStart = attestorEpochStart[attestor];
        if (block.timestamp < epochStart + EPOCH_DURATION) {
            if (attestationsThisEpoch[attestor] >= MAX_ATTESTATIONS_PER_EPOCH) {
                return (false, "Max attestations reached for epoch");
            }
        }
        
        // Check pair limit
        uint256 lastAttestation = lastAttestationTime[attestor][subject];
        if (lastAttestation >= epochStart && block.timestamp < epochStart + EPOCH_DURATION) {
            return (false, "Already attested to this subject this epoch");
        }
        
        return (true, "");
    }
    
    /**
     * @notice Get the net attestation score for a subject
     * @param subject The address of the agent to check
     * @return netScore The difference between positive and negative attestation weights
     */
    function getNetAttestationScore(address subject) external view returns (int256 netScore) {
        return int256(positiveAttestationWeight[subject]) - int256(negativeAttestationWeight[subject]);
    }
    
    /**
     * @notice Get detailed attestation stats for a subject
     * @param subject The address of the agent to check
     * @return positiveWeight Total weight of positive attestations
     * @return negativeWeight Total weight of negative attestations
     * @return netScore Net score (positive - negative)
     */
    function getAttestationStats(address subject) external view returns (
        uint256 positiveWeight,
        uint256 negativeWeight,
        int256 netScore
    ) {
        positiveWeight = positiveAttestationWeight[subject];
        negativeWeight = negativeAttestationWeight[subject];
        netScore = int256(positiveWeight) - int256(negativeWeight);
    }
    
    /**
     * @notice Get the time until an attestor's epoch resets
     * @param attestor The address of the attestor
     * @return timeRemaining Seconds until epoch reset (0 if already reset)
     */
    function getTimeUntilEpochReset(address attestor) external view returns (uint256 timeRemaining) {
        uint256 epochStart = attestorEpochStart[attestor];
        uint256 epochEnd = epochStart + EPOCH_DURATION;
        
        if (block.timestamp >= epochEnd) {
            return 0;
        }
        
        return epochEnd - block.timestamp;
    }
    
    // ============ Internal Functions ============
    
    /**
     * @notice Checks if an attestor's epoch has expired and resets counters if needed
     * @param attestor The address of the attestor to check
     */
    function _checkAndUpdateEpoch(address attestor) internal {
        uint256 epochStart = attestorEpochStart[attestor];
        
        // If this is the first attestation or epoch has expired, reset
        if (epochStart == 0 || block.timestamp >= epochStart + EPOCH_DURATION) {
            // Calculate new epoch start (aligned to EPOCH_DURATION boundaries)
            uint256 newEpochStart = (block.timestamp / EPOCH_DURATION) * EPOCH_DURATION;
            attestorEpochStart[attestor] = newEpochStart;
            attestationsThisEpoch[attestor] = 0;
            emit EpochReset(attestor, newEpochStart);
        }
    }
}
