// Card types and game state definitions for Ongdu

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  id: string;
  suit: Suit | 'wild';
  rank: Rank | 'WILD';
  isWild: boolean;
}

export interface Layer {
  cards: (Card | null)[];
}

export interface PlayerArrangement {
  top: Layer;
  middle: Layer;
  bottom: Layer;
}

export interface Player {
  id: string;
  name: string;
  isHuman: boolean;
  cash: number;
  hand: Card[];
  arrangement: PlayerArrangement | null;
  isReady: boolean;
  isBankrupt: boolean;
}

export type GamePhase = 
  | 'lobby'
  | 'dealing'
  | 'discard'      // 6-player only
  | 'arrangement'
  | 'reveal'
  | 'scoring'
  | 'gameOver';

export interface GameState {
  phase: GamePhase;
  players: Player[];
  deck: Card[];
  discardPile: Card[];
  startingPlayerIndex: number;
  currentRound: number;
  roundScores: RoundScore[] | null;
}

export interface RoundScore {
  playerId: string;
  playerName: string;
  pointsAgainst: Record<string, number>; // playerId -> points won/lost
  totalPoints: number;
  cashChange: number;
}

// Hand types ranked from highest (1) to lowest
export enum HandType {
  THREE_OF_KIND_PURE = 1,      // Three of a kind without wildcards
  STRAIGHT_FLUSH_JQK = 2,      // J-Q-K same suit
  STRAIGHT_JQK = 3,            // J-Q-K any suits
  THREE_OF_KIND_WILD = 4,      // Three of a kind with wildcards
  THREE_FACE_CARDS = 5,        // Any J, Q, K combination
  SUM_MODULO = 6,              // Sum mod 10 (1-9)
}

export interface HandEvaluation {
  type: HandType;
  value: number;              // For tiebreakers (rank value or sum)
  description: string;
}

export interface LayerComparison {
  layer: 'top' | 'middle' | 'bottom';
  player1Score: number;
  player2Score: number;
  winner: string | null;      // Player ID or null for tie
}

export interface MatchupResult {
  player1Id: string;
  player2Id: string;
  layerComparisons: LayerComparison[];
  player1TotalPoints: number;
  player2TotalPoints: number;
  player1Foul: boolean;
  player2Foul: boolean;
}

