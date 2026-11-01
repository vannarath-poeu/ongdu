'use client';

import LanguageSwitch from '@/components/LanguageSwitch';
import { msg, type Message } from '@/lib/i18n/core';
import { UIError, errorMessages } from '@/lib/i18n/errors';
import { useLocale } from '@/lib/i18n/context';

import { useRef, useState } from 'react';
import Link from 'next/link';
import type { Card as CardType, Suit, Rank } from '@/lib/types';
import type { EVRankedArrangement } from '@/lib/expected-value';
import { useHelperAnalysis } from '@/lib/use-helper-analysis';
import Card from '@/components/Card';
import CardCameraCapture from '@/components/CardCameraCapture';
import HelperArrangementResults from '@/components/HelperArrangementResults';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const suitSymbols: Record<Suit, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const suitColors: Record<Suit, string> = {
  hearts: 'text-rose-500 hover:bg-rose-500/20', diamonds: 'text-rose-500 hover:bg-rose-500/20',
  clubs: 'text-slate-300 hover:bg-slate-500/20', spades: 'text-slate-300 hover:bg-slate-500/20',
};

export default function HelperPage() {
  const { t, cardLabel, message } = useLocale();
  const [selectedCards, setSelectedCards] = useState<CardType[]>([]);
  const [selectedRank, setSelectedRank] = useState<Rank | null>(null);
  const [selectedSuit, setSelectedSuit] = useState<Suit | null>(null);
  const [textInput, setTextInput] = useState('');
  const [textError, setTextError] = useState<Message | null>(null);
  const [results, setResults] = useState<EVRankedArrangement[] | null>(null);
  const [numOpponents, setNumOpponents] = useState(1);
  const [flow, setFlow] = useState<'input' | 'analyzing' | 'results'>('input');
  const [photoActive, setPhotoActive] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [photoKey, setPhotoKey] = useState(0);
  const [analysisError, setAnalysisError] = useState<Message | null>(null);
  const analysisVersion = useRef(0);
  const { analyze, cancel } = useHelperAnalysis();

  // Check if a card is already selected
  const isCardSelected = (rank: Rank, suit: Suit): boolean => {
    return selectedCards.some(c => c.rank === rank && c.suit === suit && !c.isWild);
  };

  // Count wildcards
  const wildcardCount = selectedCards.filter(c => c.isWild).length;

  // Add a card to selection
  const addCard = (card: CardType) => {
    if (selectedCards.length >= 10) return;
    if (!card.isWild && isCardSelected(card.rank as Rank, card.suit as Suit)) return;
    if (card.isWild && wildcardCount >= 3) return;

    setSelectedCards([...selectedCards, card]);
    setSelectedRank(null);
    setSelectedSuit(null);
    setResults(null);
  };

  // Add card from picker
  const addFromPicker = () => {
    if (selectedRank && selectedSuit) {
      const card: CardType = {
        id: `${selectedRank}-${selectedSuit}-${Date.now()}`,
        rank: selectedRank,
        suit: selectedSuit,
        isWild: false,
      };
      addCard(card);
    }
  };

  // Add wildcard
  const addWildcard = () => {
    if (wildcardCount >= 3 || selectedCards.length >= 10) return;
    const card: CardType = {
      id: `wild-${wildcardCount + 1}-${Date.now()}`,
      rank: 'WILD',
      suit: 'wild',
      isWild: true,
    };
    addCard(card);
  };

  // Remove a card
  const removeCard = (cardId: string) => {
    setSelectedCards(selectedCards.filter(c => c.id !== cardId));
    setResults(null);
  };

  // Clear all cards
  const clearAll = () => {
    setSelectedCards([]);
    setTextInput('');
    setTextError(null);
    setResults(null);
    setSelectedRank(null);
    setSelectedSuit(null);
  };

  // Parse text input
  const parseTextInput = () => {
    setTextError(null);
    const input = textInput.trim();
    if (!input) return;

    const suitMap: Record<string, Suit> = {
      h: 'hearts',
      d: 'diamonds',
      c: 'clubs',
      s: 'spades',
    };

    const tokens = input.split(/\s+/);
    const newCards: CardType[] = [];

    for (const token of tokens) {
      const upperToken = token.toUpperCase();

      // Check for wildcard
      if (upperToken === 'W' || upperToken === 'WILD') {
        if (wildcardCount + newCards.filter(c => c.isWild).length >= 3) {
          setTextError(msg('Maximum 3 wildcards allowed'));
          return;
        }
        newCards.push({
          id: `wild-parse-${Date.now()}-${newCards.length}`,
          rank: 'WILD',
          suit: 'wild',
          isWild: true,
        });
        continue;
      }

      // Parse rank+suit format (e.g., "Jh", "10s", "Kd")
      const match = token.match(/^(\d{1,2}|[JQKA])([hdcs])$/i);
      if (!match) {
        setTextError(msg('invalidFormat', { token }));
        return;
      }

      const rankStr = match[1].toUpperCase();
      const suitChar = match[2].toLowerCase();

      // Validate rank
      if (!RANKS.includes(rankStr as Rank)) {
        setTextError(msg('invalidRank', { rank: rankStr }));
        return;
      }

      const rank = rankStr as Rank;
      const suit = suitMap[suitChar];

      // Check for duplicates
      if (isCardSelected(rank, suit) || newCards.some(c => c.rank === rank && c.suit === suit && !c.isWild)) {
        setTextError(msg('duplicateCard', { card: `${rankStr}${suitChar}` }));
        return;
      }

      newCards.push({
        id: `${rank}-${suit}-${Date.now()}-${newCards.length}`,
        rank,
        suit,
        isWild: false,
      });
    }

    // Check total count
    if (selectedCards.length + newCards.length > 10) {
      setTextError(msg('exceedsCards', { count: newCards.length }));
      return;
    }

    setSelectedCards([...selectedCards, ...newCards]);
    setTextInput('');
    setResults(null);
  };

  const calculateArrangements = async (cards = selectedCards, opponents = numOpponents) => {
    if (cards.length !== 9 && cards.length !== 10) return;
    const version = ++analysisVersion.current;
    setAnalysisError(null);
    setResults(null);
    setFlow('analyzing');
    try {
      const arrangements = await analyze(cards, opponents);
      if (version !== analysisVersion.current) return;
      setResults(arrangements);
      setFlow('results');
    } catch (error) {
      if (version !== analysisVersion.current || (error instanceof DOMException && error.name === 'AbortError')) return;
      console.error('Helper analysis failed:', error);
      setAnalysisError(errorMessages[error instanceof UIError ? error.code : 'ANALYSIS_FAILED']);
      setFlow('input');
    }
  };

  const backToCards = () => {
    analysisVersion.current++;
    cancel();
    setAnalysisError(null);
    setFlow('input');
  };
  const startOver = () => {
    backToCards();
    clearAll();
    setManualOpen(false);
    setPhotoActive(false);
    setPhotoKey(key => key + 1);
  };
  const step = flow !== 'input' ? 2 : photoActive || selectedCards.length > 0 ? 1 : 0;

  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-12 pt-6 sm:pt-10">
      <div className="mx-auto max-w-lg space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <Link href="/" className="text-slate-400 transition-colors hover:text-white">{t("← Back to game")}</Link>
          <span className="text-xs uppercase tracking-[0.2em] text-indigo-300">{t("Ongdu · Card helper")}</span><LanguageSwitch />
        </header>
        <div className="pt-3">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{flow === 'results' ? t("Your hand, arranged.") : flow === 'analyzing' ? t("Finding your best play.") : t("Make the most of your hand.")}</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">{flow === 'results' ? t("A clear place for every card. Ready for your next round.") : t("Add your cards, check your hand, and get a recommended arrangement.")}</p>
        </div>
        <ol aria-label={t("Arrangement progress")} className="flex items-center gap-2 border-b border-slate-800 pb-5">
          {[t("Add hand"), t("Check cards"), t("Arrange")].map((label, i) => <li key={label} aria-current={i === step ? 'step' : undefined} className={`flex flex-1 items-center gap-2 text-xs ${i === step ? 'text-slate-100' : i < step ? 'text-emerald-300' : 'text-slate-500'}`}><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${i === step ? 'bg-indigo-400/20 text-indigo-200' : 'bg-slate-800'}`}>{i < step ? '✓' : i + 1}</span>{label}</li>)}
        </ol>
        {flow !== 'analyzing' && <details className="text-sm text-slate-400">
          <summary className="cursor-pointer list-none">{t('playersCount', { count: numOpponents + 1 })} <span className="ml-1 text-xs text-indigo-300">{t("· Change")}</span></summary>
          <div className="mt-3 rounded-xl border border-slate-700/60 bg-slate-900 p-4">
            <label htmlFor="helper-players" className="text-sm text-slate-300">{t("How many players, including you?")}</label>
            <select id="helper-players" value={numOpponents} onChange={event => { const opponents = Number(event.target.value); setNumOpponents(opponents); if (flow === 'results') void calculateArrangements(selectedCards, opponents); }} className="mt-2 w-full rounded-lg bg-slate-800 p-3 text-white">
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{t('playersCount', { count: n + 1 })}</option>)}
            </select>
          </div>
        </details>}
        {analysisError && <div role="alert" className="rounded-xl border border-amber-400/30 p-4 text-sm text-amber-200">{message(analysisError)}<button type="button" onClick={() => { void calculateArrangements(); }} className="ml-3 underline">{t("Try again")}</button></div>}
        <div hidden={flow !== 'input' || manualOpen}>
          <CardCameraCapture active={flow === 'input' && !manualOpen} key={photoKey} onActiveChange={setPhotoActive} onManualEntry={() => setManualOpen(true)} onUseCards={cards => {
            setSelectedCards(cards);
            setSelectedRank(null); setSelectedSuit(null); setTextInput(''); setTextError(null);
            void calculateArrangements(cards);
          }} />
        </div>
        {flow === 'input' && !photoActive && !manualOpen && <button type="button" onClick={() => { setManualOpen(true); setAnalysisError(null); }} className="w-full py-2 text-sm text-slate-400 underline underline-offset-4 hover:text-white">{t("Enter cards instead")}</button>}
        {flow === 'input' && manualOpen && <div className="space-y-5">
          <button type="button" onClick={() => setManualOpen(false)} className="text-sm text-indigo-300">{t("← Use a photo instead")}</button>
        {/* Manual card entry */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4 space-y-4">
          <h2 className="text-sm font-medium text-slate-300">{t("Choose your cards")}</h2>

          {/* Rank Selector */}
          <div className="space-y-2">
            <label className="text-xs text-slate-500">{t("Select Rank")}</label>
            <div className="grid grid-cols-5 gap-1 sm:grid-cols-7">
              {RANKS.map(rank => (
                <button
                  key={rank}
                  onClick={() => setSelectedRank(rank)}
                  className={`
                    min-h-[44px] py-2 rounded text-sm font-medium transition-all
                    ${selectedRank === rank
                      ? 'bg-amber-500 text-slate-900'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 active:bg-slate-600'
                    }
                  `}
                >
                  {rank}
                </button>
              ))}
            </div>
          </div>

          {/* Suit Selector + Wild + Add */}
          <div className="grid grid-cols-4 gap-2 items-center">
            {SUITS.map(suit => (
              <button
                key={suit}
                aria-label={t(`suit.${suit}`)}
                aria-pressed={selectedSuit === suit}
                onClick={() => setSelectedSuit(suit)}
                disabled={selectedRank ? isCardSelected(selectedRank, suit) : false}
                className={`
                  w-full h-11 rounded-lg text-2xl transition-all
                  ${selectedSuit === suit
                    ? 'bg-amber-500 text-slate-900'
                    : `bg-slate-800 ${suitColors[suit]} disabled:opacity-30 disabled:cursor-not-allowed`
                  }
                `}
              >
                {suitSymbols[suit]}
              </button>
            ))}

            <button
              onClick={addWildcard}
              disabled={wildcardCount >= 3 || selectedCards.length >= 10}
              className="w-full h-11 rounded-lg bg-amber-600/20 text-amber-400 text-xl border border-amber-500/30 hover:bg-amber-600/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              title={t("Add Wildcard")}
            >
              ★
            </button>

            <button
              onClick={addFromPicker}
              disabled={!selectedRank || !selectedSuit || selectedCards.length >= 10}
              className="col-span-3 h-11 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >{t("Add")}</button>
          </div>

          {/* Text Input */}
          <div className="space-y-2 pt-2 border-t border-slate-700/50">
            <label className="text-xs text-slate-500">{t("Or type cards (e.g., \"Jh Qd Ks W\")")}</label>
            <div className="flex gap-2">
              <input
                aria-label={t("Type cards")}
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && parseTextInput()}
                placeholder="Jh Qd Ks 5c 7h 9s 2d 3c 10h"
                className="min-w-0 flex-1 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-600/50 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
              <button
                onClick={parseTextInput}
                disabled={!textInput.trim()}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >{t("Add cards")}</button>
            </div>
            {textError && (
              <p className="text-xs text-rose-400">{message(textError)}</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-4 space-y-4">
          <div className="flex items-center justify-between"><h2 className="text-sm font-medium text-slate-200">{t("Your hand")}<span className="ml-2 text-slate-400">{t('cardsCount', { count: selectedCards.length })}</span></h2>{selectedCards.length > 0 && <button type="button" onClick={clearAll} className="text-xs text-slate-400 hover:text-rose-300">{t("Clear hand")}</button>}</div>
          {selectedCards.length ? <div className="grid grid-cols-4 min-[400px]:grid-cols-5 gap-3">{selectedCards.map(card => <div key={card.id} className="relative mx-auto"><Card card={card} size="sm" /><button type="button" onClick={() => removeCard(card.id)} aria-label={t('removeCard', { card: cardLabel(card) })} className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-sm text-white">×</button></div>)}</div> : <p className="py-3 text-center text-sm text-slate-500">{t("Choose a rank and suit to add your first card.")}</p>}
          <p className="text-xs text-slate-400">{selectedCards.length === 10 ? t("We’ll find the best card to discard.") : selectedCards.length === 9 ? t("Your hand is ready.") : t('moreCards', { count: 9 - selectedCards.length })}</p>
        </div>
        <button type="button" onClick={() => { void calculateArrangements(); }} disabled={selectedCards.length !== 9 && selectedCards.length !== 10} className="w-full rounded-xl bg-amber-400 py-4 font-semibold text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500">{t("Find my best arrangement →")}</button>
        </div>}
        {flow === 'analyzing' && <div className="rounded-3xl border border-indigo-400/20 bg-slate-900 px-5 py-10 text-center space-y-5" role="status" aria-live="polite">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
          <h2 className="text-xl font-semibold text-white">{t("Finding the strongest arrangement")}</h2>
          <p className="mx-auto max-w-xs text-sm leading-relaxed text-slate-400">{selectedCards.length === 10 ? t("Comparing discards and checking how your layers play together.") : t("Checking how your top, middle, and bottom layers play together.")}</p>
          <div className="flex justify-center gap-1">{selectedCards.slice(0, 5).map(card => <Card key={card.id} card={card} size="xs" />)}</div>
          <button type="button" onClick={backToCards} className="text-sm text-slate-400 underline underline-offset-4">{t("Back to my cards")}</button>
        </div>}
        {flow === 'results' && results && <HelperArrangementResults results={results} opponents={numOpponents} onEdit={backToCards} onNewHand={startOver} />}
      </div>
    </main>
  );
}
