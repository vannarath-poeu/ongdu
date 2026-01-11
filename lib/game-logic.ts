// Game logic for Ongdu - deck creation, shuffling, hand evaluation, scoring

import {
  Card,
  Suit,
  Rank,
  Player,
  PlayerArrangement,
  Layer,
  HandType,
  HandEvaluation,
  MatchupResult,
  LayerComparison,
  RoundScore,
} from './types';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// Create a full deck of 55 cards (52 standard + 3 wildcards)
export function createDeck(): Card[] {
  const deck: Card[] = [];
  
  // Standard 52 cards
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: `${rank}-${suit}`,
        suit,
        rank,
        isWild: false,
      });
    }
  }
  
  // 3 Wildcards (Jokers)
  for (let i = 1; i <= 3; i++) {
    deck.push({
      id: `wild-${i}`,
      suit: 'wild',
      rank: 'WILD',
      isWild: true,
    });
  }
  
  return deck;
}

// Cryptographically secure shuffle using Fisher-Yates algorithm
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  const array = new Uint32Array(shuffled.length);
  crypto.getRandomValues(array);
  
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = array[i] % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled;
}

// Deal cards to players
// In 6-player games, startingPlayerIndex receives 10 cards (must discard 1)
export function dealCards(deck: Card[], numPlayers: number, startingPlayerIndex: number = 0): { hands: Card[][]; remainingDeck: Card[] } {
  const shuffled = shuffleDeck(deck);
  const hands: Card[][] = [];
  
  // In 6-player games, the starting player gets 10 cards
  const getCardCount = (playerIndex: number) => {
    if (numPlayers === 6 && playerIndex === startingPlayerIndex) {
      return 10;
    }
    return 9;
  };
  
  let cardIndex = 0;
  for (let i = 0; i < numPlayers; i++) {
    const hand: Card[] = [];
    const cardCount = getCardCount(i);
    for (let j = 0; j < cardCount; j++) {
      hand.push(shuffled[cardIndex++]);
    }
    hands.push(hand);
  }
  
  return {
    hands,
    remainingDeck: shuffled.slice(cardIndex),
  };
}

// Get numeric value for a rank (for scoring)
export function getRankValue(rank: Rank | 'WILD'): number {
  if (rank === 'WILD') return 0;
  const values: Record<Rank, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 10, 'Q': 10, 'K': 10, 'A': 1,
  };
  return values[rank];
}

// Get comparison rank value (for tiebreakers - Ace high)
export function getComparisonRankValue(rank: Rank | 'WILD'): number {
  if (rank === 'WILD') return 0;
  const values: Record<Rank, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  };
  return values[rank];
}

// Check if cards are all face cards (J, Q, K)
function isFaceCard(rank: Rank | 'WILD'): boolean {
  return rank === 'J' || rank === 'Q' || rank === 'K';
}

// Check if three cards form J-Q-K straight (any order)
function isJQKStraight(cards: Card[]): boolean {
  const nonWildCards = cards.filter(c => !c.isWild);
  const wildCount = cards.filter(c => c.isWild).length;
  
  const ranks = nonWildCards.map(c => c.rank);
  const needed = ['J', 'Q', 'K'].filter(r => !ranks.includes(r as Rank));
  
  return needed.length <= wildCount && 
         nonWildCards.every(c => isFaceCard(c.rank));
}

// Check if three cards form J-Q-K straight flush
function isJQKStraightFlush(cards: Card[]): boolean {
  if (!isJQKStraight(cards)) return false;
  
  const nonWildCards = cards.filter(c => !c.isWild);
  if (nonWildCards.length === 0) return true;
  
  const suit = nonWildCards[0].suit;
  return nonWildCards.every(c => c.suit === suit);
}

// Check if all three cards are face cards
function isThreeFaceCards(cards: Card[]): boolean {
  return cards.every(c => c.isWild || isFaceCard(c.rank));
}

// Check if all non-wild cards are the same suit
function isSameSuit(cards: Card[]): boolean {
  const nonWildCards = cards.filter(c => !c.isWild);
  if (nonWildCards.length <= 1) return true;
  const suit = nonWildCards[0].suit;
  return nonWildCards.every(c => c.suit === suit);
}

