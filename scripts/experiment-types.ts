// Types for AI experiment runner

import { AIDifficulty } from '../lib/types';

export type PlayerCount = 2 | 4 | 6;
export type SplitType = 'half' | 'solo';

// Configuration for a single experiment run
export interface ExperimentConfig {
  players: PlayerCount;
  split: SplitType;
  games: number;
  maxRounds: number;
  outputPath: string;
}

// Configuration for the full experiment session
export interface ExperimentSessionConfig {
  playerCounts: PlayerCount[];
  splitTypes: SplitType[];
  gamesPerConfig: number;
  maxRounds: number;
  outputPath: string;
}

// Result from a single game
export interface GameResult {
  gameId: string;
  players: PlayerCount;
  split: SplitType;
  roundsPlayed: number;
  hardAiCount: number;
  easyAiCount: number;
  hardTotalCash: number;
  easyTotalCash: number;
  hardAvgCash: number;
  easyAvgCash: number;
  hardBankruptcies: number;
  easyBankruptcies: number;
  winner: 'hard' | 'easy' | 'tie';
}

// CSV header row
export const CSV_HEADERS = [
  'game_id',
  'players',
  'split',
  'rounds_played',
  'hard_ai_count',
  'easy_ai_count',
  'hard_total_cash',
  'easy_total_cash',
  'hard_avg_cash',
  'easy_avg_cash',
  'hard_bankruptcies',
  'easy_bankruptcies',
  'winner',
] as const;

// Convert GameResult to CSV row
export function gameResultToCSV(result: GameResult): string {
  return [
    result.gameId,
    result.players,
    result.split,
    result.roundsPlayed,
    result.hardAiCount,
    result.easyAiCount,
    result.hardTotalCash,
    result.easyTotalCash,
    result.hardAvgCash.toFixed(2),
    result.easyAvgCash.toFixed(2),
    result.hardBankruptcies,
    result.easyBankruptcies,
    result.winner,
  ].join(',');
}

// CLI argument parsing result
export interface CLIArgs {
  players: PlayerCount | 'all';
  split: SplitType | 'all';
  games: number;
  rounds: number;
  output: string;
}

// Default values for CLI args
export const CLI_DEFAULTS: CLIArgs = {
  players: 'all',
  split: 'all',
  games: 100,
  rounds: 50,
  output: 'experiment-results.csv',
};

// Get player split configuration
export function getPlayerSplit(
  playerCount: PlayerCount,
  split: SplitType
): { hardCount: number; easyCount: number } {
  if (split === 'half') {
    return {
      hardCount: playerCount / 2,
      easyCount: playerCount / 2,
    };
  }
  // solo: one hard AI vs rest easy AI
  return {
    hardCount: 1,
    easyCount: playerCount - 1,
  };
}

// Experiment player info for tracking during simulation
export interface ExperimentPlayer {
  id: string;
  name: string;
  difficulty: AIDifficulty;
  cash: number;
  isBankrupt: boolean;
}
