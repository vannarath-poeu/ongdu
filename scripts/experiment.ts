#!/usr/bin/env npx ts-node
// AI Experiment Runner - Compare hard AI vs easy AI performance

import * as fs from 'fs';
import {
  ExperimentConfig,
  GameResult,
  CLIArgs,
  CLI_DEFAULTS,
  CSV_HEADERS,
  gameResultToCSV,
  getPlayerSplit,
  PlayerCount,
  SplitType,
  ExperimentPlayer,
} from './experiment-types';
import {
  Card,
  Player,
  PlayerArrangement,
} from '../lib/types';
import {
  createDeck,
  dealCards,
  calculateRoundScores,
  applyRoundScores,
} from '../lib/game-logic';
import {
  findBestArrangementByDifficulty,
  chooseCardToDiscardByDifficulty,
  AIContext,
} from '../lib/ai';

const STARTING_CASH = 1000;

// Create experiment players with specified difficulty split
function createExperimentPlayers(
  playerCount: PlayerCount,
  split: SplitType
): ExperimentPlayer[] {
  const { hardCount, easyCount } = getPlayerSplit(playerCount, split);
  const players: ExperimentPlayer[] = [];

  // Create hard AI players
  for (let i = 0; i < hardCount; i++) {
    players.push({
      id: `hard-${i + 1}`,
      name: `Hard AI ${i + 1}`,
      difficulty: 'hard',
      cash: STARTING_CASH,
      isBankrupt: false,
    });
  }

  // Create easy AI players
  for (let i = 0; i < easyCount; i++) {
    players.push({
      id: `easy-${i + 1}`,
      name: `Easy AI ${i + 1}`,
      difficulty: 'easy',
      cash: STARTING_CASH,
      isBankrupt: false,
    });
  }

  return players;
}

// Convert ExperimentPlayer to game Player for scoring
function toGamePlayer(
  expPlayer: ExperimentPlayer,
  hand: Card[],
  arrangement: PlayerArrangement | null
): Player {
  return {
    id: expPlayer.id,
    name: expPlayer.name,
    isHuman: false,
    cash: expPlayer.cash,
    hand,
    arrangement,
    isReady: arrangement !== null,
    isBankrupt: expPlayer.isBankrupt,
  };
}

// Build AIContext for a player
function buildAIContext(
  player: ExperimentPlayer,
  allPlayers: ExperimentPlayer[]
): AIContext {
  const opponents = allPlayers.filter(p => p.id !== player.id && !p.isBankrupt);
  return {
    difficulty: player.difficulty,
    myCash: player.cash,
    opponentCashes: opponents.map(p => p.cash),
    startingCash: STARTING_CASH,
    numOpponents: opponents.length,
  };
}

// Run a single round of the game
function runRound(
  players: ExperimentPlayer[],
  startingPlayerIndex: number
): ExperimentPlayer[] {
  const activePlayers = players.filter(p => !p.isBankrupt);
  if (activePlayers.length < 2) return players;

  const numPlayers = activePlayers.length;
  const deck = createDeck();
  const { hands } = dealCards(deck, numPlayers, startingPlayerIndex % numPlayers);

  // Each player arranges their cards
  const gamePlayers: Player[] = activePlayers.map((expPlayer, idx) => {
    let hand = hands[idx];
    const context = buildAIContext(expPlayer, activePlayers);

    // Handle 6-player discard phase
    if (numPlayers === 6 && idx === startingPlayerIndex % numPlayers) {
      const discardCard = chooseCardToDiscardByDifficulty(hand, context);
      hand = hand.filter(c => c.id !== discardCard.id);
    }

    // Find best arrangement
    const arrangement = findBestArrangementByDifficulty(hand, context);

    return toGamePlayer(expPlayer, hand, arrangement);
  });

  // Calculate and apply scores
  const scores = calculateRoundScores(gamePlayers);
  const updatedGamePlayers = applyRoundScores(gamePlayers, scores);

  // Update experiment players with new cash values
  return players.map(expPlayer => {
    const updated = updatedGamePlayers.find(gp => gp.id === expPlayer.id);
    if (updated) {
      return {
        ...expPlayer,
        cash: updated.cash,
        isBankrupt: updated.isBankrupt,
      };
    }
    return expPlayer;
  });
}

