// Web Worker for AI calculations - runs off main thread to keep UI responsive

import { Card, PlayerArrangement, AIDifficulty } from './types';
import {
  findBestArrangementByDifficulty,
  chooseCardToDiscardByDifficulty,
  AIContext,
} from './ai';

// Message types for worker communication
export interface AIWorkerRequest {
  type: 'arrangement' | 'discard';
  id: string; // For correlating responses
  cards: Card[];
  context: AIContext;
}

export interface AIWorkerResponse {
  type: 'arrangement' | 'discard';
  id: string;
  result: PlayerArrangement | Card | null;
  error?: string;
}

// Handle incoming messages
self.onmessage = (event: MessageEvent<AIWorkerRequest>) => {
  const { type, id, cards, context } = event.data;

  try {
    let result: PlayerArrangement | Card | null = null;

    if (type === 'arrangement') {
      result = findBestArrangementByDifficulty(cards, context);
    } else if (type === 'discard') {
      result = chooseCardToDiscardByDifficulty(cards, context);
    }

    const response: AIWorkerResponse = { type, id, result };
    self.postMessage(response);
  } catch (error) {
    const response: AIWorkerResponse = {
      type,
      id,
      result: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    self.postMessage(response);
  }
};
