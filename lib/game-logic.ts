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
export function dealCards(deck: Card[], numPlayers: number): { hands: Card[][]; remainingDeck: Card[] } {
  const shuffled = shuffleDeck(deck);
  const hands: Card[][] = [];
  const cardsPerPlayer = numPlayers === 6 ? [10, 9, 9, 9, 9, 9] : Array(numPlayers).fill(9);
  
  let cardIndex = 0;
  for (let i = 0; i < numPlayers; i++) {
    const hand: Card[] = [];
    for (let j = 0; j < cardsPerPlayer[i]; j++) {
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
  const sumMod = getSumModulo(cards);
  return {
    type: HandType.SUM_MODULO,
    value: sumMod, // 0-9, with 9 being best and 0 being worst
    description: `Sum: ${sumMod}`,
  };
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
  
  // Check for automatic wins (all layers = 9 without wildcards)
  const p1AutoWin = !result.player1Foul && checkAutoWin(player1);
  const p2AutoWin = !result.player2Foul && checkAutoWin(player2);
  
  // If both have automatic win, it's a draw
  if (p1AutoWin && p2AutoWin) {
    return result;
  }
  
  // Automatic win beats everything (including opponent's foul - you still get 10 points)
  if (p1AutoWin) {
    result.player1TotalPoints = 10;
    return result;
  }
  if (p2AutoWin) {
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
    
    const layerResult: LayerComparison = {
      layer,
      player1Score: p1Eval.value,
      player2Score: p2Eval.value,
      winner: comparison > 0 ? player1.id : comparison < 0 ? player2.id : null,
    };
    
    result.layerComparisons.push(layerResult);
    
    if (comparison > 0) {
      result.player1TotalPoints += 1;
    } else if (comparison < 0) {
      result.player2TotalPoints += 1;
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

// Check for automatic win: all 3 layers have sum = 9 without wildcards
export function checkAutoWin(player: Player): boolean {
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

// Check for special bonuses (4 of a kind in hand)
export function checkBonuses(player: Player): { hasBonus: boolean; bonusType: string | null; isAutoWin: boolean } {
  if (!player.arrangement) return { hasBonus: false, bonusType: null, isAutoWin: false };
  
  // Check for automatic win (all layers = 9 without wildcards)
  if (checkAutoWin(player)) {
    return { hasBonus: true, bonusType: 'All Nines - Automatic Win!', isAutoWin: true };
  }
  
  const allCards = getCardsFromArrangement(player.arrangement);
  
  // Check for 4 of a kind across all cards
  const rankCounts: Record<string, number> = {};
  for (const card of allCards) {
    if (!card.isWild) {
      rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
    }
  }
  if (Object.values(rankCounts).some(count => count >= 4)) {
    return { hasBonus: true, bonusType: 'Four of a Kind', isAutoWin: false };
  }
  
  return { hasBonus: false, bonusType: null, isAutoWin: false };
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

