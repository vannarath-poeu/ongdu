'use client';

import { useCallback, useEffect, useRef } from 'react';
import { UIError } from './i18n/errors';
import type { Card } from './types';
import type { EVRankedArrangement } from './expected-value';
import type { HelperAnalysisRequest, HelperAnalysisResponse } from './helper-analysis.worker';

export function useHelperAnalysis() {
  const active = useRef<{ worker: Worker; reject: (error: Error) => void } | null>(null);
  const requestId = useRef(0);
  const cancel = useCallback(() => {
    requestId.current++;
    active.current?.worker.terminate();
    active.current?.reject(new DOMException('Analysis cancelled', 'AbortError'));
    active.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);

  const analyze = useCallback((cards: Card[], opponents: number): Promise<EVRankedArrangement[]> => {
    cancel();
    return new Promise((resolve, reject) => {
      const id = ++requestId.current;
      const worker = new Worker(new URL('./helper-analysis.worker.ts', import.meta.url));
      active.current = { worker, reject };
      const finish = () => { worker.terminate(); if (active.current?.worker === worker) active.current = null; };
      worker.onmessage = ({ data }: MessageEvent<HelperAnalysisResponse>) => {
        if (data.id !== id || id !== requestId.current) return;
        finish();
        if (data.errorCode || data.error) reject(new UIError(data.errorCode ?? 'ANALYSIS_FAILED', { cause: data.error })); else resolve(data.results ?? []);
      };
      worker.onerror = () => { finish(); reject(new UIError('ANALYSIS_FAILED')); };
      worker.onmessageerror = () => { finish(); reject(new UIError('ANALYSIS_FAILED')); };
      try { worker.postMessage({ id, cards, opponents } satisfies HelperAnalysisRequest); }
      catch (error) { finish(); reject(error instanceof Error ? error : new Error('Could not start analysis.')); }
    });
  }, [cancel]);
  return { analyze, cancel };
}
