import { HandType, type Card, type HandEvaluation, type Player } from '../types';
import { translate, type Locale } from './message';
export { msg, translate, formatMessage } from './message';
export type { Locale, Message, TranslationArgs, Params } from './message';

export function formatCard(locale: Locale, card: Card): string {
  if (card.isWild) return translate(locale, 'Wildcard');
  const suit = card.suit === 'wild' ? translate(locale, 'Wildcard') : translate(locale, `suit.${card.suit}`);
  return translate(locale, 'cardName', { rank: card.rank, suit });
}

export function formatHand(locale: Locale, evaluation: HandEvaluation, cards: readonly (Card | null)[]): string {
  const hand = cards.filter((card): card is Card => card !== null);
  if (hand.length !== 3) return translate(locale, 'hand.invalid');
  switch (evaluation.type) {
    case HandType.THREE_OF_KIND_PURE: return translate(locale, 'hand.triple', { rank: hand[0].rank });
    case HandType.THREE_OF_KIND_WILD: return translate(locale, 'hand.wildTriple', { rank: evaluation.value });
    case HandType.STRAIGHT_FLUSH_JQK: return translate(locale, 'hand.straightFlush');
    case HandType.STRAIGHT_JQK: return translate(locale, 'hand.straight');
    case HandType.THREE_FACE_CARDS: return translate(locale, 'hand.faces');
    default: {
      const details = [hand.some(card => card.isWild) ? translate(locale, 'hand.wild') : '', evaluation.isSameSuit ? translate(locale, 'hand.sameSuit') : ''].filter(Boolean);
      return translate(locale, 'hand.sum', { value: evaluation.value }) + (details.length ? ` (${details.join(', ')})` : '');
    }
  }
}

const playerNames = ['Dragon', 'Phoenix', 'Tiger', 'Turtle', 'Serpent'] as const;
export function formatPlayer(locale: Locale, player: Pick<Player, 'id' | 'name' | 'isHuman'>): string {
  if (player.id === 'human') return translate(locale, 'You');
  const match = /^ai-([0-4])$/.exec(player.id);
  return match ? translate(locale, playerNames[Number(match[1])]) : player.name;
}

export function formatNumber(locale: Locale, value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(locale === 'km' ? 'km-KH' : 'en-US', { numberingSystem: 'latn', maximumFractionDigits }).format(value);
}

export const layerLabels = { top: 'Top', middle: 'Middle', bottom: 'Bottom' } as const;
export const phaseLabels = { lobby: 'Players', dealing: 'Deal Cards', discard: 'Discard Phase', arrangement: 'Arrange', reveal: 'Your Arrangement', scoring: 'Results from this round', gameOver: 'Game Over!' } as const;
export function difficultyLabel(value: string): 'Easy' | 'Medium' | 'Hard' {
  return value === 'hard' ? 'Hard' : value === 'medium' ? 'Medium' : 'Easy';
}
