// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IPulseRegistry.sol";
import "./IPeerAttestation.sol";

/**
 * @title ReputationWeightedVote
 * @author Agent Pulse — Example Contract
 * @notice On-chain voting where each agent's vote weight is derived from their
 *         pulse streak multiplied by their net peer attestation score.
 *
 * @dev **Pattern demonstrated: PulseRegistry × PeerAttestation Composability**
 *
 *      This contract shows how two Agent Pulse primitives compose into a
 *      sybil-resistant, reputation-weighted governance mechanism:
 *
 *        weight = streak × max(netAttestationScore, 0)
 *
 *      An agent with streak=10 and netScore=5 gets weight 50.
 *      An agent with streak=10 but netScore ≤ 0 gets weight 0 (untrusted).
 *      An agent that is not alive cannot vote at all.
 *
 *      Key integration points:
 *        • `IPulseRegistry.getAgentStatus()` — streak + alive check
 *        • `IPeerAttestation.getNetAttestationScore()` — peer trust signal
 *
 *      Default addresses (Base mainnet):
 *        PulseRegistry   0xe61C615743A02983A46aFF66Db035297e8a43846
 *        PeerAttestation 0x930dC6130b20775E01414a5923e7C66b62FF8d6C
 *
 * @custom:security-considerations
 *      - Proposals are simple: an ID, a description hash, and a deadline.
 *      - Each agent can vote once per proposal (FOR or AGAINST).
 *      - Vote weight is snapshot at vote time (not proposal creation).
 *      - There is no quorum enforcement — add it in production.
 *      - The contract is not upgradeable; deploy a new one for new rules.
 */
contract ReputationWeightedVote is ReentrancyGuard {
    // ─── Types ────────────────────────────────────────────────────────

    /// @notice A governance proposal.
    struct Proposal {
        bytes32 descriptionHash; // keccak256 of off-chain description
        uint256 deadline;        // block.timestamp after which voting closes
        uint256 weightFor;       // accumulated weight voting FOR
        uint256 weightAgainst;   // accumulated weight voting AGAINST
        bool exists;             // guard against voting on non-existent proposals
    }

    // ─── State ────────────────────────────────────────────────────────

    /// @notice PulseRegistry for streak + liveness.
    IPulseRegistry public immutable pulseRegistry;

    /// @notice PeerAttestation for reputation scores.
    IPeerAttestation public immutable peerAttestation;

    /// @notice proposalId ⇒ Proposal.
    mapping(uint256 => Proposal) public proposals;

    /// @notice proposalId ⇒ voter ⇒ true if already voted.
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    /// @notice proposalId ⇒ voter ⇒ weight used.
    mapping(uint256 => mapping(address => uint256)) public voteWeight;

    /// @notice Auto-incrementing proposal counter.
    uint256 public nextProposalId;

    // ─── Errors ───────────────────────────────────────────────────────

    error AgentNotAlive(address agent);
    error ZeroVoteWeight(address agent);
    error ProposalNotFound(uint256 proposalId);
    error VotingClosed(uint256 proposalId);
    error AlreadyVoted(uint256 proposalId, address voter);
    error InvalidDuration();

    // ─── Events ───────────────────────────────────────────────────────

    /// @notice Emitted when a new proposal is created.
    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        bytes32 descriptionHash,
        uint256 deadline
    );

    /// @notice Emitted when an agent casts a vote.
    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        bool support,
        uint256 weight
    );

    // ─── Constructor ──────────────────────────────────────────────────

    /**
     * @notice Deploy a new ReputationWeightedVote contract.
     * @param pulseRegistry_   Address of the PulseRegistry contract.
     * @param peerAttestation_ Address of the PeerAttestation contract.
     */
    constructor(address pulseRegistry_, address peerAttestation_) {
        require(pulseRegistry_ != address(0), "zero registry");
        require(peerAttestation_ != address(0), "zero attestation");
        pulseRegistry = IPulseRegistry(pulseRegistry_);
        peerAttestation = IPeerAttestation(peerAttestation_);
    }

    // ─── View Helpers ─────────────────────────────────────────────────

    /**
     * @notice Compute the voting weight for an agent.
     * @dev    weight = streak × max(netAttestationScore, 0).
     *         Returns 0 if the agent is not alive, has zero streak, or has a
     *         non-positive attestation score.
     * @param agent The agent whose weight to compute.
     * @return weight The computed vote weight.
     */
    function getVoteWeight(address agent) public view returns (uint256 weight) {
        (bool alive, , uint256 streak, ) = pulseRegistry.getAgentStatus(agent);
        if (!alive || streak == 0) return 0;

        int256 netScore = peerAttestation.getNetAttestationScore(agent);
        if (netScore <= 0) return 0;

        weight = streak * uint256(netScore);
    }

    /**
     * @notice Get the current result of a proposal.
     * @param proposalId The proposal to query.
     * @return weightFor     Accumulated FOR weight.
     * @return weightAgainst Accumulated AGAINST weight.
     * @return open          True if voting is still open.
     */
    function getResult(uint256 proposalId)
        external
        view
        returns (uint256 weightFor, uint256 weightAgainst, bool open)
    {
        Proposal storage p = proposals[proposalId];
        if (!p.exists) revert ProposalNotFound(proposalId);
        return (p.weightFor, p.weightAgainst, block.timestamp <= p.deadline);
    }

    // ─── Proposal Management ──────────────────────────────────────────

    /**
     * @notice Create a new proposal.
     * @dev    Only alive agents can create proposals (prevents spam).
     * @param descriptionHash keccak256 of the off-chain proposal description.
     * @param durationSeconds How long voting stays open.
     * @return proposalId The ID of the new proposal.
     */
    function createProposal(bytes32 descriptionHash, uint256 durationSeconds)
        external
        returns (uint256 proposalId)
    {
        if (durationSeconds == 0) revert InvalidDuration();

        // Only alive agents can propose.
        (bool alive, , , ) = pulseRegistry.getAgentStatus(msg.sender);
        if (!alive) revert AgentNotAlive(msg.sender);

        proposalId = nextProposalId++;
        proposals[proposalId] = Proposal({
            descriptionHash: descriptionHash,
            deadline: block.timestamp + durationSeconds,
            weightFor: 0,
            weightAgainst: 0,
            exists: true
        });

        emit ProposalCreated(proposalId, msg.sender, descriptionHash, block.timestamp + durationSeconds);
    }

    // ─── Voting ───────────────────────────────────────────────────────

    /**
     * @notice Cast a reputation-weighted vote on a proposal.
     * @param proposalId The proposal to vote on.
     * @param support    True = FOR, False = AGAINST.
     */
    function vote(uint256 proposalId, bool support) external nonReentrant {
        Proposal storage p = proposals[proposalId];
        if (!p.exists) revert ProposalNotFound(proposalId);
        if (block.timestamp > p.deadline) revert VotingClosed(proposalId);
        if (hasVoted[proposalId][msg.sender]) revert AlreadyVoted(proposalId, msg.sender);

        // Compute weight at vote time.
        uint256 weight = getVoteWeight(msg.sender);
        if (weight == 0) revert ZeroVoteWeight(msg.sender);

        // Record vote (CEI: state changes before any external interaction).
        hasVoted[proposalId][msg.sender] = true;
        voteWeight[proposalId][msg.sender] = weight;

        if (support) {
            p.weightFor += weight;
        } else {
            p.weightAgainst += weight;
        }

        emit VoteCast(proposalId, msg.sender, support, weight);
    }
}
