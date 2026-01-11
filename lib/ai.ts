// AI Logic for computer opponents in Ongdu

import {
  Card,
  PlayerArrangement,
  HandType,
  HandEvaluation,
} from './types';
import {
  evaluateHand,
  createEmptyArrangement,
  validateArrangement,
} from './game-logic';

// Generate all permutations of array
function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const current = arr[i];
    const remaining = [...arr.slice(0, i), ...arr.slice(i + 1)];
    const perms = permutations(remaining);
    for (const perm of perms) {
      result.push([current, ...perm]);
    }
  }
  return result;
}

// Check if arrangement qualifies for all nines (all layers = 9, no wildcards)
function isAllNinesArrangement(arrangement: PlayerArrangement): boolean {
  const layers = [arrangement.top, arrangement.middle, arrangement.bottom];
  
  for (const layer of layers) {
    const cards = layer.cards.filter(c => c !== null) as Card[];
    if (cards.length !== 3) return false;
    if (cards.some(c => c.isWild)) return false;
    
    const eval_ = evaluateHand(cards);
    // Must be sum modulo type with value of exactly 9
    if (eval_.type !== HandType.SUM_MODULO || eval_.value < 9) {
      return false;
    }
  }
  
  return true;
}

// Check if arrangement has 4 of a kind across all 9 cards
function hasFourOfAKindArrangement(arrangement: PlayerArrangement): boolean {
  const allCards = [
    ...arrangement.top.cards,
    ...arrangement.middle.cards,
    ...arrangement.bottom.cards,
  ].filter(c => c !== null) as Card[];
  
  const rankCounts: Record<string, number> = {};
  for (const card of allCards) {
    if (!card.isWild) {
      rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
    }
  }
  
  return Object.values(rankCounts).some(count => count >= 4);
}

// Check if arrangement has ANY special hand (all nines OR 4 of a kind)
function hasSpecialHandArrangement(arrangement: PlayerArrangement): boolean {
  return isAllNinesArrangement(arrangement) || hasFourOfAKindArrangement(arrangement);
}

// Calculate arrangement score (higher is better)
function scoreArrangement(arrangement: PlayerArrangement): number {
  const topCards = arrangement.top.cards.filter(c => c !== null) as Card[];
  const middleCards = arrangement.middle.cards.filter(c => c !== null) as Card[];
  const bottomCards = arrangement.bottom.cards.filter(c => c !== null) as Card[];
  
  if (topCards.length !== 3 || middleCards.length !== 3 || bottomCards.length !== 3) {
    return -Infinity;
  }
  
  // Validate layer ordering
  if (!validateArrangement(arrangement)) {
    return -Infinity;
  }
  
  // Check for special hand (all nines OR 4 of a kind) - massive bonus!
  if (hasSpecialHandArrangement(arrangement)) {
    return 10000; // Special hand is the best possible outcome
  }
  
  const topEval = evaluateHand(topCards);
  const middleEval = evaluateHand(middleCards);
  const bottomEval = evaluateHand(bottomCards);
  
  // Score based on hand strength (inverted hand type + value bonus)
  const handScore = (eval_: HandEvaluation): number => {
    const typeScore = (7 - eval_.type) * 100; // Higher type enum = worse, so invert
    return typeScore + eval_.value;
  };
  
  return handScore(topEval) + handScore(middleEval) + handScore(bottomEval);
}

