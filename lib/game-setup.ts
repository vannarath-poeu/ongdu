export type GameLength = 'quick' | 'standard' | 'longer';

export const GAME_LENGTH_OPTIONS: { value: GameLength; label: string; rounds: number }[] = [
  { value: 'quick', label: 'Quick', rounds: 5 },
  { value: 'standard', label: 'Standard', rounds: 10 },
  { value: 'longer', label: 'Longer', rounds: 20 },
];

// Initial estimates from sampled easy-AI payouts; these are bankroll presets,
// not round limits. More opponents increase the amount settled each round.
const STARTING_CASH: Record<number, Record<GameLength, number>> = {
  2: { quick: 15, standard: 20, longer: 30 },
  3: { quick: 25, standard: 40, longer: 60 },
  4: { quick: 40, standard: 60, longer: 85 },
  5: { quick: 50, standard: 75, longer: 115 },
  6: { quick: 75, standard: 110, longer: 160 },
};

export function getStartingCash(playerCount: number, length: GameLength): number {
  if (!Number.isInteger(playerCount) || !Object.hasOwn(STARTING_CASH, playerCount)) {
    throw new Error('Choose between 2 and 6 players.');
  }
  return STARTING_CASH[playerCount][length];
}