// Run a single game (multiple rounds until end condition)
export function runSingleGame(config: ExperimentConfig, gameNumber: number): GameResult {
  let players = createExperimentPlayers(config.players, config.split);
  let roundsPlayed = 0;
  let startingPlayerIndex = 0;

  // Play rounds until bankruptcy or max rounds
  while (roundsPlayed < config.maxRounds) {
    const anyBankrupt = players.some(p => p.isBankrupt);
    if (anyBankrupt) break;

    players = runRound(players, startingPlayerIndex);
    roundsPlayed++;
    startingPlayerIndex = (startingPlayerIndex + 1) % players.length;
  }

  // Calculate results
  const hardPlayers = players.filter(p => p.difficulty === 'hard');
  const easyPlayers = players.filter(p => p.difficulty === 'easy');

  const hardTotalCash = hardPlayers.reduce((sum, p) => sum + p.cash, 0);
  const easyTotalCash = easyPlayers.reduce((sum, p) => sum + p.cash, 0);

  const hardBankruptcies = hardPlayers.filter(p => p.isBankrupt).length;
  const easyBankruptcies = easyPlayers.filter(p => p.isBankrupt).length;

  let winner: 'hard' | 'easy' | 'tie';
  if (hardTotalCash > easyTotalCash) {
    winner = 'hard';
  } else if (easyTotalCash > hardTotalCash) {
    winner = 'easy';
  } else {
    winner = 'tie';
  }

  return {
    gameId: `${config.players}p-${config.split}-${gameNumber}`,
    players: config.players,
    split: config.split,
    roundsPlayed,
    hardAiCount: hardPlayers.length,
    easyAiCount: easyPlayers.length,
    hardTotalCash,
    easyTotalCash,
    hardAvgCash: hardPlayers.length > 0 ? hardTotalCash / hardPlayers.length : 0,
    easyAvgCash: easyPlayers.length > 0 ? easyTotalCash / easyPlayers.length : 0,
    hardBankruptcies,
    easyBankruptcies,
    winner,
  };
}

// Run experiment for a single configuration
export function runExperiment(
  config: ExperimentConfig,
  appendToFile: boolean = false
): GameResult[] {
  const results: GameResult[] = [];

  // Write header if not appending
  if (!appendToFile) {
    fs.writeFileSync(config.outputPath, CSV_HEADERS.join(',') + '\n');
  }

  const startTime = Date.now();
  const updateInterval = Math.max(1, Math.floor(config.games / 10)); // Update every 10%

  for (let i = 1; i <= config.games; i++) {
    const result = runSingleGame(config, i);
    results.push(result);

    // Write incrementally
    fs.appendFileSync(config.outputPath, gameResultToCSV(result) + '\n');

    // Progress update
    if (i % updateInterval === 0 || i === config.games) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const percent = ((i / config.games) * 100).toFixed(0);
      process.stdout.write(
        `\r  Progress: ${i}/${config.games} (${percent}%) - ${elapsed}s elapsed`
      );
    }
  }

  console.log(); // New line after progress
  return results;
}

