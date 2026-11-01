'use client';

import { useState } from 'react';
import Card from '@/components/Card';
import type { EVRankedArrangement } from '@/lib/expected-value';
import type { Suit } from '@/lib/types';

const symbols: Record<Suit, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };

export default function HelperArrangementResults({ results, opponents, onEdit, onNewHand }: {
  results: EVRankedArrangement[]; opponents: number; onEdit: () => void; onNewHand: () => void;
}) {
  const [choice, setChoice] = useState(0);
  const result = results[choice];
  if (!result) return (
    <div className="rounded-2xl border border-amber-400/30 bg-slate-900 p-6 text-center space-y-4">
      <h2 className="text-xl font-semibold text-white">Let’s check that hand</h2>
      <p className="text-sm text-slate-400">We couldn’t find a valid arrangement. Check that the cards match your hand, then try again.</p>
      <button type="button" onClick={onEdit} className="rounded-xl bg-amber-400 px-5 py-3 font-semibold text-slate-950">Review my cards</button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-3xl border border-emerald-400/25 bg-slate-900/90">
        <div className="border-b border-slate-700/50 bg-emerald-400/5 px-5 py-5">
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">{choice === 0 ? 'Recommended for your hand' : `Alternative ${choice}`}</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Arrange your cards like this</h2>
          <p className="mt-1 text-sm text-slate-400">Top to bottom, from weakest to strongest.</p>
        </div>
        <div className="divide-y divide-slate-800 px-5">
          {(['top', 'middle', 'bottom'] as const).map((layer, index) => (
            <div key={layer} className="py-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium capitalize text-slate-200"><span className="mr-2 text-xs text-slate-500">0{index + 1}</span>{layer}</h3>
                <span className="text-xs text-emerald-300">{result.evaluations[layer].description}</span>
              </div>
              <div className="flex justify-center gap-3">{result.arrangement[layer].cards.map((card, i) => <Card key={card?.id ?? i} card={card} size="md" />)}</div>
            </div>
          ))}
        </div>
        {result.discardedCard && (
          <div className="mx-5 mb-5 flex items-center gap-4 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4">
            <Card card={result.discardedCard} size="sm" />
            <div><p className="font-medium text-rose-200">Leave this card out</p><p className="mt-1 text-sm text-slate-400">{result.discardedCard.isWild ? 'Wildcard' : `${result.discardedCard.rank}${symbols[result.discardedCard.suit as Suit]}`} is the recommended discard.</p></div>
          </div>
        )}
      </div>
      {results.length > 1 && (
        <details className="rounded-xl border border-slate-700/60 bg-slate-900/50">
          <summary className="cursor-pointer px-4 py-4 text-sm text-slate-300">Explore other arrangements</summary>
          <div className="px-4 pb-4 flex flex-wrap gap-2">
            {results.map((item, index) => <button type="button" key={index} onClick={() => setChoice(index)} aria-pressed={choice === index} className={`rounded-lg px-3 py-2 text-sm ${choice === index ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300'}`}>{index === 0 ? 'Recommended' : `Option ${index + 1}`}<span className="ml-2 text-xs opacity-70">{item.ev.totalEV.toFixed(1)} pts</span></button>)}
          </div>
        </details>
      )}
      <details className="rounded-xl border border-slate-700/60 bg-slate-900/50">
        <summary className="cursor-pointer px-4 py-4 text-sm text-slate-400">Why this arrangement?</summary>
        <div className="space-y-3 px-4 pb-4 text-sm text-slate-400">
          <p>We compare possible arrangements against sampled opponent hands. This suggestion has an estimated value of <span className="text-emerald-300">{result.ev.totalEV.toFixed(2)} points</span> against {opponents} opponent{opponents === 1 ? '' : 's'}.</p>
          <p className="text-xs">These are estimates, not guaranteed outcomes. Suggestions may vary between analyses.</p>
          {(['top', 'middle', 'bottom'] as const).map(layer => <div key={layer} className="flex justify-between gap-3 border-t border-slate-800 pt-2"><span className="capitalize">{layer}</span><span>{Math.round(result.ev.winRates[layer] * 100)}% estimated win rate</span></div>)}
        </div>
      </details>
      <button type="button" onClick={onNewHand} className="w-full rounded-xl bg-amber-400 py-4 font-semibold text-slate-950 hover:bg-amber-300">Try another hand</button>
      <button type="button" onClick={onEdit} className="w-full py-2 text-sm text-slate-400 hover:text-white">Edit these cards</button>
    </div>
  );
}
