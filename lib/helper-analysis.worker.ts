import type { UIErrorCode } from './i18n/errors';
import type { Card } from './types';
import { findBestArrangementsByEV, findBestArrangementsByEVFor10, type EVRankedArrangement } from './expected-value';

export interface HelperAnalysisRequest { id: number; cards: Card[]; opponents: number }
export interface HelperAnalysisResponse { id: number; results?: EVRankedArrangement[]; error?: string; errorCode?: UIErrorCode }

self.onmessage = ({ data }: MessageEvent<HelperAnalysisRequest>) => {
  const { id, cards, opponents } = data;
  try {
    if (cards.length !== 9 && cards.length !== 10) {
      self.postMessage({ id, errorCode: 'HAND_SIZE', error: 'Choose 9 or 10 cards to arrange.' } satisfies HelperAnalysisResponse);
      return;
    }
    const results = cards.length === 10
      ? findBestArrangementsByEVFor10(cards, opponents, 4, 800)
      : findBestArrangementsByEV(cards, opponents, 4, 800);
    self.postMessage({ id, results } satisfies HelperAnalysisResponse);
  } catch (error) {
    self.postMessage({ id, errorCode: 'ANALYSIS_FAILED', error: error instanceof Error ? error.message : 'Could not arrange this hand.' } satisfies HelperAnalysisResponse);
  }
};
