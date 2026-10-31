'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card as CardType, Suit, Rank, HandEvaluation } from '@/lib/types';
import { getHandPoints } from '@/lib/game-logic';
import {
  EVRankedArrangement,
  findBestArrangementsByEV,
  findBestArrangementsByEVFor10,
} from '@/lib/expected-value';
import Card from '@/components/Card';
import CardCameraCapture from '@/components/CardCameraCapture';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const suitSymbols: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

const suitColors: Record<Suit, string> = {
  hearts: 'text-rose-500 hover:bg-rose-500/20',
  diamonds: 'text-rose-500 hover:bg-rose-500/20',
  clubs: 'text-slate-300 hover:bg-slate-500/20',
  spades: 'text-slate-300 hover:bg-slate-500/20',
};

export default function HelperPage() {
  const [selectedCards, setSelectedCards] = useState<CardType[]>([]);
  const [selectedRank, setSelectedRank] = useState<Rank | null>(null);
  const [selectedSuit, setSelectedSuit] = useState<Suit | null>(null);
  const [textInput, setTextInput] = useState('');
  const [textError, setTextError] = useState<string | null>(null);
  const [results, setResults] = useState<EVRankedArrangement[] | null>(null);
  const [expandedAlternative, setExpandedAlternative] = useState<number | null>(null);
  const [numOpponents, setNumOpponents] = useState(1);
  const [isCalculating, setIsCalculating] = useState(false);

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

  // Generate 9 random cards
  const generateRandom = () => {
    // Build full deck
    const deck: CardType[] = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({
          id: `${rank}-${suit}-${Date.now()}-${deck.length}`,
          rank,
          suit,
          isWild: false,
        });
      }
    }
    // Add 3 wildcards
    for (let i = 1; i <= 3; i++) {
      deck.push({
        id: `wild-${i}-${Date.now()}`,
        rank: 'WILD',
        suit: 'wild',
        isWild: true,
      });
    }

    // Shuffle using Fisher-Yates
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    // Take first 9 cards
    setSelectedCards(deck.slice(0, 9));
    setResults(null);
    setTextError(null);
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
          setTextError('Maximum 3 wildcards allowed');
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
        setTextError(`Invalid format: "${token}". Use format like "Jh", "10s", "Kd", or "W" for wild`);
        return;
      }

      const rankStr = match[1].toUpperCase();
      const suitChar = match[2].toLowerCase();

      // Validate rank
      if (!RANKS.includes(rankStr as Rank)) {
        setTextError(`Invalid rank: "${rankStr}". Valid ranks: 2-10, J, Q, K, A`);
        return;
      }

      const rank = rankStr as Rank;
      const suit = suitMap[suitChar];

      // Check for duplicates
      if (isCardSelected(rank, suit) || newCards.some(c => c.rank === rank && c.suit === suit && !c.isWild)) {
        setTextError(`Duplicate card: ${rankStr}${suitChar}`);
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
      setTextError(`Adding ${newCards.length} cards would exceed maximum of 10`);
      return;
    }

    setSelectedCards([...selectedCards, ...newCards]);
    setTextInput('');
    setResults(null);
  };

  // Calculate best arrangements using EV
  const calculateArrangements = () => {
    setIsCalculating(true);
    setResults(null);

    // Use setTimeout to allow UI to update before heavy computation
    setTimeout(() => {
      let newResults: EVRankedArrangement[] = [];

      if (selectedCards.length === 9) {
        newResults = findBestArrangementsByEV(selectedCards, numOpponents, 4, 800);
      } else if (selectedCards.length === 10) {
        newResults = findBestArrangementsByEVFor10(selectedCards, numOpponents, 4, 800);
      }

      setResults(newResults);
      setExpandedAlternative(null);
      setIsCalculating(false);
    }, 10);
  };

  // Render an arrangement layer with EV metrics
  const renderLayerWithEV = (
    label: string,
    cards: (CardType | null)[],
    evaluation: HandEvaluation,
    ev: number,
    winRate: number
  ) => {
    const points = getHandPoints(evaluation);
    return (
      <div className="flex flex-col gap-1 py-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex items-center gap-3">
            <span className="w-10 text-xs text-slate-400 uppercase font-medium shrink-0">{label}</span>
            <div className="flex gap-1">
              {cards.map((card, idx) => (
                <Card key={idx} card={card} size="sm" />
              ))}
            </div>
          </div>
          <span className="text-xs text-emerald-400 sm:ml-2 ml-10">{evaluation.description}</span>
        </div>
        <div className="ml-10 text-xs text-slate-500">
          <span className="text-amber-400">{points} pt{points !== 1 ? 's' : ''}</span>
          <span className="mx-1">×</span>
          <span className="text-indigo-400">{Math.round(winRate * 100)}%</span>
          <span className="mx-1">=</span>
          <span className="text-emerald-400 font-medium">{ev.toFixed(2)} EV</span>
        </div>
      </div>
    );
  };

  const canCalculate = selectedCards.length >= 9;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
      {/* Ambient background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Card Helper
          </h1>
          <Link
            href="/"
            className="px-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-300 text-sm hover:bg-slate-700/50 transition-colors"
          >
            Back to Game
          </Link>
        </div>

        <CardCameraCapture onUseCards={(cards) => {
          setSelectedCards(cards);
          setResults(null);
          setExpandedAlternative(null);
          setSelectedRank(null);
          setSelectedSuit(null);
          setTextInput('');
          setTextError(null);
        }} />

        {/* Card Input Section */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4 space-y-4">
          <h2 className="text-sm font-medium text-slate-300">Add Cards</h2>

          {/* Rank Selector */}
          <div className="space-y-2">
            <label className="text-xs text-slate-500">Select Rank</label>
            <div className="grid grid-cols-7 gap-1">
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
          <div className="flex gap-2 items-center">
            {SUITS.map(suit => (
              <button
                key={suit}
                onClick={() => setSelectedSuit(suit)}
                disabled={selectedRank ? isCardSelected(selectedRank, suit) : false}
                className={`
                  w-11 h-11 rounded-lg text-2xl transition-all
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
              className="w-11 h-11 rounded-lg bg-amber-600/20 text-amber-400 text-xl border border-amber-500/30 hover:bg-amber-600/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              title="Add Wildcard"
            >
              ★
            </button>

            <button
              onClick={addFromPicker}
              disabled={!selectedRank || !selectedSuit || selectedCards.length >= 10}
              className="flex-1 h-11 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>

          {/* Text Input */}
          <div className="space-y-2 pt-2 border-t border-slate-700/50">
            <label className="text-xs text-slate-500">Or type cards (e.g., &quot;Jh Qd Ks W&quot;)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && parseTextInput()}
                placeholder="Jh Qd Ks 5c 7h 9s 2d 3c 10h"
                className="flex-1 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-600/50 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
              <button
                onClick={parseTextInput}
                disabled={!textInput.trim()}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Parse
              </button>
            </div>
            {textError && (
              <p className="text-xs text-rose-400">{textError}</p>
            )}
          </div>
        </div>

        {/* Selected Cards Display */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-300">
              Selected Cards
              <span className={`ml-2 ${selectedCards.length >= 9 ? 'text-emerald-400' : 'text-slate-500'}`}>
                {selectedCards.length}/9 {selectedCards.length >= 9 && '✓'}
                {selectedCards.length === 10 && ' (will discard 1)'}
              </span>
            </h2>
            <div className="flex gap-2">
              <button
                onClick={generateRandom}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Random 9
              </button>
              {selectedCards.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-xs text-slate-500 hover:text-rose-400 transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>

          {selectedCards.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">
              Add cards using the picker above or type them in
            </p>
          ) : (
            <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
              {selectedCards.map(card => (
                <div key={card.id} className="relative">
                  <Card card={card} size="sm" />
                  <button
                    onClick={() => removeCard(card.id)}
                    className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center shadow-md active:scale-90 transition-transform"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Opponent Selector */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-slate-300">Number of Opponents</h2>
              <p className="text-xs text-slate-500 mt-0.5">Optimize strategy for this many opponents</p>
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => {
                    setNumOpponents(n);
                    setResults(null);
                  }}
                  className={`
                    w-9 h-9 rounded-lg text-sm font-medium transition-all
                    ${numOpponents === n
                      ? 'bg-indigo-500 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }
                  `}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Calculate Button */}
        <button
          onClick={calculateArrangements}
          disabled={!canCalculate || isCalculating}
          className={`
            w-full py-4 rounded-xl font-bold text-lg transition-all
            ${canCalculate && !isCalculating
              ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/30 hover:from-indigo-400 hover:to-purple-400'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }
          `}
        >
          {isCalculating
            ? 'Calculating...'
            : selectedCards.length < 9
              ? `Add ${9 - selectedCards.length} more card${9 - selectedCards.length > 1 ? 's' : ''}`
              : 'Calculate Best Arrangement'
          }
        </button>

        {/* Results Section */}
        {results && results.length > 0 && (
          <div className="space-y-4">
            {/* Best Arrangement */}
            <div className="bg-slate-900/80 backdrop-blur-xl border border-emerald-500/30 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">BEST ARRANGEMENT</span>
                  {results[0].discardedCard && (
                    <span className="text-xs text-slate-400">
                      (discard: {results[0].discardedCard.isWild ? 'Wild' : `${results[0].discardedCard.rank}${suitSymbols[results[0].discardedCard.suit as Suit]}`})
                    </span>
                  )}
                </div>
              </div>

              <div className="divide-y divide-slate-700/50">
                {renderLayerWithEV(
                  'Top',
                  results[0].arrangement.top.cards,
                  results[0].evaluations.top,
                  results[0].ev.topEV,
                  results[0].ev.winRates.top
                )}
                {renderLayerWithEV(
                  'Mid',
                  results[0].arrangement.middle.cards,
                  results[0].evaluations.middle,
                  results[0].ev.middleEV,
                  results[0].ev.winRates.middle
                )}
                {renderLayerWithEV(
                  'Bot',
                  results[0].arrangement.bottom.cards,
                  results[0].evaluations.bottom,
                  results[0].ev.bottomEV,
                  results[0].ev.winRates.bottom
                )}
              </div>

              {/* Total EV Summary */}
              <div className="mt-4 pt-3 border-t border-slate-700/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Total Expected Value</span>
                  <span className="text-lg font-bold text-emerald-400">
                    {results[0].ev.totalEV.toFixed(2)} pts
                  </span>
                </div>
                {numOpponents > 1 && (
                  <p className="text-xs text-slate-500 mt-1">
                    ~{(results[0].ev.totalEV / numOpponents).toFixed(2)} pts per opponent × {numOpponents} opponents
                  </p>
                )}
              </div>
            </div>

            {/* Alternative Arrangements */}
            {results.slice(1).map((result, idx) => (
              <div
                key={idx}
                className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setExpandedAlternative(expandedAlternative === idx ? null : idx)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
                >
                  <span className="text-slate-400 text-sm">
                    Alternative {idx + 1}
                    {result.discardedCard && (
                      <span className="text-xs text-slate-500 ml-2">
                        (discard: {result.discardedCard.isWild ? 'Wild' : `${result.discardedCard.rank}${suitSymbols[result.discardedCard.suit as Suit]}`})
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-slate-500">
                    <span className="text-amber-400">{result.ev.totalEV.toFixed(2)} EV</span>
                    <span className="ml-2 text-rose-400">
                      ({(results[0].ev.totalEV - result.ev.totalEV).toFixed(2)} less)
                    </span>
                    <span className="ml-2">{expandedAlternative === idx ? '▲' : '▼'}</span>
                  </span>
                </button>

                {expandedAlternative === idx && (
                  <div className="px-4 pb-4">
                    <div className="divide-y divide-slate-700/50">
                      {renderLayerWithEV(
                        'Top',
                        result.arrangement.top.cards,
                        result.evaluations.top,
                        result.ev.topEV,
                        result.ev.winRates.top
                      )}
                      {renderLayerWithEV(
                        'Mid',
                        result.arrangement.middle.cards,
                        result.evaluations.middle,
                        result.ev.middleEV,
                        result.ev.winRates.middle
                      )}
                      {renderLayerWithEV(
                        'Bot',
                        result.arrangement.bottom.cards,
                        result.evaluations.bottom,
                        result.ev.bottomEV,
                        result.ev.winRates.bottom
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {results && results.length === 0 && (
          <div className="bg-slate-900/80 backdrop-blur-xl border border-rose-500/30 rounded-xl p-4 text-center">
            <p className="text-rose-400">No valid arrangement found for these cards.</p>
            <p className="text-slate-500 text-sm mt-1">This is rare - try different cards.</p>
          </div>
        )}
      </div>
    </div>
  );
}