// Calculate and print summary statistics
function printSummary(
  config: ExperimentConfig,
  results: GameResult[]
): void {
  const { hardCount, easyCount } = getPlayerSplit(config.players, config.split);

  console.log(`\nConfiguration: ${config.players} players, ${config.split} split (${hardCount} hard vs ${easyCount} easy)`);
  console.log(`Games: ${results.length} | Avg rounds: ${(results.reduce((sum, r) => sum + r.roundsPlayed, 0) / results.length).toFixed(1)}`);
  console.log('--------------------------------------------------------------------------------');

  // Calculate averages
  const avgHardCash = results.reduce((sum, r) => sum + r.hardAvgCash, 0) / results.length;
  const avgEasyCash = results.reduce((sum, r) => sum + r.easyAvgCash, 0) / results.length;
  const cashDiff = avgHardCash - avgEasyCash;
  const cashDiffPercent = avgEasyCash > 0 ? ((cashDiff / avgEasyCash) * 100).toFixed(1) : 'N/A';

  const hardWins = results.filter(r => r.winner === 'hard').length;
  const easyWins = results.filter(r => r.winner === 'easy').length;
  const hardWinRate = ((hardWins / results.length) * 100).toFixed(1);
  const easyWinRate = ((easyWins / results.length) * 100).toFixed(1);
  const winRateDiff = (hardWins - easyWins) / results.length * 100;

  const totalHardBankruptcies = results.reduce((sum, r) => sum + r.hardBankruptcies, 0);
  const totalEasyBankruptcies = results.reduce((sum, r) => sum + r.easyBankruptcies, 0);
  const hardBankruptRate = ((totalHardBankruptcies / (results.length * hardCount)) * 100).toFixed(1);
  const easyBankruptRate = ((totalEasyBankruptcies / (results.length * easyCount)) * 100).toFixed(1);

  console.log('                    Hard AI          Easy AI          Difference');
  console.log(`Avg Cash:           ${avgHardCash.toFixed(0).padStart(6)}           ${avgEasyCash.toFixed(0).padStart(6)}           ${cashDiff >= 0 ? '+' : ''}${cashDiff.toFixed(0)} (${cashDiff >= 0 ? '+' : ''}${cashDiffPercent}%)`);
  console.log(`Win Rate:           ${hardWinRate.padStart(5)}%          ${easyWinRate.padStart(5)}%          ${winRateDiff >= 0 ? '+' : ''}${winRateDiff.toFixed(1)}pp`);
  console.log(`Bankruptcies:       ${totalHardBankruptcies} (${hardBankruptRate}%)       ${totalEasyBankruptcies} (${easyBankruptRate}%)        ${parseFloat(hardBankruptRate) - parseFloat(easyBankruptRate) >= 0 ? '+' : ''}${(parseFloat(hardBankruptRate) - parseFloat(easyBankruptRate)).toFixed(1)}pp`);
  console.log('--------------------------------------------------------------------------------');
}

// Parse CLI arguments
function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const result: CLIArgs = { ...CLI_DEFAULTS };

  for (const arg of args) {
    const [key, value] = arg.replace('--', '').split('=');

    switch (key) {
      case 'players':
        result.players = value === 'all' ? 'all' : (parseInt(value, 10) as PlayerCount);
        break;
      case 'games':
        result.games = parseInt(value, 10);
        break;
      case 'split':
        result.split = value as SplitType | 'all';
        break;
      case 'output':
        result.output = value;
        break;
      case 'rounds':
        result.rounds = parseInt(value, 10);
        break;
    }
  }

  return result;
}

// Build experiment configurations from CLI args
function buildConfigs(args: CLIArgs): ExperimentConfig[] {
  const playerCounts: PlayerCount[] =
    args.players === 'all' ? [2, 4, 6] : [args.players];
  const splitTypes: SplitType[] =
    args.split === 'all' ? ['half', 'solo'] : [args.split];

  const configs: ExperimentConfig[] = [];

  for (const players of playerCounts) {
    for (const split of splitTypes) {
      configs.push({
        players,
        split,
        games: args.games,
        maxRounds: args.rounds,
        outputPath: args.output,
      });
    }
  }

  return configs;
}

// Main entry point
async function main(): Promise<void> {
  const args = parseArgs();
  const configs = buildConfigs(args);

  console.log('================================================================================');
  console.log('AI EXPERIMENT RUNNER');
  console.log('================================================================================');
  console.log(`Games per config: ${args.games} | Max rounds: ${args.rounds}`);
  console.log(`Output file: ${args.output}`);
  console.log(`Configurations to run: ${configs.length}`);
  console.log('================================================================================\n');

  // Clear/create output file with header
  fs.writeFileSync(args.output, CSV_HEADERS.join(',') + '\n');

  const allResults: Map<string, GameResult[]> = new Map();

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    const configKey = `${config.players}p-${config.split}`;

    console.log(`\n[${i + 1}/${configs.length}] Running: ${config.players} players, ${config.split} split`);

    const results = runExperiment({ ...config, outputPath: args.output }, true);
    allResults.set(configKey, results);
  }

  // Print final summary
  console.log('\n================================================================================');
  console.log('AI EXPERIMENT RESULTS');
  console.log('================================================================================');

  for (const [configKey, results] of allResults) {
    const [playersStr, split] = configKey.split('-') as [string, SplitType];
    const players = parseInt(playersStr) as PlayerCount;
    printSummary(
      { players, split, games: results.length, maxRounds: args.rounds, outputPath: args.output },
      results
    );
  }

  console.log(`\nResults saved to: ${args.output}`);
}

// Run if executed directly
main().catch(console.error);
