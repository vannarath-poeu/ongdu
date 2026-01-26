// Expected Value calculation for card arrangement optimization

import {
  Card,
  PlayerArrangement,
  HandEvaluation,
} from './types';
import {
  createDeck,
  shuffleDeck,
  evaluateHand,
  compareHands,
  getHandPoints,
  validateArrangement,
} from './game-logic';

// Expected value result for an arrangement
export interface ExpectedValueResult {
  topEV: number;
  middleEV: number;
  bottomEV: number;
  totalEV: number;
  winRates: {
    top: number;
    middle: number;
    bottom: number;
  };
}

// Arrangement ranked by EV
export interface EVRankedArrangement {
  arrangement: PlayerArrangement;
  evaluations: {
    top: HandEvaluation;
    middle: HandEvaluation;
    bottom: HandEvaluation;
  };
  ev: ExpectedValueResult;
  discardedCard?: Card;
}

// Get remaining deck after removing player's cards
export function getRemainingDeck(playerCards: Card[]): Card[] {
  const fullDeck = createDeck();
  const playerCardIds = new Set(playerCards.map(c => {
    // Normalize card IDs for comparison
    if (c.isWild) {
      return `wild-${c.id.split('-')[1] || '1'}`;
    }
    return `${c.rank}-${c.suit}`;
  }));

  return fullDeck.filter(card => {
    const cardKey = card.isWild
      ? `wild-${card.id.split('-')[1]}`
      : `${card.rank}-${card.suit}`;
    return !playerCardIds.has(cardKey);
  });
}

// Sample random opponent hands from remaining deck
export function sampleOpponentHands(
  remainingDeck: Card[],
  numSamples: number
): Card[][] {
  const samples: Card[][] = [];

  for (let i = 0; i < numSamples; i++) {
    const shuffled = shuffleDeck([...remainingDeck]);
    // Take 9 cards for one opponent hand
    samples.push(shuffled.slice(0, 9));
  }

  return samples;
}

// Generate all combinations of k elements from array
function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];

  const result: T[][] = [];
  const [first, ...rest] = arr;

  for (const combo of combinations(rest, k - 1)) {
    result.push([first, ...combo]);
  }
  for (const combo of combinations(rest, k)) {
    result.push(combo);
  }

  return result;
}

// Fast card value for sorting (used in greedy arrangement)
function getCardValue(card: Card): number {
  if (card.isWild) return 15; // Wildcards are valuable
  const values: Record<string, number> = {
    'A': 14, 'K': 13, 'Q': 12, 'J': 11,
    '10': 10, '9': 9, '8': 8, '7': 7,
    '6': 6, '5': 5, '4': 4, '3': 3, '2': 2,
  };
  return values[card.rank] || 0;
}

// Fast greedy arrangement for opponent simulation
// Instead of checking all 1680 combinations, use a heuristic O(n log n) approach
function findBestArrangementFast(hand: Card[]): PlayerArrangement | null {
  if (hand.length !== 9) return null;

  // Sort cards by value (descending)
  const sorted = [...hand].sort((a, b) => getCardValue(b) - getCardValue(a));

  // Greedy assignment: best 3 to bottom, next 3 to middle, rest to top
  const arrangement: PlayerArrangement = {
    bottom: { cards: [sorted[0], sorted[1], sorted[2]] },
    middle: { cards: [sorted[3], sorted[4], sorted[5]] },
    top: { cards: [sorted[6], sorted[7], sorted[8]] },
  };

  // Check if valid, if not try swapping layers
  if (validateArrangement(arrangement)) {
    return arrangement;
  }

  // Try middle-bottom swap
  const swap1: PlayerArrangement = {
    bottom: { cards: [sorted[3], sorted[4], sorted[5]] },
    middle: { cards: [sorted[0], sorted[1], sorted[2]] },
    top: { cards: [sorted[6], sorted[7], sorted[8]] },
  };
  if (validateArrangement(swap1)) {
    return swap1;
  }

  // Try top-middle swap
  const swap2: PlayerArrangement = {
    bottom: { cards: [sorted[0], sorted[1], sorted[2]] },
    middle: { cards: [sorted[6], sorted[7], sorted[8]] },
    top: { cards: [sorted[3], sorted[4], sorted[5]] },
  };
  if (validateArrangement(swap2)) {
    return swap2;
  }

  // Fallback: reverse order
  const reversed: PlayerArrangement = {
    bottom: { cards: [sorted[6], sorted[7], sorted[8]] },
    middle: { cards: [sorted[3], sorted[4], sorted[5]] },
    top: { cards: [sorted[0], sorted[1], sorted[2]] },
  };
  if (validateArrangement(reversed)) {
    return reversed;
  }

  // Last resort: just return something valid by trying a few more permutations
  const groups = [
    [sorted[0], sorted[1], sorted[2]],
    [sorted[3], sorted[4], sorted[5]],
    [sorted[6], sorted[7], sorted[8]],
  ];

  for (const [t, m, b] of [[0,1,2], [0,2,1], [1,0,2], [1,2,0], [2,0,1], [2,1,0]]) {
    const arr: PlayerArrangement = {
      top: { cards: groups[t] },
      middle: { cards: groups[m] },
      bottom: { cards: groups[b] },
    };
    if (validateArrangement(arr)) {
      return arr;
    }
  }

  return null;
}