// Check if three of a kind (with or without wildcards)
function isThreeOfKind(cards: Card[]): { isThreeOfKind: boolean; hasWild: boolean; rankValue: number } {
  const nonWildCards = cards.filter(c => !c.isWild);
  const wildCount = cards.filter(c => c.isWild).length;
  
  if (wildCount === 3) {
    return { isThreeOfKind: true, hasWild: true, rankValue: 0 };
  }
  
  if (wildCount === 2) {
    return { 
      isThreeOfKind: true, 
      hasWild: true, 
      rankValue: getComparisonRankValue(nonWildCards[0].rank) 
    };
  }
  
  if (wildCount === 1) {
    if (nonWildCards[0].rank === nonWildCards[1].rank) {
      return { 
        isThreeOfKind: true, 
        hasWild: true, 
        rankValue: getComparisonRankValue(nonWildCards[0].rank) 
      };
    }
    return { isThreeOfKind: false, hasWild: false, rankValue: 0 };
  }
  
  // No wildcards
  if (nonWildCards[0].rank === nonWildCards[1].rank && 
      nonWildCards[1].rank === nonWildCards[2].rank) {
    return { 
      isThreeOfKind: true, 
      hasWild: false, 
      rankValue: getComparisonRankValue(nonWildCards[0].rank) 
    };
  }
  
  return { isThreeOfKind: false, hasWild: false, rankValue: 0 };
}

// Calculate sum modulo 10
function getSumModulo(cards: Card[]): number {
  const sum = cards.reduce((acc, card) => {
    if (card.isWild) return acc; // Wildcards count as 0 in sum
    return acc + getRankValue(card.rank);
  }, 0);
  return sum % 10;
}

// Evaluate a 3-card hand
export function evaluateHand(cards: Card[]): HandEvaluation {
  if (cards.length !== 3 || cards.some(c => c === null)) {
    return { type: HandType.SUM_MODULO, value: 0, description: 'Invalid hand' };
  }
  
  const threeOfKind = isThreeOfKind(cards);
  
  // Check for pure three of a kind (no wildcards)
  if (threeOfKind.isThreeOfKind && !threeOfKind.hasWild) {
    return {
      type: HandType.THREE_OF_KIND_PURE,
      value: threeOfKind.rankValue,
      description: `Three of a kind: ${cards[0].rank}s`,
    };
  }
  
  // Check for J-Q-K straight flush
  if (isJQKStraightFlush(cards)) {
    return {
      type: HandType.STRAIGHT_FLUSH_JQK,
      value: 100, // Fixed value, ties are allowed
      description: 'Straight Flush J-Q-K',
    };
  }
  
  // Check for J-Q-K straight
  if (isJQKStraight(cards)) {
    return {
      type: HandType.STRAIGHT_JQK,
      value: 100,
      description: 'Straight J-Q-K',
    };
  }
  
  // Check for three of a kind with wildcards
  if (threeOfKind.isThreeOfKind && threeOfKind.hasWild) {
    return {
      type: HandType.THREE_OF_KIND_WILD,
      value: threeOfKind.rankValue,
      description: `Three of a kind (with wild): ${threeOfKind.rankValue}`,
    };
  }
  
  // Check for three face cards
  if (isThreeFaceCards(cards)) {
    return {
      type: HandType.THREE_FACE_CARDS,
      value: cards.reduce((sum, c) => sum + getComparisonRankValue(c.rank), 0),
      description: 'Three face cards',
    };
  }
  
  // Default to sum modulo 10 (0-9, where 9 is best, 0 is worst)
  // Rule: If wildcards are present, minimum sum value becomes 9 (wildcard can represent any card)
  const hasWildcard = cards.some(c => c.isWild);
  const sameSuit = isSameSuit(cards);
  
  if (hasWildcard) {
    return {
      type: HandType.SUM_MODULO,
      value: 9, // Wildcard guarantees minimum of 9 (best sum)
      description: sameSuit ? 'Sum: 9 (wild, same suit)' : 'Sum: 9 (wild)',
      isSameSuit: sameSuit,
    };
  }
  
  const sumMod = getSumModulo(cards);
  return {
    type: HandType.SUM_MODULO,
    value: sumMod, // 0-9, with 9 being best and 0 being worst
    description: sameSuit ? `Sum: ${sumMod} (same suit)` : `Sum: ${sumMod}`,
    isSameSuit: sameSuit,
  };
}

// Get points awarded for winning with a specific hand type
// Per spec Section 6:
// - Three of a kind (pure or wild): 5 points
// - Straight Flush JQK: 3 points
// - Straight JQK: 3 points
// - Three face cards: 3 points
// - Sum modulo: 1 point (or 3 if same suit)
export function getHandPoints(hand: HandEvaluation): number {
  switch (hand.type) {
    case HandType.THREE_OF_KIND_PURE:
    case HandType.THREE_OF_KIND_WILD:
      return 5;
    case HandType.STRAIGHT_FLUSH_JQK:
    case HandType.STRAIGHT_JQK:
    case HandType.THREE_FACE_CARDS:
      return 3;
    case HandType.SUM_MODULO:
      // isSameSuit info is stored in the hand evaluation
      return hand.isSameSuit ? 3 : 1;
    default:
      return 1;
  }
}

