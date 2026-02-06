// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title BurnWithFee
 * @notice Wrapper that splits a token "burn" into:
 *         - (amount - fee) sent to the canonical dead address
 *         - fee sent to an infrastructure fee wallet
 * @dev "Burn" here is implemented as an ERC20 transfer to the dead address.
 */
contract BurnWithFee is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    /// @notice Basis points denominator.
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Maximum fee in basis points (5%).
    uint256 public constant MAX_FEE = 500;

    // ============ Immutable Config ============
    IERC20 public immutable pulseToken;

    // ============ Mutable Config ============
    address public feeWallet;

    /// @notice Fee in basis points. 1% = 100 bps.
    uint256 public feeBps = 100;

    /// @notice Minimum amount allowed (in token base units).
    /// @dev Prevents dust burns (and, for typical configs, zero-fee rounding).
    uint256 public minBurnAmount = 100;

    // ============ Events ============
    event BurnExecuted(address indexed agent, uint256 burnAmount, uint256 feeAmount);
    event FeeWalletUpdated(address newWallet);
    event FeeBpsUpdated(uint256 newBps);
    event MinBurnAmountUpdated(uint256 newMinBurnAmount);

    // ============ Errors ============
    error ZeroAddress();
    error FeeBpsTooHigh(uint256 provided, uint256 max);
    error InvalidMinBurnAmount();
    error BelowMinimumBurn(uint256 provided, uint256 minimum);
    error FeeRoundsToZero(uint256 amount, uint256 feeBps);

    // ============ Constructor ============
    constructor(address _pulseToken, address _feeWallet) Ownable(msg.sender) {
        if (_pulseToken == address(0) || _feeWallet == address(0)) revert ZeroAddress();

        pulseToken = IERC20(_pulseToken);
        feeWallet = _feeWallet;

        emit FeeWalletUpdated(_feeWallet);
        emit FeeBpsUpdated(feeBps);
        emit MinBurnAmountUpdated(minBurnAmount);
    }

    // ============ External Functions ============
    /**
     * @notice Transfer tokens from the caller, splitting the amount between burn + fee.
     * @param amount Total amount to process (burn + fee)
     * @return burnAmount Amount transferred to DEAD
     * @return feeAmount Amount transferred to feeWallet
     */
    function burnWithFee(uint256 amount) external nonReentrant returns (uint256 burnAmount, uint256 feeAmount) {
        if (amount < minBurnAmount) revert BelowMinimumBurn(amount, minBurnAmount);

        feeAmount = (amount * feeBps) / BPS_DENOMINATOR;
        if (feeBps != 0 && feeAmount == 0) revert FeeRoundsToZero(amount, feeBps);

        burnAmount = amount - feeAmount;

        // Interactions
        pulseToken.safeTransferFrom(msg.sender, DEAD, burnAmount);
        if (feeAmount != 0) {
            pulseToken.safeTransferFrom(msg.sender, feeWallet, feeAmount);
        }

        emit BurnExecuted(msg.sender, burnAmount, feeAmount);
        return (burnAmount, feeAmount);
    }

    // ============ Admin Functions ============
    function setFeeWallet(address newWallet) external onlyOwner {
        if (newWallet == address(0)) revert ZeroAddress();
        feeWallet = newWallet;
        emit FeeWalletUpdated(newWallet);
    }

    function setFeeBps(uint256 newBps) external onlyOwner {
        if (newBps > MAX_FEE) revert FeeBpsTooHigh(newBps, MAX_FEE);
        feeBps = newBps;
        emit FeeBpsUpdated(newBps);
    }

    function setMinBurn(uint256 newMinBurn) external onlyOwner {
        if (newMinBurn == 0) revert InvalidMinBurnAmount();
        minBurnAmount = newMinBurn;
        emit MinBurnAmountUpdated(newMinBurn);
    }
}
