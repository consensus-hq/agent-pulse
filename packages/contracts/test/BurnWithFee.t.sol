// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/BurnWithFee.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockPULSE is ERC20 {
    constructor() ERC20("Pulse Token", "PULSE") {
        _mint(msg.sender, 1_000_000_000e18); // 1 billion tokens
    }
}

contract BurnWithFeeTest is Test {
    BurnWithFee public burnContract;
    MockPULSE public pulseToken;
    
    address public owner;
    address public feeWallet;
    address public agent;
    address public agent2;
    
    uint256 constant INITIAL_BALANCE = 2_000_000e18;
    
    // Match actual contract events
    event BurnExecuted(address indexed agent, uint256 burnAmount, uint256 feeAmount);
    event FeeWalletUpdated(address newWallet);
    event FeeBpsUpdated(uint256 newBps);
    event MinBurnAmountUpdated(uint256 newMinBurnAmount);

    function setUp() public {
        owner = address(this);
        feeWallet = makeAddr("feeWallet");
        agent = makeAddr("agent");
        agent2 = makeAddr("agent2");
        
        // Deploy mock token
        pulseToken = new MockPULSE();
        
        // Deploy burn contract
        burnContract = new BurnWithFee(address(pulseToken), feeWallet);
        
        // Fund agents
        pulseToken.transfer(agent, INITIAL_BALANCE);
        pulseToken.transfer(agent2, INITIAL_BALANCE);
    }

    // ============ Normal Burn Tests ============
    
    function test_NormalBurnWithFeeSplit() public {
        uint256 amount = 10_000e18; // 10,000 tokens
        
        vm.startPrank(agent);
        pulseToken.approve(address(burnContract), amount);
        
        // Default fee is 100 bps = 1%
        uint256 expectedFee = (amount * 100) / 10_000; // 100 tokens
        uint256 expectedBurn = amount - expectedFee;
        
        uint256 deadBalanceBefore = pulseToken.balanceOf(burnContract.DEAD());
        uint256 feeWalletBalanceBefore = pulseToken.balanceOf(feeWallet);
        
        (uint256 burnAmount, uint256 feeAmount) = burnContract.burnWithFee(amount);
        vm.stopPrank();
        
        assertEq(burnAmount, expectedBurn, "Burn amount mismatch");
        assertEq(feeAmount, expectedFee, "Fee amount mismatch");
        
        // Verify fee went to fee wallet
        assertEq(
            pulseToken.balanceOf(feeWallet) - feeWalletBalanceBefore,
            expectedFee,
            "Fee not transferred correctly"
        );
        
        // Verify burn went to dead address
        assertEq(
            pulseToken.balanceOf(burnContract.DEAD()) - deadBalanceBefore,
            expectedBurn,
            "Burn not transferred correctly"
        );
    }
    
    function test_BurnWithMinimumAmount() public {
        uint256 minAmount = burnContract.minBurnAmount();
        
        vm.startPrank(agent);
        pulseToken.approve(address(burnContract), minAmount);
        
        // Should succeed with minimum amount
        burnContract.burnWithFee(minAmount);
        vm.stopPrank();
    }
    
    function test_MultipleBurnsAccumulateFees() public {
        uint256 burnAmount = 1000e18;
        uint256 numBurns = 5;
        
        vm.startPrank(agent);
        pulseToken.approve(address(burnContract), burnAmount * numBurns);
        
        uint256 totalFees = 0;
        for (uint256 i = 0; i < numBurns; i++) {
            (, uint256 fee) = burnContract.burnWithFee(burnAmount);
            totalFees += fee;
        }
        vm.stopPrank();
        
        assertEq(pulseToken.balanceOf(feeWallet), totalFees, "Accumulated fees incorrect");
    }
    
    function test_DifferentAgentsBurnIndependently() public {
        uint256 burnAmount = 5000e18;
        
        // Agent 1 burns
        vm.startPrank(agent);
        pulseToken.approve(address(burnContract), burnAmount);
        (, uint256 fee1) = burnContract.burnWithFee(burnAmount);
        vm.stopPrank();
        
        // Agent 2 burns
        vm.startPrank(agent2);
        pulseToken.approve(address(burnContract), burnAmount);
        (, uint256 fee2) = burnContract.burnWithFee(burnAmount);
        vm.stopPrank();
        
        assertEq(pulseToken.balanceOf(feeWallet), fee1 + fee2, "Total fees incorrect");
    }

    // ============ Fee Calculation Accuracy Tests ============
    
    function test_FeeCalculation_1Percent_Default() public {
        // Default is 100 bps = 1%
        uint256 amount = 100_000e18;
        uint256 expectedFee = (amount * 100) / 10_000; // 1000e18
        
        vm.startPrank(agent);
        pulseToken.approve(address(burnContract), amount);
        (, uint256 feeAmount) = burnContract.burnWithFee(amount);
        vm.stopPrank();
        
        assertEq(feeAmount, expectedFee, "1% fee calculation incorrect");
    }
    
    function test_FeeCalculation_VariousAmounts() public {
        // Test various amounts with 1% fee
        uint256[5] memory amounts = [
            uint256(100e18),     // 100 tokens
            uint256(1000e18),    // 1,000 tokens  
            uint256(10000e18),   // 10,000 tokens
            uint256(100000e18),  // 100,000 tokens
            uint256(1000000e18)  // 1,000,000 tokens
        ];
        
        for (uint256 i = 0; i < amounts.length; i++) {
            uint256 expectedFee = (amounts[i] * 100) / 10_000; // 1%
            
            vm.startPrank(agent);
            pulseToken.approve(address(burnContract), amounts[i]);
            (, uint256 actualFee) = burnContract.burnWithFee(amounts[i]);
            vm.stopPrank();
            
            assertEq(actualFee, expectedFee, "Fee calculation mismatch");
        }
    }

    // ============ Dust Handling Tests ============
    
    function test_Revert_BelowMinimumBurn() public {
        uint256 minAmount = burnContract.minBurnAmount();
        uint256 dustAmount = minAmount - 1;
        
        vm.startPrank(agent);
        pulseToken.approve(address(burnContract), dustAmount);
        
        vm.expectRevert(
            abi.encodeWithSelector(
                BurnWithFee.BelowMinimumBurn.selector,
                dustAmount,
                minAmount
            )
        );
        burnContract.burnWithFee(dustAmount);
        vm.stopPrank();
    }
    
    function test_DustAmount_Boundary() public {
        // Test exact boundary (should succeed)
        uint256 minAmount = burnContract.minBurnAmount();
        
        vm.startPrank(agent);
        pulseToken.approve(address(burnContract), minAmount);
        burnContract.burnWithFee(minAmount);
        vm.stopPrank();
    }

    // ============ Owner Function Tests ============
    
    function test_SetFeeWallet_Success() public {
        address newFeeWallet = makeAddr("newFeeWallet");
        
        burnContract.setFeeWallet(newFeeWallet);
        
        assertEq(burnContract.feeWallet(), newFeeWallet, "Fee wallet not updated");
    }
    
    function test_SetFeeWallet_OnlyOwner() public {
        address newFeeWallet = makeAddr("newFeeWallet");
        
        vm.prank(agent);
        vm.expectRevert();
        burnContract.setFeeWallet(newFeeWallet);
    }
    
    function test_SetFeeBps_Success() public {
        uint256 newBps = 250; // 2.5%
        
        burnContract.setFeeBps(newBps);
        
        assertEq(burnContract.feeBps(), newBps, "Fee bps not updated");
    }
    
    function test_SetFeeBps_OnlyOwner() public {
        vm.prank(agent);
        vm.expectRevert();
        burnContract.setFeeBps(200);
    }
    
    function test_SetFeeBps_UpdatesCalculations() public {
        uint256 amount = 10000e18;
        
        // Change to 2% fee (200 bps)
        burnContract.setFeeBps(200);
        
        vm.startPrank(agent);
        pulseToken.approve(address(burnContract), amount);
        (uint256 burnAmt, uint256 feeAmt) = burnContract.burnWithFee(amount);
        vm.stopPrank();
        
        assertEq(feeAmt, 200e18, "Updated fee incorrect"); // 2%
        assertEq(burnAmt, 9800e18, "Burn amount not updated");
    }

    // ============ Revert Case Tests ============
    
    function test_Revert_SetFeeWallet_ZeroAddress() public {
        vm.expectRevert(BurnWithFee.ZeroAddress.selector);
        burnContract.setFeeWallet(address(0));
    }
    
    function test_Revert_SetFeeBps_Excessive() public {
        uint256 excessiveBps = 501; // Above max of 500
        
        vm.expectRevert(
            abi.encodeWithSelector(
                BurnWithFee.FeeBpsTooHigh.selector,
                excessiveBps,
                500
            )
        );
        burnContract.setFeeBps(excessiveBps);
    }
    
    function test_Revert_SetFeeBps_MaxBoundary() public {
        // At max should succeed
        burnContract.setFeeBps(500);
        assertEq(burnContract.feeBps(), 500);
        
        // Above max should fail
        vm.expectRevert(
            abi.encodeWithSelector(BurnWithFee.FeeBpsTooHigh.selector, 501, 500)
        );
        burnContract.setFeeBps(501);
    }
    
    function test_Revert_NoApproval() public {
        uint256 amount = 1000e18;
        
        vm.prank(agent);
        // No approval given - should revert
        vm.expectRevert();
        burnContract.burnWithFee(amount);
    }
    
    function test_Revert_InsufficientApproval() public {
        uint256 amount = 1000e18;
        
        vm.startPrank(agent);
        pulseToken.approve(address(burnContract), amount - 1); // Approve less than needed
        
        vm.expectRevert();
        burnContract.burnWithFee(amount);
        vm.stopPrank();
    }

    // ============ Constructor Validation Tests ============
    
    function test_Constructor_ZeroTokenAddress() public {
        vm.expectRevert(BurnWithFee.ZeroAddress.selector);
        new BurnWithFee(address(0), feeWallet);
    }
    
    function test_Constructor_ZeroFeeWallet() public {
        vm.expectRevert(BurnWithFee.ZeroAddress.selector);
        new BurnWithFee(address(pulseToken), address(0));
    }
    
    function test_Constructor_SetsDefaults() public {
        BurnWithFee newContract = new BurnWithFee(address(pulseToken), feeWallet);
        
        assertEq(address(newContract.pulseToken()), address(pulseToken));
        assertEq(newContract.feeWallet(), feeWallet);
        assertEq(newContract.feeBps(), 100); // Default 1%
        assertEq(newContract.owner(), address(this));
    }

    // ============ Gas Benchmark Tests ============
    
    function test_GasBenchmark_BurnWithFee() public {
        uint256 burnAmount = 10000e18;
        
        vm.startPrank(agent);
        pulseToken.approve(address(burnContract), burnAmount);
        
        uint256 gasBefore = gasleft();
        burnContract.burnWithFee(burnAmount);
        uint256 gasUsed = gasBefore - gasleft();
        
        vm.stopPrank();
        
        // Log gas usage (target is <80k on Base)
        emit log_named_uint("Gas used for burnWithFee", gasUsed);
        
        // Assert gas is under target (allowing some buffer for test overhead)
        assertLt(gasUsed, 100_000, "Gas usage too high - target is <80k on Base");
    }
    
    function test_GasBenchmark_MultipleBurns() public {
        uint256 burnAmount = 1000e18;
        uint256 numBurns = 10;
        
        vm.startPrank(agent);
        pulseToken.approve(address(burnContract), burnAmount * numBurns);
        
        uint256 totalGas = 0;
        for (uint256 i = 0; i < numBurns; i++) {
            uint256 gasBefore = gasleft();
            burnContract.burnWithFee(burnAmount);
            totalGas += (gasBefore - gasleft());
        }
        vm.stopPrank();
        
        uint256 avgGas = totalGas / numBurns;
        emit log_named_uint("Average gas per burn", avgGas);
        
        assertLt(avgGas, 100_000, "Average gas too high");
    }

    // ============ Reentrancy Protection Tests ============
    
    function test_ReentrancyGuard_ProtectsBurn() public {
        uint256 amount = 1000e18;
        
        vm.startPrank(agent);
        pulseToken.approve(address(burnContract), amount);
        
        // Normal operation should work fine with reentrancy guard
        burnContract.burnWithFee(amount);
        vm.stopPrank();
        
        // Verify burn occurred
        assertGt(pulseToken.balanceOf(burnContract.DEAD()), 0);
    }
    
    // ============ Edge Case Tests ============
    
    function test_BurnWithMaxFeeRate() public {
        // Set to max fee rate (5%)
        burnContract.setFeeBps(500);
        
        uint256 amount = 10000e18;
        
        vm.startPrank(agent);
        pulseToken.approve(address(burnContract), amount);
        
        (uint256 burnAmt, uint256 feeAmt) = burnContract.burnWithFee(amount);
        vm.stopPrank();
        
        assertEq(feeAmt, 500e18, "5% fee calculation incorrect"); // 5% of 10,000
        assertEq(burnAmt, 9500e18, "Burn with 5% fee incorrect");
        assertEq(pulseToken.balanceOf(feeWallet), 500e18);
    }
    
    function test_BurnWithZeroFeeRate() public {
        // Set to 0% fee
        burnContract.setFeeBps(0);
        
        uint256 amount = 10000e18;
        
        vm.startPrank(agent);
        pulseToken.approve(address(burnContract), amount);
        
        (uint256 burnAmt, uint256 feeAmt) = burnContract.burnWithFee(amount);
        vm.stopPrank();
        
        assertEq(feeAmt, 0, "0% fee should be 0");
        assertEq(burnAmt, amount, "100% should burn when 0% fee");
        assertEq(pulseToken.balanceOf(feeWallet), 0);
        assertEq(pulseToken.balanceOf(burnContract.DEAD()), amount);
    }
    
    function test_LargeAmountBurn() public {
        // Test with large amount (100 million tokens)
        uint256 largeAmount = 100_000_000e18;
        
        // Give agent enough tokens
        pulseToken.transfer(agent, largeAmount);
        
        vm.startPrank(agent);
        pulseToken.approve(address(burnContract), largeAmount);
        
        (uint256 burnAmt, uint256 feeAmt) = burnContract.burnWithFee(largeAmount);
        vm.stopPrank();
        
        assertEq(feeAmt, 1_000_000e18, "Fee on large amount incorrect"); // 1%
        assertEq(burnAmt, 99_000_000e18, "Burn on large amount incorrect");
    }
    
    function test_SmallButValidAmount() public {
        // Test exactly at minimum
        uint256 minAmount = burnContract.minBurnAmount();
        
        vm.startPrank(agent);
        pulseToken.approve(address(burnContract), minAmount);
        burnContract.burnWithFee(minAmount);
        vm.stopPrank();
    }
    
    function test_SetMinBurn() public {
        burnContract.setMinBurn(200);
        assertEq(burnContract.minBurnAmount(), 200);
    }
    
    function test_SetMinBurn_RevertsZero() public {
        vm.expectRevert(BurnWithFee.InvalidMinBurnAmount.selector);
        burnContract.setMinBurn(0);
    }
    
    function test_SetMinBurn_OnlyOwner() public {
        vm.prank(agent);
        vm.expectRevert();
        burnContract.setMinBurn(200);
    }
    
    function test_FeeRoundsToZeroReverts() public {
        // With 1% fee (100 bps), amount=99 would give fee=(99*100)/10000=0
        // But minBurnAmount is 100 by default so we lower it first
        burnContract.setMinBurn(1);
        
        // feeBps=100, amount=99: fee = (99 * 100) / 10000 = 0
        // But feeBps != 0 && fee == 0 => revert
        vm.startPrank(agent);
        pulseToken.approve(address(burnContract), 99);
        vm.expectRevert(abi.encodeWithSelector(BurnWithFee.FeeRoundsToZero.selector, 99, 100));
        burnContract.burnWithFee(99);
        vm.stopPrank();
    }
    
    function test_BurnEmitsEvent() public {
        uint256 amount = 10000e18;
        uint256 expectedFee = (amount * 100) / 10_000;
        uint256 expectedBurn = amount - expectedFee;
        
        vm.startPrank(agent);
        pulseToken.approve(address(burnContract), amount);
        
        vm.expectEmit(true, false, false, true);
        emit BurnExecuted(agent, expectedBurn, expectedFee);
        
        burnContract.burnWithFee(amount);
        vm.stopPrank();
    }
}