// Compare two hand evaluations, returns 1 if hand1 wins, -1 if hand2 wins, 0 for tie
export function compareHands(hand1: HandEvaluation, hand2: HandEvaluation): number {
  // Lower hand type number = better hand
  if (hand1.type !== hand2.type) {
    return hand1.type < hand2.type ? 1 : -1;
  }
  
  // Same hand type - compare values
  // For straight flush and straight J-Q-K, ties are allowed
  if (hand1.type === HandType.STRAIGHT_FLUSH_JQK || hand1.type === HandType.STRAIGHT_JQK) {
    return 0; // Tie
  }
  
  // For three of a kind, higher rank wins
  if (hand1.type === HandType.THREE_OF_KIND_PURE || 
      hand1.type === HandType.THREE_OF_KIND_WILD ||
      hand1.type === HandType.THREE_FACE_CARDS) {
    if (hand1.value > hand2.value) return 1;
    if (hand1.value < hand2.value) return -1;
    return 0;
  }
  
  // For sum modulo, higher value wins (9 > 8 > 7 > ... > 1 > 0)
  if (hand1.value > hand2.value) return 1;
  if (hand1.value < hand2.value) return -1;
  return 0;
}

// Validate that layers are in correct order (top <= middle <= bottom)
export function validateArrangement(arrangement: PlayerArrangement): boolean {
  const topCards = arrangement.top.cards.filter(c => c !== null) as Card[];
  const middleCards = arrangement.middle.cards.filter(c => c !== null) as Card[];
  const bottomCards = arrangement.bottom.cards.filter(c => c !== null) as Card[];
  
  if (topCards.length !== 3 || middleCards.length !== 3 || bottomCards.length !== 3) {
    return false;
  }
  
  const topEval = evaluateHand(topCards);
  const middleEval = evaluateHand(middleCards);
  const bottomEval = evaluateHand(bottomCards);
  
  // Top cannot be better than middle
  if (compareHands(topEval, middleEval) > 0) return false;
  
  // Middle cannot be better than bottom
  if (compareHands(middleEval, bottomEval) > 0) return false;
  
  return true;
}

// Compare two players' arrangements
export function compareArrangements(
  player1: Player,
  player2: Player
): MatchupResult {
  const result: MatchupResult = {
    player1Id: player1.id,
    player2Id: player2.id,
    layerComparisons: [],
    player1TotalPoints: 0,
    player2TotalPoints: 0,
    player1Foul: false,
    player2Foul: false,
  };
  
  // Check for fouls (invalid arrangements)
  if (player1.arrangement) {
    result.player1Foul = !validateArrangement(player1.arrangement);
  } else {
    result.player1Foul = true;
  }
  
  if (player2.arrangement) {
    result.player2Foul = !validateArrangement(player2.arrangement);
  } else {
    result.player2Foul = true;
  }
  
  // Check for special hands (4 of a kind OR all nines without wildcards)
  const p1SpecialHand = !result.player1Foul && hasSpecialHand(player1);
  const p2SpecialHand = !result.player2Foul && hasSpecialHand(player2);
  
  // If both have special hands, it's a draw (per spec: "If 2 players have special hands, they are considered a draw")
  if (p1SpecialHand && p2SpecialHand) {
    return result;
  }
  
  // Special hand scores 10 points against opponent who doesn't have special hand
  if (p1SpecialHand) {
    result.player1TotalPoints = 10;
    return result;
  }
  if (p2SpecialHand) {
    result.player2TotalPoints = 10;
    return result;
  }
  
  // If both foul, it's a draw
  if (result.player1Foul && result.player2Foul) {
    return result;
  }
  
  // If one player fouls, the other gets 10 points
  if (result.player1Foul) {
    result.player2TotalPoints = 10;
    return result;
  }
  if (result.player2Foul) {
    result.player1TotalPoints = 10;
    return result;
  }
  
  // Compare each layer
  const layers: Array<'top' | 'middle' | 'bottom'> = ['top', 'middle', 'bottom'];
  
  for (const layer of layers) {
    const p1Cards = player1.arrangement![layer].cards.filter(c => c !== null) as Card[];
    const p2Cards = player2.arrangement![layer].cards.filter(c => c !== null) as Card[];
    
    const p1Eval = evaluateHand(p1Cards);
    const p2Eval = evaluateHand(p2Cards);
    
    const comparison = compareHands(p1Eval, p2Eval);
    
    // Determine points based on winning hand type per spec Section 6:
    // - Three of a kind (pure/wild): 5 points
    // - Straight Flush/Straight JQK/Three Face Cards: 3 points
    // - Sum modulo: 1 point (or 3 if same suit)
    const winningEval = comparison > 0 ? p1Eval : comparison < 0 ? p2Eval : null;
    const pointsAwarded = winningEval ? getHandPoints(winningEval) : 0;
    
    const layerResult: LayerComparison = {
      layer,
      player1Score: p1Eval.value,
      player2Score: p2Eval.value,
      winner: comparison > 0 ? player1.id : comparison < 0 ? player2.id : null,
    };
    
    result.layerComparisons.push(layerResult);
    
    if (comparison > 0) {
      result.player1TotalPoints += pointsAwarded;
    } else if (comparison < 0) {
      result.player2TotalPoints += pointsAwarded;
    }
  }
  
  return result;
}