// Find best arrangement for given 9 cards using brute force
// With 9 cards arranged into 3 groups of 3, there are C(9,3) * C(6,3) * C(3,3) = 1680 combinations
export function findBestArrangement(cards: Card[]): PlayerArrangement {
  if (cards.length !== 9) {
    console.error('AI requires exactly 9 cards');
    return createEmptyArrangement();
  }
  
  let bestArrangement: PlayerArrangement | null = null;
  let bestScore = -Infinity;
  
  // Generate all ways to split 9 cards into 3 groups of 3
  const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  
  // Choose 3 for bottom (should be strongest)
  for (let b1 = 0; b1 < 7; b1++) {
    for (let b2 = b1 + 1; b2 < 8; b2++) {
      for (let b3 = b2 + 1; b3 < 9; b3++) {
        const bottomIndices = [b1, b2, b3];
        const remaining1 = indices.filter(i => !bottomIndices.includes(i));
        
        // Choose 3 for middle from remaining 6
        for (let m1 = 0; m1 < 4; m1++) {
          for (let m2 = m1 + 1; m2 < 5; m2++) {
            for (let m3 = m2 + 1; m3 < 6; m3++) {
              const middleIndices = [remaining1[m1], remaining1[m2], remaining1[m3]];
              const topIndices = remaining1.filter(i => !middleIndices.includes(i));
              
              const arrangement: PlayerArrangement = {
                top: { cards: topIndices.map(i => cards[i]) },
                middle: { cards: middleIndices.map(i => cards[i]) },
                bottom: { cards: bottomIndices.map(i => cards[i]) },
              };
              
              const score = scoreArrangement(arrangement);
              
              if (score > bestScore) {
                bestScore = score;
                bestArrangement = arrangement;
              }
            }
          }
        }
      }
    }
  }
  
  // If no valid arrangement found (shouldn't happen normally), try simple approach
  if (!bestArrangement || bestScore === -Infinity) {
    bestArrangement = createSimpleArrangement(cards);
  }
  
  return bestArrangement;
}

// Create a simple arrangement by sorting cards and distributing
function createSimpleArrangement(cards: Card[]): PlayerArrangement {
  // Sort cards by value (for sum modulo hands)
  const sorted = [...cards].sort((a, b) => {
    if (a.isWild && !b.isWild) return 1;
    if (!a.isWild && b.isWild) return -1;
    if (a.isWild && b.isWild) return 0;
    
    const aVal = getCardSortValue(a);
    const bVal = getCardSortValue(b);
    return bVal - aVal; // Descending
  });
  
  // Try to create valid arrangement with best cards at bottom
  const arrangement: PlayerArrangement = {
    bottom: { cards: [sorted[0], sorted[1], sorted[2]] },
    middle: { cards: [sorted[3], sorted[4], sorted[5]] },
    top: { cards: [sorted[6], sorted[7], sorted[8]] },
  };
  
  // If valid, return it; otherwise try swapping
  if (validateArrangement(arrangement)) {
    return arrangement;
  }
  
  // Try reverse order
  const reversed: PlayerArrangement = {
    top: { cards: [sorted[0], sorted[1], sorted[2]] },
    middle: { cards: [sorted[3], sorted[4], sorted[5]] },
    bottom: { cards: [sorted[6], sorted[7], sorted[8]] },
  };
  
  if (validateArrangement(reversed)) {
    return reversed;
  }
  
  // Fallback - just use original order
  return {
    top: { cards: [cards[0], cards[1], cards[2]] },
    middle: { cards: [cards[3], cards[4], cards[5]] },
    bottom: { cards: [cards[6], cards[7], cards[8]] },
  };
}

function getCardSortValue(card: Card): number {
  if (card.isWild) return 15; // High value for wildcards
  
  const rankValues: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
    '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  };
  
  return rankValues[card.rank] || 0;
}

// AI chooses which card to discard in 6-player game
export function chooseCardToDiscard(cards: Card[]): Card {
  if (cards.length !== 10) {
    return cards[0]; // Fallback
  }
  
  // Try removing each card and see which gives best arrangement
  let bestCardToRemove = cards[0];
  let bestScore = -Infinity;
  
  for (let i = 0; i < cards.length; i++) {
    const remaining = [...cards.slice(0, i), ...cards.slice(i + 1)];
    const arrangement = findBestArrangement(remaining);
    const score = scoreArrangement(arrangement);
    
    if (score > bestScore) {
      bestScore = score;
      bestCardToRemove = cards[i];
    }
  }
  
  return bestCardToRemove;
}

// Get AI difficulty description based on player name
export function getAIStrategy(playerName: string): 'optimal' | 'random' | 'simple' {
  // For now, all AI players use optimal strategy
  return 'optimal';
}

// Delay for AI actions to make game feel more natural
export function getAIDelay(): number {
  // Random delay between 500ms and 1500ms
  return Math.floor(Math.random() * 1000) + 500;
}

