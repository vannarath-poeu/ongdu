'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Card, PlayerArrangement } from './types';
import { AIContext } from './ai';
import type { AIWorkerRequest, AIWorkerResponse } from './ai.worker';

// Promise resolvers for pending requests
type PendingRequest = {
  resolve: (result: PlayerArrangement | Card | null) => void;
  reject: (error: Error) => void;
};

let requestIdCounter = 0;

export function useAIWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRequests = useRef<Map<string, PendingRequest>>(new Map());

  // Initialize worker
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('./ai.worker.ts', import.meta.url)
    );

    workerRef.current.onmessage = (event: MessageEvent<AIWorkerResponse>) => {
      const { id, result, error } = event.data;
      const pending = pendingRequests.current.get(id);

      if (pending) {
        pendingRequests.current.delete(id);
        if (error) {
          pending.reject(new Error(error));
        } else {
          pending.resolve(result);
        }
      }
    };

    workerRef.current.onerror = (error) => {
      console.error('AI Worker error:', error);
      // Reject all pending requests
      for (const [id, pending] of pendingRequests.current) {
        pending.reject(new Error('Worker error'));
        pendingRequests.current.delete(id);
      }
    };

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  // Request arrangement from worker
  const getArrangement = useCallback(
    (cards: Card[], context: AIContext): Promise<PlayerArrangement> => {
      return new Promise((resolve, reject) => {
        if (!workerRef.current) {
          reject(new Error('Worker not initialized'));
          return;
        }

        const id = `arr-${++requestIdCounter}`;
        pendingRequests.current.set(id, {
          resolve: resolve as (result: PlayerArrangement | Card | null) => void,
          reject,
        });

        const request: AIWorkerRequest = {
          type: 'arrangement',
          id,
          cards,
          context,
        };

        workerRef.current.postMessage(request);
      });
    },
    []
  );

  // Request discard from worker
  const getDiscard = useCallback(
    (cards: Card[], context: AIContext): Promise<Card> => {
      return new Promise((resolve, reject) => {
        if (!workerRef.current) {
          reject(new Error('Worker not initialized'));
          return;
        }

        const id = `disc-${++requestIdCounter}`;
        pendingRequests.current.set(id, {
          resolve: resolve as (result: PlayerArrangement | Card | null) => void,
          reject,
        });

        const request: AIWorkerRequest = {
          type: 'discard',
          id,
          cards,
          context,
        };

        workerRef.current.postMessage(request);
      });
    },
    []
  );

  return { getArrangement, getDiscard };
}
