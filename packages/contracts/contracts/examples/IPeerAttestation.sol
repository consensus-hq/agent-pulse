// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPeerAttestation
 * @author Agent Pulse
 * @notice Minimal interface for reading PeerAttestation state in composable contracts.
 * @dev Deployed on Base at 0x930dC6130b20775E01414a5923e7C66b62FF8d6C.
 */
interface IPeerAttestation {
    /// @notice Net attestation score (positive weight − negative weight). Can be negative.
    function getNetAttestationScore(address subject) external view returns (int256 netScore);

    /// @notice Detailed attestation stats for a subject.
    /// @return positiveWeight  Total weight of positive attestations.
    /// @return negativeWeight  Total weight of negative attestations.
    /// @return netScore        positiveWeight − negativeWeight.
    function getAttestationStats(address subject)
        external
        view
        returns (uint256 positiveWeight, uint256 negativeWeight, int256 netScore);
}
