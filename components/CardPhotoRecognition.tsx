'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Card, Rank, Suit } from '@/lib/types';
import { detectedCardsToHand, recognizeCardPhoto, SCAN_RANKS, validateDetectedCards, type DetectedCard } from '@/lib/card-recognition';

export default function CardPhotoRecognition({ source, onUseCards, onImageError, children }: { source: string; onUseCards: (cards: Card[]) => void; onImageError: () => void; children?: ReactNode }) {
  const controllerRef = useRef<AbortController | null>(null);
  const [cards, setCards] = useState<DetectedCard[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const scan = async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true); setError(null); setCards(null); setApplied(false);
    setProgress('Preparing photo…');
    const timeout = setTimeout(() => {
      controller.abort();
      setBusy(false);
      setError('Scanning took too long. Check your connection for the OCR download, then retry with a clearer photo.');
    }, 120_000);
    const clearScanTimeout = () => clearTimeout(timeout);
    controller.signal.addEventListener('abort', clearScanTimeout, { once: true });
    try {
      const results = await recognizeCardPhoto(source, controller.signal, message => {
        if (!controller.signal.aborted) setProgress(message);
      });
      if (!controller.signal.aborted) setCards(results);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Scanning failed. Please try another photo.');
    } finally {
      clearTimeout(timeout);
      controller.signal.removeEventListener('abort', clearScanTimeout);
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const updateCard = (index: number, change: Partial<DetectedCard>) => {
    setCards(current => current?.map((card, i) => i === index ? { ...card, ...change, uncertain: change.rank !== undefined || change.suit !== undefined ? false : card.uncertain } : card) ?? null);
    setApplied(false);
  };
  const selectedCards = cards?.filter(card => card.included !== false) ?? [];
  const validation = cards ? validateDetectedCards(selectedCards) : null;

  return (
    <div className="space-y-3">
      <div className="relative overflow-visible rounded-lg bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={source} alt="Card photo with detected regions for review" onError={onImageError} className="w-full h-auto rounded-lg" />
        {cards?.map((card, index) => card.region && (
          <button key={index} type="button" aria-label={`${card.included === false ? 'Include' : 'Exclude'} detected card ${index + 1}`} aria-pressed={card.included !== false}
            onClick={() => updateCard(index, { included: card.included === false })}
            className={`absolute border-2 rounded focus-visible:outline-2 focus-visible:outline-white ${card.included === false ? 'border-slate-400 bg-slate-800/40' : card.uncertain ? 'border-amber-400 bg-amber-400/10' : 'border-emerald-400 bg-emerald-400/10'}`}
            style={{ left: `${card.region.x * 100}%`, top: `${card.region.y * 100}%`, width: `${card.region.width * 100}%`, height: `${card.region.height * 100}%` }}>
            <span className="absolute -top-4 left-0 rounded bg-slate-950/90 px-1 text-[10px] leading-4 text-white">{index + 1}</span>
          </button>
        ))}
      </div>
      {cards && <p className="text-xs text-slate-400">Tap a detected region or use the checkboxes below to include or exclude a card.</p>}
      {children}
      <p className="text-xs text-slate-400">
        Keep each card’s rank and suit visible. The experimental local scanner also tries exposed corners in overlapping hands. Clear, close photos work best. Review every result and mark wildcards manually.
      </p>
      <p className="text-xs text-slate-500">Photos stay on your device. Free OCR files download on first use; an internet connection is needed for that download.</p>
      {busy ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-indigo-300" role="status">{progress}</p>
          <button type="button" className="text-sm text-slate-300 underline" onClick={() => { controllerRef.current?.abort(); setBusy(false); }}>Cancel Scan</button>
        </div>
      ) : (
        <button type="button" onClick={scan} className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium">
          {cards ? 'Scan Again' : 'Detect Cards in Photo'}
        </button>
      )}
      {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}
      {cards && (
        <div className="space-y-3">
          <p className="text-sm text-slate-300">{cards.length} detected · {selectedCards.length} selected. Choose 9 or 10 cards to use. Correct ranks and suits, remove extra detections, or add missed cards.</p>
          <div className="grid grid-cols-2 gap-3">
            {cards.map((card, index) => (
              <div key={index} className={`rounded-lg border p-2 space-y-2 ${card.included === false ? 'border-slate-700 opacity-50' : card.uncertain ? 'border-amber-500/60' : 'border-slate-600'}`}>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input type="checkbox" checked={card.included !== false} onChange={event => updateCard(index, { included: event.target.checked })} aria-label={`Use card ${index + 1}`} />
                    Card {index + 1}
                  </label>
                  <button type="button" aria-label={`Remove card ${index + 1}`} className="text-xs text-rose-300" onClick={() => { setCards(cards.filter((_, i) => i !== index)); setApplied(false); }}>Remove</button>
                </div>
                {card.preview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.preview} alt={`Detected card ${index + 1}`} className="h-28 w-full object-contain rounded bg-black" />
                )}
                {card.uncertain && <p className="text-xs text-amber-300">Check detection</p>}
                <select aria-label={`Rank for card ${index + 1}`} value={card.rank} onChange={event => updateCard(index, { rank: event.target.value as Rank | 'WILD' | '' })} className="w-full rounded bg-slate-800 p-2 text-sm text-white">
                  <option value="">Choose rank</option>
                  {SCAN_RANKS.map(rank => <option key={rank} value={rank}>{rank}</option>)}
                  <option value="WILD">Wildcard</option>
                </select>
                <select aria-label={`Suit for card ${index + 1}`} disabled={card.rank === 'WILD'} value={card.rank === 'WILD' ? '' : card.suit} onChange={event => updateCard(index, { suit: event.target.value as Suit | '' })} className="w-full rounded bg-slate-800 p-2 text-sm text-white disabled:opacity-40">
                  <option value="">{card.rank === 'WILD' ? 'Wildcard — no suit' : 'Choose suit'}</option>
                  <option value="hearts">♥ Hearts</option><option value="diamonds">♦ Diamonds</option>
                  <option value="clubs">♣ Clubs</option><option value="spades">♠ Spades</option>
                </select>
              </div>
            ))}
          </div>
          {cards.length < 55 && <button type="button" className="text-sm text-indigo-300 underline" onClick={() => { setCards([...cards, { rank: '', suit: '', preview: '', uncertain: true }]); setApplied(false); }}>Add Missed Card</button>}
          {validation && <p className="text-sm text-amber-300" role="status">{validation}</p>}
          <p className="text-xs text-slate-400">Confirming replaces the helper’s current card selection.</p>
          <button type="button" disabled={!!validation || applied} onClick={() => { onUseCards(detectedCardsToHand(selectedCards)); setApplied(true); }} className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 py-3 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed">
            {applied ? 'Cards Added to Helper' : 'Confirm and Use These Cards'}
          </button>
        </div>
      )}
    </div>
  );
}
