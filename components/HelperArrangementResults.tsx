'use client';

import { layerLabels } from '@/lib/i18n/core';
import { useLocale } from '@/lib/i18n/context';

import { useState } from 'react';
import Card from '@/components/Card';
import type { EVRankedArrangement } from '@/lib/expected-value';


export default function HelperArrangementResults({ results, opponents, onEdit, onNewHand }: {
  results: EVRankedArrangement[]; opponents: number; onEdit: () => void; onNewHand: () => void;
}) {
  const { t, handLabel, cardLabel, number } = useLocale();
  const [choice, setChoice] = useState(0);
  const result = results[choice];
  if (!result) return (
    <div className="rounded-2xl border border-amber-400/30 bg-slate-900 p-6 text-center space-y-4">
      <h2 className="text-xl font-semibold text-white">{t("Let’s check that hand")}</h2>
      <p className="text-sm text-slate-400">{t("We couldn’t find a valid arrangement. Check that the cards match your hand, then try again.")}</p>
      <button type="button" onClick={onEdit} className="rounded-xl bg-amber-400 px-5 py-3 font-semibold text-slate-950">{t("Review my cards")}</button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-3xl border border-emerald-400/25 bg-slate-900/90">
        <div className="border-b border-slate-700/50 bg-emerald-400/5 px-5 py-5">
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">{choice === 0 ? t("Recommended for your hand") : t('alternative', { count: choice })}</p>
          <h2 className="mt-2 text-xl font-semibold text-white">{t("Arrange your cards like this")}</h2>
          <p className="mt-1 text-sm text-slate-400">{t("Top to bottom, from weakest to strongest.")}</p>
        </div>
        <div className="divide-y divide-slate-800 px-5">
          {(['top', 'middle', 'bottom'] as const).map((layer, index) => (
            <div key={layer} className="py-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium capitalize text-slate-200"><span className="mr-2 text-xs text-slate-500">0{index + 1}</span>{' '}{t(layerLabels[layer])}</h3>
                <span className="text-xs text-emerald-300">{handLabel(result.evaluations[layer], result.arrangement[layer].cards)}</span>
              </div>
              <div className="flex justify-center gap-3">{result.arrangement[layer].cards.map((card, i) => <Card key={card?.id ?? i} card={card} size="md" />)}</div>
            </div>
          ))}
        </div>
        {result.discardedCard && (
          <div className="mx-5 mb-5 flex items-center gap-4 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4">
            <Card card={result.discardedCard} size="sm" />
            <div><p className="font-medium text-rose-200">{t("Leave this card out")}</p><p className="mt-1 text-sm text-slate-400">{t('recommendedDiscard', { card: cardLabel(result.discardedCard) })}</p></div>
          </div>
        )}
      </div>
      {results.length > 1 && (
        <details className="rounded-xl border border-slate-700/60 bg-slate-900/50">
          <summary className="cursor-pointer px-4 py-4 text-sm text-slate-300">{t("Explore other arrangements")}</summary>
          <div className="px-4 pb-4 flex flex-wrap gap-2">
            {results.map((item, index) => <button type="button" key={index} onClick={() => setChoice(index)} aria-pressed={choice === index} className={`rounded-lg px-3 py-2 text-sm ${choice === index ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300'}`}>{index === 0 ? t("Recommended") : t('alternative', { count: index + 1 })}<span className="ml-2 text-xs opacity-70">{number(item.ev.totalEV, 1)}{t("pts")}</span></button>)}
          </div>
        </details>
      )}
      <details className="rounded-xl border border-slate-700/60 bg-slate-900/50">
        <summary className="cursor-pointer px-4 py-4 text-sm text-slate-400">{t("Why this arrangement?")}</summary>
        <div className="space-y-3 px-4 pb-4 text-sm text-slate-400">
          <p>{t('explainEV', { value: number(result.ev.totalEV, 2), count: opponents })}</p>
          <p className="text-xs">{t("These are estimates, not guaranteed outcomes. Suggestions may vary between analyses.")}</p>
          {(['top', 'middle', 'bottom'] as const).map(layer => <div key={layer} className="flex justify-between gap-3 border-t border-slate-800 pt-2"><span className="capitalize">{t(layerLabels[layer])}</span><span>{t('winRate', { count: Math.round(result.ev.winRates[layer] * 100) })}</span></div>)}
        </div>
      </details>
      <button type="button" onClick={onNewHand} className="w-full rounded-xl bg-amber-400 py-4 font-semibold text-slate-950 hover:bg-amber-300">{t("Try another hand")}</button>
      <button type="button" onClick={onEdit} className="w-full py-2 text-sm text-slate-400 hover:text-white">{t("Edit these cards")}</button>
    </div>
  );
}