// Calculate all matchup results for a round
export function calculateRoundScores(players: Player[]): RoundScore[] {
  const activePlayers = players.filter(p => !p.isBankrupt);
  const scores: RoundScore[] = activePlayers.map(p => ({
    playerId: p.id,
    playerName: p.name,
    pointsAgainst: {},
    totalPoints: 0,
    cashChange: 0,
  }));
  
  // Compare each pair of players
  for (let i = 0; i < activePlayers.length; i++) {
    for (let j = i + 1; j < activePlayers.length; j++) {
      const result = compareArrangements(activePlayers[i], activePlayers[j]);
      
      const p1Score = scores.find(s => s.playerId === result.player1Id)!;
      const p2Score = scores.find(s => s.playerId === result.player2Id)!;
      
      // Net points between these two players
      const p1Net = result.player1TotalPoints - result.player2TotalPoints;
      
      p1Score.pointsAgainst[result.player2Id] = p1Net;
      p2Score.pointsAgainst[result.player1Id] = -p1Net;
      
      p1Score.totalPoints += p1Net;
      p2Score.totalPoints -= p1Net;
    }
  }
  
  // Convert points to cash ($1 per point)
  for (const score of scores) {
    score.cashChange = score.totalPoints;
  }
  
  return scores;
}

// Apply round scores to players
export function applyRoundScores(players: Player[], scores: RoundScore[]): Player[] {
  return players.map(player => {
    const score = scores.find(s => s.playerId === player.id);
    if (!score) return player;
    
    const newCash = player.cash + score.cashChange;
    return {
      ...player,
      cash: newCash,
      isBankrupt: newCash <= 0,
    };
  });
}

// Create empty player arrangement
export function createEmptyArrangement(): PlayerArrangement {
  return {
    top: { cards: [null, null, null] },
    middle: { cards: [null, null, null] },
    bottom: { cards: [null, null, null] },
  };
}

// Check if arrangement is complete (all 9 cards placed)
export function isArrangementComplete(arrangement: PlayerArrangement): boolean {
  const allCards = [
    ...arrangement.top.cards,
    ...arrangement.middle.cards,
    ...arrangement.bottom.cards,
  ];
  return allCards.every(c => c !== null);
}

// Get all cards from arrangement
export function getCardsFromArrangement(arrangement: PlayerArrangement): Card[] {
  const allCards = [
    ...arrangement.top.cards,
    ...arrangement.middle.cards,
    ...arrangement.bottom.cards,
  ];
  return allCards.filter(c => c !== null) as Card[];
}

// Check for all nines: all 3 layers have sum = 9 without wildcards
export function checkAllNines(player: Player): boolean {
  if (!player.arrangement) return false;
  
  const layers = [player.arrangement.top, player.arrangement.middle, player.arrangement.bottom];
  
  for (const layer of layers) {
    const cards = layer.cards.filter(c => c !== null) as Card[];
    if (cards.length !== 3) return false;
    
    // Must not have any wildcards
    if (cards.some(c => c.isWild)) return false;
    
    const eval_ = evaluateHand(cards);
    
    // Must be sum modulo type with value of exactly 9
    if (eval_.type !== HandType.SUM_MODULO || eval_.value < 9) {
      return false;
    }
  }
  
  return true;
}

// Check for 4 of a kind across all 9 cards
export function checkFourOfAKind(player: Player): boolean {
  if (!player.arrangement) return false;
  
  const allCards = getCardsFromArrangement(player.arrangement);
  
  const rankCounts: Record<string, number> = {};
  for (const card of allCards) {
    if (!card.isWild) {
      rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
    }
  }
  
  return Object.values(rankCounts).some(count => count >= 4);
}

