// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ═══════════════════════════════════════════════════════════════════
//  DESK WATCH LENS — Batch Reader for Frontend
//  Reads all game state in minimal RPC calls for the React dashboard
// ═══════════════════════════════════════════════════════════════════

import {DeskWatchGame} from "./DeskWatchGame.sol";

interface IPulseRegistry {
    function lastPulse(address agent) external view returns (uint256);
    function ttl(address agent) external view returns (uint256);
    function isAlive(address agent) external view returns (bool);
    function isRegistered(address agent) external view returns (bool);
}

/// @title DeskWatchLens
/// @notice Batch reader contract for efficient frontend data fetching
/// @dev Call getFullState() once per poll interval instead of dozens of individual reads
contract DeskWatchLens {

    struct DeskView {
        bytes32 deskId;
        string name;
        address pulseAgent;
        address operator;
        uint8 status;          // 0=Active, 1=Dead, 2=Retired
        uint256 gameTTL;
        uint256 totalDeaths;
        uint256 totalWatched;
        // Live pulse data from PulseRegistryV2
        uint256 lastPulseTime;
        uint256 protocolTTL;
        bool isAliveOnChain;
        bool isAliveForGame;   // Game TTL is tighter
        uint256 timeSincePulse;
        // Current round game data
        uint256 pool;
        uint256 effectivePool; // Including rollover
        uint256 watcherCount;
        uint256 rollover;
        bool isDeadThisRound;
    }

    struct RoundView {
        uint256 id;
        uint256 startTime;
        uint256 endTime;
        uint256 timeRemaining;
        uint8 status;          // 0=Active, 1=Settled
    }

    struct WatchView {
        address watcher;
        bytes32 deskId;
        uint8 tier;            // 0=Scout, 1=Sentinel, 2=Sniper
        uint256 amount;
        uint256 weight;
        uint256 timestamp;
        bool claimed;
    }

    struct PlayerView {
        uint256 totalEarnings;
        uint256 totalDesksCaught;
        uint256 totalWatchCount;
        WatchView[] activeWatches;   // This round's watches
        UnclaimedReward[] unclaimed; // Past round unclaimed
    }

    struct UnclaimedReward {
        uint256 roundId;
        bytes32 deskId;
        uint256 reward;
    }

    struct LeaderboardEntry {
        address wallet;
        uint256 totalEarnings;
        uint256 totalDesksCaught;
        uint256 totalWatchCount;
    }

    struct GlobalStats {
        uint256 totalVolume;
        uint256 totalDeathsAllTime;
        uint256 totalPayoutsAllTime;
        uint256 contractBalance;
        uint256 protocolFeeBps;
        uint256 operatorFeeBps;
        uint256 roundDuration;
    }

    struct FullStateView {
        RoundView round;
        DeskView[] desks;
        GlobalStats stats;
    }

    /// @notice Get the complete game state in one call
    /// @param _game Address of DeskWatchGame contract
    /// @return state Full game state for frontend rendering
    function getFullState(address _game) external view returns (FullStateView memory state) {
        DeskWatchGame game = DeskWatchGame(payable(_game));
        IPulseRegistry pulse = IPulseRegistry(address(game.pulseRegistry()));

        // Round info
        (
            uint256 roundId,
            uint256 startTime,
            uint256 endTime,
            DeskWatchGame.RoundStatus roundStatus
        ) = game.currentRound();

        state.round = RoundView({
            id: roundId,
            startTime: startTime,
            endTime: endTime,
            timeRemaining: roundStatus == DeskWatchGame.RoundStatus.Active && block.timestamp < endTime
                ? endTime - block.timestamp
                : 0,
            status: uint8(roundStatus)
        });

        // Desk data
        bytes32[] memory deskIdList = game.getAllDeskIds();
        state.desks = new DeskView[](deskIdList.length);

        for (uint256 i = 0; i < deskIdList.length; i++) {
            bytes32 did = deskIdList[i];
            DeskView memory dv;
            DeskWatchGame.DeskStatus dStatus;

            // Populate desk metadata from the game contract.
            (
                dv.deskId,
                dv.pulseAgent,
                dv.operator,
                dv.name,
                dv.gameTTL,
                dStatus,
                dv.totalDeaths,
                dv.totalWatched
            ) = game.desks(did);
            dv.status = uint8(dStatus);

            // Pulse state (read-only from PulseRegistryV2).
            if (dv.pulseAgent != address(0)) {
                try pulse.lastPulse(dv.pulseAgent) returns (uint256 lp) {
                    dv.lastPulseTime = lp;
                    dv.timeSincePulse = block.timestamp > lp ? block.timestamp - lp : 0;
                    dv.isAliveForGame = dv.timeSincePulse <= dv.gameTTL;
                } catch {}

                try pulse.ttl(dv.pulseAgent) returns (uint256 t) {
                    dv.protocolTTL = t;
                } catch {}

                try pulse.isAlive(dv.pulseAgent) returns (bool a) {
                    dv.isAliveOnChain = a;
                } catch {}
            }

            // Current-round game state.
            if (roundId > 0 && roundStatus == DeskWatchGame.RoundStatus.Active) {
                dv.pool = game.pools(roundId, did);
                dv.isDeadThisRound = game.isDead(roundId, did);
                dv.watcherCount = game.getWatcherCount(did);
            }

            dv.rollover = game.rolloverPool(did);
            dv.effectivePool = dv.pool + dv.rollover;

            state.desks[i] = dv;
        }

        // Global stats
        state.stats = GlobalStats({
            totalVolume: game.totalVolume(),
            totalDeathsAllTime: game.totalDeathsAllTime(),
            totalPayoutsAllTime: game.totalPayoutsAllTime(),
            contractBalance: address(game).balance,
            protocolFeeBps: game.protocolFeeBps(),
            operatorFeeBps: game.operatorFeeBps(),
            roundDuration: game.roundDuration()
        });
    }

    /// @notice Get a player's full state including active watches and unclaimed rewards
    /// @param _game Address of DeskWatchGame contract
    /// @param _player Player wallet address
    /// @param _checkRounds Array of past round IDs to check for unclaimed rewards
    function getPlayerState(
        address _game,
        address _player,
        uint256[] calldata _checkRounds
    ) external view returns (PlayerView memory player) {
        DeskWatchGame game = DeskWatchGame(payable(_game));

        player.totalEarnings = game.totalEarnings(_player);
        player.totalDesksCaught = game.totalDesksCaught(_player);
        player.totalWatchCount = game.totalWatchCount(_player);

        // Current round watches (scoped to avoid stack-too-deep).
        {
            (uint256 roundId,,, DeskWatchGame.RoundStatus roundStatus) = game.currentRound();

            if (roundId > 0 && roundStatus == DeskWatchGame.RoundStatus.Active) {
                bytes32[] memory deskIdList = game.getAllDeskIds();

                // Count watches first.
                uint256 watchCount = 0;
                for (uint256 i = 0; i < deskIdList.length; i++) {
                    if (game.hasWatched(roundId, deskIdList[i], _player)) {
                        watchCount++;
                    }
                }

                player.activeWatches = new WatchView[](watchCount);
                uint256 idx = 0;

                for (uint256 i = 0; i < deskIdList.length; i++) {
                    if (game.hasWatched(roundId, deskIdList[i], _player)) {
                        DeskWatchGame.Watch[] memory watches = game.getWatches(roundId, deskIdList[i]);
                        for (uint256 j = 0; j < watches.length; j++) {
                            if (watches[j].watcher == _player) {
                                player.activeWatches[idx] = WatchView({
                                    watcher: watches[j].watcher,
                                    deskId: watches[j].deskId,
                                    tier: uint8(watches[j].tier),
                                    amount: watches[j].amount,
                                    weight: watches[j].weight,
                                    timestamp: watches[j].timestamp,
                                    claimed: watches[j].claimed
                                });
                                idx++;
                                break;
                            }
                        }
                    }
                }
            }
        }

        // Past rounds: unclaimed rewards (scoped to avoid stack-too-deep).
        {
            bytes32[] memory deskIdList = game.getAllDeskIds();

            uint256 unclaimedCount = 0;
            for (uint256 r = 0; r < _checkRounds.length; r++) {
                for (uint256 d = 0; d < deskIdList.length; d++) {
                    (bool has,) = game.hasUnclaimedReward(_checkRounds[r], deskIdList[d], _player);
                    if (has) unclaimedCount++;
                }
            }

            player.unclaimed = new UnclaimedReward[](unclaimedCount);
            uint256 uIdx = 0;
            for (uint256 r = 0; r < _checkRounds.length; r++) {
                for (uint256 d = 0; d < deskIdList.length; d++) {
                    (bool has, uint256 reward) = game.hasUnclaimedReward(_checkRounds[r], deskIdList[d], _player);
                    if (has) {
                        player.unclaimed[uIdx] = UnclaimedReward({
                            roundId: _checkRounds[r],
                            deskId: deskIdList[d],
                            reward: reward
                        });
                        uIdx++;
                    }
                }
            }
        }
    }
}