// Find the best arrangement for a hand (used for opponent simulation)
// Uses fast heuristic by default, with optional full search for accuracy
function findBestArrangementForHand(hand: Card[], useFastMode: boolean = true): PlayerArrangement | null {
  if (useFastMode) {
    return findBestArrangementFast(hand);
  }

  // Full brute-force search (slow but accurate)
  if (hand.length !== 9) return null;

  let bestArrangement: PlayerArrangement | null = null;
  let bestScore = -Infinity;

  const firstGroupCombos = combinations(hand, 3);

  for (const group1 of firstGroupCombos) {
    const remaining1 = hand.filter(c => !group1.includes(c));
    const secondGroupCombos = combinations(remaining1, 3);

    for (const group2 of secondGroupCombos) {
      const group3 = remaining1.filter(c => !group2.includes(c));

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

        if (validateArrangement(arrangement)) {
          const score = scoreArrangementSimple(arrangement);
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

// Simple scoring for arrangement comparison (used in opponent simulation)
function scoreArrangementSimple(arrangement: PlayerArrangement): number {
  const topCards = arrangement.top.cards.filter(c => c !== null) as Card[];
  const middleCards = arrangement.middle.cards.filter(c => c !== null) as Card[];
  const bottomCards = arrangement.bottom.cards.filter(c => c !== null) as Card[];

  const topEval = evaluateHand(topCards);
  const middleEval = evaluateHand(middleCards);
  const bottomEval = evaluateHand(bottomCards);

  // Use point-weighted scoring: points × strength factor
  const getLayerScore = (eval_: HandEvaluation): number => {
    const points = getHandPoints(eval_);
    // Normalize value to 0-1 range based on hand type
    let strengthFactor = 0.5;
    if (eval_.type <= 4) {
      // For ranked hands, use the rank value (2-14 for cards)
      strengthFactor = eval_.value / 15;
    } else {
      // For sum modulo, value is 0-9
      strengthFactor = eval_.value / 10;
    }
    return points * (1 + strengthFactor);
  };

  return getLayerScore(topEval) + getLayerScore(middleEval) + getLayerScore(bottomEval);
}

// Calculate win rate for a single layer against opponent samples
export function calculateLayerWinRate(
  myLayerCards: Card[],
  opponentArrangements: PlayerArrangement[],
  layer: 'top' | 'middle' | 'bottom'
): number {
  if (opponentArrangements.length === 0) return 0.5;

  const myEval = evaluateHand(myLayerCards);
  let wins = 0;
  let ties = 0;

  for (const oppArrangement of opponentArrangements) {
    const oppCards = oppArrangement[layer].cards.filter(c => c !== null) as Card[];
    const oppEval = evaluateHand(oppCards);

    const result = compareHands(myEval, oppEval);
    if (result > 0) wins++;
    else if (result === 0) ties++;
  }

  // Ties count as 0.5 wins
  return (wins + ties * 0.5) / opponentArrangements.length;
}

// Calculate expected value for an arrangement against simulated opponents
export function calculateExpectedValue(
  arrangement: PlayerArrangement,
  playerCards: Card[],
  numOpponents: number = 1,
  sampleSize: number = 150
): ExpectedValueResult {
  // Get remaining deck
  const remainingDeck = getRemainingDeck(playerCards);

  // Sample opponent hands
  const opponentHands = sampleOpponentHands(remainingDeck, sampleSize);

  // Find best arrangement for each opponent sample
  const opponentArrangements: PlayerArrangement[] = [];
  for (const hand of opponentHands) {
    const bestArrangement = findBestArrangementForHand(hand);
    if (bestArrangement) {
      opponentArrangements.push(bestArrangement);
    }
  }

  if (opponentArrangements.length === 0) {
    return {
      topEV: 0,
      middleEV: 0,
      bottomEV: 0,
      totalEV: 0,
      winRates: { top: 0.5, middle: 0.5, bottom: 0.5 },
    };
  }

  // Get my layer cards and evaluations
  const topCards = arrangement.top.cards.filter(c => c !== null) as Card[];
  const middleCards = arrangement.middle.cards.filter(c => c !== null) as Card[];
  const bottomCards = arrangement.bottom.cards.filter(c => c !== null) as Card[];

  const topEval = evaluateHand(topCards);
  const middleEval = evaluateHand(middleCards);
  const bottomEval = evaluateHand(bottomCards);

  // Calculate win rates for each layer
  const topWinRate = calculateLayerWinRate(topCards, opponentArrangements, 'top');
  const middleWinRate = calculateLayerWinRate(middleCards, opponentArrangements, 'middle');
  const bottomWinRate = calculateLayerWinRate(bottomCards, opponentArrangements, 'bottom');

  // Get point values for winning hands
  const topPoints = getHandPoints(topEval);
  const middlePoints = getHandPoints(middleEval);
  const bottomPoints = getHandPoints(bottomEval);

  // Calculate EV for each layer
  // EV = Points × WinRate × NumOpponents
  // (assuming each opponent matchup is independent)
  const topEV = topPoints * topWinRate * numOpponents;
  const middleEV = middlePoints * middleWinRate * numOpponents;
  const bottomEV = bottomPoints * bottomWinRate * numOpponents;

  return {
    topEV,
    middleEV,
    bottomEV,
    totalEV: topEV + middleEV + bottomEV,
    winRates: {
      top: topWinRate,
      middle: middleWinRate,
      bottom: bottomWinRate,
    },
  };
}

// Find top N arrangements ranked by expected value
export function findBestArrangementsByEV(
  cards: Card[],
  numOpponents: number = 1,
  topN: number = 4,
  sampleSize: number = 50 // Reduced for performance with multiple arrangements
): EVRankedArrangement[] {
  if (cards.length !== 9) return [];

  // First, find all valid arrangements
  const validArrangements: {
    arrangement: PlayerArrangement;
    evaluations: {
      top: HandEvaluation;
      middle: HandEvaluation;
      bottom: HandEvaluation;
    };
  }[] = [];

  const firstGroupCombos = combinations(cards, 3);
  const seen = new Set<string>();

  for (const group1 of firstGroupCombos) {
    const remaining1 = cards.filter(c => !group1.includes(c));
    const secondGroupCombos = combinations(remaining1, 3);

    for (const group2 of secondGroupCombos) {
      const group3 = remaining1.filter(c => !group2.includes(c));

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

        // Deduplicate
        const key = [
          arrangement.top.cards.map(c => c?.id).sort().join(','),
          arrangement.middle.cards.map(c => c?.id).sort().join(','),
          arrangement.bottom.cards.map(c => c?.id).sort().join(','),
        ].join('|');

        if (seen.has(key)) continue;
        seen.add(key);

        if (validateArrangement(arrangement)) {
          const topCards = arrangement.top.cards as Card[];
          const middleCards = arrangement.middle.cards as Card[];
          const bottomCards = arrangement.bottom.cards as Card[];

          validArrangements.push({
            arrangement,
            evaluations: {
              top: evaluateHand(topCards),
              middle: evaluateHand(middleCards),
              bottom: evaluateHand(bottomCards),
            },
          });
        }
      }
    }
  }

  // Pre-compute opponent samples once for all arrangements
  const remainingDeck = getRemainingDeck(cards);
  const opponentHands = sampleOpponentHands(remainingDeck, sampleSize);

  // Find best arrangements for opponents
  const opponentArrangements: PlayerArrangement[] = [];
  for (const hand of opponentHands) {
    const bestArrangement = findBestArrangementForHand(hand);
    if (bestArrangement) {
      opponentArrangements.push(bestArrangement);
    }
  }

  // Calculate EV for each valid arrangement
  const rankedArrangements: EVRankedArrangement[] = [];

  for (const { arrangement, evaluations } of validArrangements) {
    const topCards = arrangement.top.cards as Card[];
    const middleCards = arrangement.middle.cards as Card[];
    const bottomCards = arrangement.bottom.cards as Card[];

    const topWinRate = calculateLayerWinRate(topCards, opponentArrangements, 'top');
    const middleWinRate = calculateLayerWinRate(middleCards, opponentArrangements, 'middle');
    const bottomWinRate = calculateLayerWinRate(bottomCards, opponentArrangements, 'bottom');

    const topPoints = getHandPoints(evaluations.top);
    const middlePoints = getHandPoints(evaluations.middle);
    const bottomPoints = getHandPoints(evaluations.bottom);

    const topEV = topPoints * topWinRate * numOpponents;
    const middleEV = middlePoints * middleWinRate * numOpponents;
    const bottomEV = bottomPoints * bottomWinRate * numOpponents;

    rankedArrangements.push({
      arrangement,
      evaluations,
      ev: {
        topEV,
        middleEV,
        bottomEV,
        totalEV: topEV + middleEV + bottomEV,
        winRates: {
          top: topWinRate,
          middle: middleWinRate,
          bottom: bottomWinRate,
        },
      },
    });
  }

  // Sort by total EV descending
  rankedArrangements.sort((a, b) => b.ev.totalEV - a.ev.totalEV);

  return rankedArrangements.slice(0, topN);
}

// Find best arrangements for 10 cards (try removing each card)
export function findBestArrangementsByEVFor10(
  cards: Card[],
  numOpponents: number = 1,
  topN: number = 4,
  sampleSize: number = 80 // Reduced further for 10-card case
): EVRankedArrangement[] {
  if (cards.length !== 10) return [];

  const allArrangements: EVRankedArrangement[] = [];

  for (let i = 0; i < 10; i++) {
    const cardsWithout = cards.filter((_, idx) => idx !== i);
    const discardedCard = cards[i];
    const arrangements = findBestArrangementsByEV(cardsWithout, numOpponents, 2, sampleSize);

    for (const arr of arrangements) {
      allArrangements.push({
        ...arr,
        discardedCard,
      });
    }
  }

  // Sort by EV and take top N
  allArrangements.sort((a, b) => b.ev.totalEV - a.ev.totalEV);
  return allArrangements.slice(0, topN);
}

// Extended result with variance for Hard mode
export interface EVWithVarianceResult extends ExpectedValueResult {
  variance: number;
  adjustedEV: number;
}

// Calculate variance of outcomes for an arrangement
// Variance = sum of (points × winRate × (1 - winRate)) for each layer
export function calculateVariance(ev: ExpectedValueResult): number {
  const topVariance = ev.topEV * ev.winRates.top * (1 - ev.winRates.top);
  const middleVariance = ev.middleEV * ev.winRates.middle * (1 - ev.winRates.middle);
  const bottomVariance = ev.bottomEV * ev.winRates.bottom * (1 - ev.winRates.bottom);
  return topVariance + middleVariance + bottomVariance;
}

// Calculate risk factor based on bankroll position
// riskFactor > 0.2: ahead, prefer conservative
// riskFactor -0.2 to 0.2: even, play standard
// riskFactor < -0.2: behind, accept higher variance
export function calculateRiskFactor(
  myCash: number,
  opponentCashes: number[],
  startingCash: number
): number {
  if (opponentCashes.length === 0) return 0;
  const avgOpponentCash = opponentCashes.reduce((a, b) => a + b, 0) / opponentCashes.length;
  return (myCash - avgOpponentCash) / startingCash;
}

// Get risk aversion multiplier based on risk factor
// Ahead: higher aversion (penalize variance more)
// Behind: lower aversion (accept variance for comeback)
function getRiskAversion(riskFactor: number): number {
  if (riskFactor > 0.2) {
    // Ahead - be conservative, penalize variance
    return 0.5 + riskFactor;
  } else if (riskFactor < -0.2) {
    // Behind - accept variance for comeback potential
    return Math.max(0, 0.3 + riskFactor);
  }
  // Even - moderate variance penalty
  return 0.3;
}

// Find best arrangement with risk adjustment for Hard mode
export function findBestArrangementWithRisk(
  cards: Card[],
  myCash: number,
  opponentCashes: number[],
  startingCash: number,
  numOpponents: number = 1,
  sampleSize: number = 200
): PlayerArrangement | null {
  if (cards.length !== 9) return null;

  const riskFactor = calculateRiskFactor(myCash, opponentCashes, startingCash);
  const riskAversion = getRiskAversion(riskFactor);

  // First, find all valid arrangements
  const validArrangements: {
    arrangement: PlayerArrangement;
    evaluations: {
      top: HandEvaluation;
      middle: HandEvaluation;
      bottom: HandEvaluation;
    };
  }[] = [];

  const firstGroupCombos = combinations(cards, 3);
  const seen = new Set<string>();

  for (const group1 of firstGroupCombos) {
    const remaining1 = cards.filter(c => !group1.includes(c));
    const secondGroupCombos = combinations(remaining1, 3);

    for (const group2 of secondGroupCombos) {
      const group3 = remaining1.filter(c => !group2.includes(c));

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

        // Deduplicate
        const key = [
          arrangement.top.cards.map(c => c?.id).sort().join(','),
          arrangement.middle.cards.map(c => c?.id).sort().join(','),
          arrangement.bottom.cards.map(c => c?.id).sort().join(','),
        ].join('|');

        if (seen.has(key)) continue;
        seen.add(key);

        if (validateArrangement(arrangement)) {
          const topCards = arrangement.top.cards as Card[];
          const middleCards = arrangement.middle.cards as Card[];
          const bottomCards = arrangement.bottom.cards as Card[];

          validArrangements.push({
            arrangement,
            evaluations: {
              top: evaluateHand(topCards),
              middle: evaluateHand(middleCards),
              bottom: evaluateHand(bottomCards),
            },
          });
        }
      }
    }
  }

  if (validArrangements.length === 0) return null;

  // Pre-compute opponent samples once for all arrangements
  const remainingDeck = getRemainingDeck(cards);
  const opponentHands = sampleOpponentHands(remainingDeck, sampleSize);

  // Find best arrangements for opponents
  const opponentArrangements: PlayerArrangement[] = [];
  for (const hand of opponentHands) {
    const bestArrangement = findBestArrangementForHand(hand);
    if (bestArrangement) {
      opponentArrangements.push(bestArrangement);
    }
  }

  // Calculate adjusted EV for each valid arrangement
  let bestArrangement: PlayerArrangement | null = null;
  let bestAdjustedEV = -Infinity;

  for (const { arrangement, evaluations } of validArrangements) {
    const topCards = arrangement.top.cards as Card[];
    const middleCards = arrangement.middle.cards as Card[];
    const bottomCards = arrangement.bottom.cards as Card[];

    const topWinRate = calculateLayerWinRate(topCards, opponentArrangements, 'top');
    const middleWinRate = calculateLayerWinRate(middleCards, opponentArrangements, 'middle');
    const bottomWinRate = calculateLayerWinRate(bottomCards, opponentArrangements, 'bottom');

    const topPoints = getHandPoints(evaluations.top);
    const middlePoints = getHandPoints(evaluations.middle);
    const bottomPoints = getHandPoints(evaluations.bottom);

    const topEV = topPoints * topWinRate * numOpponents;
    const middleEV = middlePoints * middleWinRate * numOpponents;
    const bottomEV = bottomPoints * bottomWinRate * numOpponents;
    const totalEV = topEV + middleEV + bottomEV;

    const ev: ExpectedValueResult = {
      topEV,
      middleEV,
      bottomEV,
      totalEV,
      winRates: { top: topWinRate, middle: middleWinRate, bottom: bottomWinRate },
    };

    const variance = calculateVariance(ev);
    const adjustedEV = totalEV - (variance * riskAversion);

    if (adjustedEV > bestAdjustedEV) {
      bestAdjustedEV = adjustedEV;
      bestArrangement = arrangement;
    }
  }

  return bestArrangement;
}

// Choose best discard with risk adjustment for Hard mode (6-player)
export function chooseDiscardWithRisk(
  cards: Card[],
  myCash: number,
  opponentCashes: number[],
  startingCash: number,
  numOpponents: number = 1,
  sampleSize: number = 100
): Card | null {
  if (cards.length !== 10) return null;

  const riskFactor = calculateRiskFactor(myCash, opponentCashes, startingCash);
  const riskAversion = getRiskAversion(riskFactor);

  let bestCardToDiscard: Card | null = null;
  let bestAdjustedEV = -Infinity;

  for (let i = 0; i < 10; i++) {
    const cardsWithout = cards.filter((_, idx) => idx !== i);
    const discardedCard = cards[i];

    // Get best arrangements for this discard option
    const arrangements = findBestArrangementsByEV(cardsWithout, numOpponents, 1, sampleSize);

    if (arrangements.length > 0) {
      const { ev } = arrangements[0];
      const variance = calculateVariance(ev);
      const adjustedEV = ev.totalEV - (variance * riskAversion);

      if (adjustedEV > bestAdjustedEV) {
        bestAdjustedEV = adjustedEV;
        bestCardToDiscard = discardedCard;
      }
    }
  }

  return bestCardToDiscard;
}