// Check if player has ANY special hand (4 of a kind OR all nines without wildcards)
// Special hands score 10 points per opponent who doesn't have a special hand
// If both players have special hands, it's a draw
export function hasSpecialHand(player: Player): boolean {
  return checkAllNines(player) || checkFourOfAKind(player);
}

// Legacy alias for backward compatibility
export function checkAutoWin(player: Player): boolean {
  return hasSpecialHand(player);
}

// Check for special bonuses and return details
export function checkBonuses(player: Player): { hasBonus: boolean; bonusType: string | null; isSpecialHand: boolean } {
  if (!player.arrangement) return { hasBonus: false, bonusType: null, isSpecialHand: false };
  
  // Check for all nines (all layers = 9 without wildcards)
  if (checkAllNines(player)) {
    return { hasBonus: true, bonusType: 'All Nines - Special Hand!', isSpecialHand: true };
  }
  
  // Check for 4 of a kind across all cards
  if (checkFourOfAKind(player)) {
    return { hasBonus: true, bonusType: 'Four of a Kind - Special Hand!', isSpecialHand: true };
  }
  
  return { hasBonus: false, bonusType: null, isSpecialHand: false };
}

// Find winner (richest player)
export function findWinner(players: Player[]): Player | null {
  const activePlayers = players.filter(p => !p.isBankrupt);
  if (activePlayers.length === 0) return null;
  
  return activePlayers.reduce((richest, player) => 
    player.cash > richest.cash ? player : richest
  );
}

// Check if game should end (any player bankrupt)
export function shouldGameEnd(players: Player[]): boolean {
  return players.some(p => p.isBankrupt);
}

// Generate all combinations of choosing k elements from an array
function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  
  const result: T[][] = [];
  const [first, ...rest] = arr;
  
  // Combinations that include the first element
  for (const combo of combinations(rest, k - 1)) {
    result.push([first, ...combo]);
  }
  
  // Combinations that exclude the first element
  for (const combo of combinations(rest, k)) {
    result.push(combo);
  }
  
  return result;
}

// Score an arrangement for optimization (higher is better)
function scoreArrangement(arrangement: PlayerArrangement): number {
  const topCards = arrangement.top.cards.filter(c => c !== null) as Card[];
  const middleCards = arrangement.middle.cards.filter(c => c !== null) as Card[];
  const bottomCards = arrangement.bottom.cards.filter(c => c !== null) as Card[];
  
  const topEval = evaluateHand(topCards);
  const middleEval = evaluateHand(middleCards);
  const bottomEval = evaluateHand(bottomCards);
  
  // Convert hand type to score (lower type = higher score since HandType enum has better hands with lower values)
  const typeScore = (type: HandType): number => {
    return (7 - type) * 100; // HandType ranges from 1-6, so this gives 600-100
  };
  
  // Combined score: prioritize overall hand strength
  // Weight layers equally but use value for tiebreakers within same type
  const topScore = typeScore(topEval.type) + topEval.value;
  const middleScore = typeScore(middleEval.type) + middleEval.value;
  const bottomScore = typeScore(bottomEval.type) + bottomEval.value;
  
  return topScore + middleScore + bottomScore;
}

// Find the optimal arrangement for a hand of 9 cards
export function findBestArrangement(hand: Card[]): PlayerArrangement | null {
  if (hand.length !== 9) return null;
  
  let bestArrangement: PlayerArrangement | null = null;
  let bestScore = -Infinity;
  
  // Get all ways to choose 3 cards for the first group
  const firstGroupCombos = combinations(hand, 3);
  
  for (const group1 of firstGroupCombos) {
    // Remaining cards after choosing first group
    const remaining1 = hand.filter(c => !group1.includes(c));
    
    // Get all ways to choose 3 cards for the second group
    const secondGroupCombos = combinations(remaining1, 3);
    
    for (const group2 of secondGroupCombos) {
      // Third group is the remaining cards
      const group3 = remaining1.filter(c => !group2.includes(c));
      
      // Try all 6 permutations of assigning groups to layers
      const groups = [group1, group2, group3];
      const permutations = [
        [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]
      ];
      
      for (const perm of permutations) {
        const arrangement: PlayerArrangement = {
          top: { cards: [...groups[perm[0]]] },
          middle: { cards: [...groups[perm[1]]] },
          bottom: { cards: [...groups[perm[2]]] },
        };
        
        // Check if this arrangement is valid
        if (validateArrangement(arrangement)) {
          const score = scoreArrangement(arrangement);
          
          if (score > bestScore) {
            bestScore = score;
            bestArrangement = arrangement;
          }
        }
      }
    }
  }
  
  return bestArrangement;
}
