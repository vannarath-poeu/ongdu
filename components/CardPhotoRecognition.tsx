'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Card as CardType, Rank, Suit } from '@/lib/types';
import Card from '@/components/Card';
import { detectedCardsToHand, recognizeCardPhoto, SCAN_RANKS, validateDetectedCards, type DetectedCard } from '@/lib/card-recognition';

interface Props {
  source: string;
  onUseCards: (cards: CardType[]) => void;
  onImageError: () => void;
  onManualEntry?: () => void;
  children?: ReactNode;
}

export default function CardPhotoRecognition({ source, onUseCards, onImageError, onManualEntry, children }: Props) {
  const controllerRef = useRef<AbortController | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [cards, setCards] = useState<DetectedCard[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [progress, setProgress] = useState('Getting your photo ready…');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  const scan = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true); setError(null); setCards(null); setEditing(null);
    setProgress('Getting your photo ready…');
    const timeout = setTimeout(() => {
      controller.abort(); setBusy(false);
      setError('This is taking longer than expected. Check your connection and try again.');
    }, 120_000);
    const clearScanTimeout = () => clearTimeout(timeout);
    controller.signal.addEventListener('abort', clearScanTimeout, { once: true });
    try {
      const results = await recognizeCardPhoto(source, controller.signal, message => {
        if (controller.signal.aborted) return;
        setProgress(message.startsWith('Loading') ? 'Getting ready to read your cards…' : message.startsWith('Reading') ? 'Reading your cards…' : 'Finding your cards…');
      });
      if (!controller.signal.aborted) setCards(results);
    } catch {
      if (!controller.signal.aborted) setError('We couldn’t read this photo. Try a closer, sharper shot with every rank and suit visible.');
    } finally {
      clearTimeout(timeout);
      controller.signal.removeEventListener('abort', clearScanTimeout);
      if (!controller.signal.aborted) setBusy(false);
    }
  }, [source]);

  useEffect(() => {
    const start = setTimeout(() => { void scan(); }, 0);
    return () => { clearTimeout(start); controllerRef.current?.abort(); };
  }, [scan]);

  useEffect(() => {
    if (editing === null) return;
    const frame = requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      editorRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  const updateCard = (index: number, change: Partial<DetectedCard>) => {
    setCards(current => current?.map((card, i) => i === index ? {
      ...card, ...change,
      uncertain: change.rank !== undefined || change.suit !== undefined
        ? !((change.rank ?? card.rank) === 'WILD' || ((change.rank ?? card.rank) && (change.suit ?? card.suit)))
        : card.uncertain,
    } : card) ?? null);
  };
  const selectedCards = cards?.filter(card => card.included !== false) ?? [];
  const validation = cards ? validateDetectedCards(selectedCards) : null;
  const uncertainCount = selectedCards.filter(card => card.uncertain).length;
  const editedCard = editing !== null ? cards?.[editing] : null;

  return (
    <div className="space-y-5">
      {busy && (
        <div className="rounded-2xl border border-indigo-400/20 bg-slate-900 p-8 text-center space-y-4" role="status" aria-live="polite">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={source} alt="Your hand" onError={onImageError} className="mx-auto h-36 w-44 rounded-xl object-cover opacity-70" />
          <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-indigo-300 border-t-transparent" />
          <h2 className="text-xl font-semibold text-white">{progress}</h2>
          <p className="text-sm text-slate-400">The first photo can take a little longer. Your photo stays on this device.</p>
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5 space-y-4" role="alert">
          <h2 className="text-lg font-semibold text-white">Let’s try another look</h2>
          <p className="text-sm text-slate-300">{error}</p>
          <button type="button" onClick={scan} className="rounded-xl bg-indigo-500 px-5 py-3 font-medium text-white">Try again</button>
          {onManualEntry && <button type="button" onClick={onManualEntry} className="ml-4 text-sm text-slate-300 underline underline-offset-4">Enter cards instead</button>}
        </div>
      )}
      {cards && (
        <>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-indigo-300">Your hand</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{cards.length > 10 ? 'Choose the cards you’re playing' : 'Do these cards look right?'}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{cards.length > 10 ? `We found ${cards.length} cards. Select 9, or 10 if you need a discard.` : 'Tap a card to correct it, or add one we missed.'}</p>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className={selectedCards.length === 9 || selectedCards.length === 10 ? 'text-emerald-300' : 'text-slate-300'}>{selectedCards.length} selected</span>
            {uncertainCount > 0 && <span className="text-amber-300">{uncertainCount} to double-check</span>}
          </div>
          <div className="grid grid-cols-4 min-[400px]:grid-cols-5 gap-x-2 gap-y-4">
            {cards.map((card, index) => {
              const complete = card.rank && (card.rank === 'WILD' || card.suit);
              const display: CardType | null = complete ? { id: `review-${index}`, rank: card.rank as Rank | 'WILD', suit: card.rank === 'WILD' ? 'wild' : card.suit as Suit, isWild: card.rank === 'WILD' } : null;
              return (
                <div key={index} className={`flex flex-col items-center gap-2 ${card.included === false ? 'opacity-45' : ''}`}>
                  <button type="button" onClick={() => setEditing(editing === index ? null : index)} aria-label={`Edit card ${index + 1}${display ? `: ${display.rank} ${display.suit}` : ''}`} aria-expanded={editing === index}
                    className={`relative rounded-xl p-1 transition-colors ${editing === index ? 'bg-indigo-400/30 ring-2 ring-indigo-300' : card.uncertain ? 'bg-amber-400/10 ring-1 ring-amber-400/50' : 'hover:bg-slate-800'}`}>
                    <Card card={display} size="sm" />
                    {card.uncertain && <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-amber-300 px-1.5 text-[9px] font-semibold text-slate-950">Check</span>}
                  </button>
                  <label className="flex min-h-6 cursor-pointer items-center gap-1.5 text-[11px] text-slate-300">
                    <input type="checkbox" checked={card.included !== false} onChange={event => updateCard(index, { included: event.target.checked })} aria-label={`Use card ${index + 1}`} className="accent-indigo-400" />
                    Use
                  </label>
                </div>
              );
            })}
          </div>
          {editedCard && editing !== null && (
            <div ref={editorRef} tabIndex={-1} role="group" aria-labelledby="photo-card-editor-title" className="rounded-xl border border-indigo-400/30 bg-slate-800/60 p-4 space-y-3 focus:outline-none focus:ring-2 focus:ring-indigo-300">
              <div className="flex items-center justify-between"><h3 id="photo-card-editor-title" className="text-sm font-medium text-white">Edit card {editing + 1}</h3><button type="button" onClick={() => setEditing(null)} className="px-2 py-1 text-sm text-indigo-300">Done</button></div>
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {editedCard.preview && <img src={editedCard.preview} alt={`Photo detail for card ${editing + 1}`} className="h-20 w-16 rounded object-contain bg-black" />}
                <div className="grid flex-1 gap-2">
                  <select aria-label={`Rank for card ${editing + 1}`} value={editedCard.rank} onChange={event => updateCard(editing, { rank: event.target.value as Rank | 'WILD' | '' })} className="w-full rounded-lg bg-slate-900 p-2.5 text-sm text-white">
                    <option value="">Choose rank</option>{SCAN_RANKS.map(rank => <option key={rank} value={rank}>{rank}</option>)}<option value="WILD">Wildcard</option>
                  </select>
                  <select aria-label={`Suit for card ${editing + 1}`} disabled={editedCard.rank === 'WILD'} value={editedCard.rank === 'WILD' ? '' : editedCard.suit} onChange={event => updateCard(editing, { suit: event.target.value as Suit | '' })} className="w-full rounded-lg bg-slate-900 p-2.5 text-sm text-white disabled:opacity-40">
                    <option value="">{editedCard.rank === 'WILD' ? 'No suit needed' : 'Choose suit'}</option><option value="hearts">♥ Hearts</option><option value="diamonds">♦ Diamonds</option><option value="clubs">♣ Clubs</option><option value="spades">♠ Spades</option>
                  </select>
                </div>
              </div>
              <button type="button" onClick={() => { setCards(cards.filter((_, i) => i !== editing)); setEditing(null); }} className="text-xs text-rose-300">Remove this card</button>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            {cards.length < 55 && <button type="button" onClick={() => { setEditing(cards.length); setCards([...cards, { rank: '', suit: '', preview: '', uncertain: true }]); }} className="min-h-10 text-sm text-indigo-300">+ Add a missing card</button>}
            <button type="button" onClick={scan} className="min-h-10 text-xs text-slate-400 underline underline-offset-4">Read photo again</button>
          </div>
          <details className="group rounded-xl border border-slate-700/60">
            <summary className="cursor-pointer px-4 py-3 text-sm text-slate-400">Compare with your photo</summary>
            <div className="p-3 pt-0"><div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={source} alt="Your photo with numbered card regions" onError={onImageError} className="h-auto w-full rounded-lg" />
              {cards.map((card, index) => card.region && <button key={index} type="button" aria-label={`Edit detected card ${index + 1}`} onClick={() => setEditing(index)} className={`absolute rounded border-2 ${card.included === false ? 'border-slate-400' : card.uncertain ? 'border-amber-400' : 'border-emerald-400'}`} style={{ left: `${card.region.x * 100}%`, top: `${card.region.y * 100}%`, width: `${card.region.width * 100}%`, height: `${card.region.height * 100}%` }}><span className="absolute -top-4 left-0 rounded bg-slate-950 px-1 text-[10px] text-white">{index + 1}</span></button>)}
            </div></div>
          </details>
          {validation && <p className="text-sm text-amber-300" role="status">{selectedCards.length < 9 ? `Select ${9 - selectedCards.length} more card${selectedCards.length === 8 ? '' : 's'} to continue.` : selectedCards.length > 10 ? 'Keep 9 or 10 cards selected to continue.' : validation}</p>}
          <button type="button" disabled={!!validation} onClick={() => onUseCards(detectedCardsToHand(selectedCards))} className="w-full rounded-xl bg-amber-400 py-4 font-semibold text-slate-950 transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500">Find my best arrangement <span aria-hidden="true">→</span></button>
          {selectedCards.length === 10 && <p className="text-center text-xs text-slate-400">We’ll also find the best card to discard.</p>}
        </>
      )}
      <div className="border-t border-slate-800 pt-3">{children}</div>
    </div>
  );
}
