'use client';

import LanguageSwitch from '@/components/LanguageSwitch';
import { useLocale } from '@/lib/i18n/context';

import { useState } from 'react';
import Link from 'next/link';
import { AIDifficulty } from '@/lib/types';
import { GAME_LENGTH_OPTIONS, getStartingCash, type GameLength } from '@/lib/game-setup';

interface GameLobbyProps {
  onStartGame: (playerCount: number, startingCash: number, aiDifficulty: AIDifficulty) => void;
}

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Easy', description: 'Plays solid hands but doesn\'t adapt' },
  { value: 'medium', label: 'Medium', description: 'Calculates odds and plays strategically' },
  { value: 'hard', label: 'Hard', description: 'Tournament-level AI that adapts to game state' },
] as const;

export default function GameLobby({ onStartGame }: GameLobbyProps) {
  const { t, number } = useLocale();
  const [playerCount, setPlayerCount] = useState(4);
  const [gameLength, setGameLength] = useState<GameLength>('standard');
  const startingCash = getStartingCash(playerCount, gameLength);
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>('easy');
  const [showRules, setShowRules] = useState(false);

  const handleStart = () => {
    onStartGame(playerCount, startingCash, aiDifficulty);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      {/* Ambient background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
      </div>

      <div 
        className={`
          relative z-10 w-full max-w-lg
          bg-slate-900/80 backdrop-blur-xl
          border border-slate-700/50
          rounded-2xl shadow-2xl shadow-black/50
          p-6 sm:p-8 space-y-6
        `}
      >
        <div className="flex justify-end"><LanguageSwitch /></div>
        {/* Logo/Title */}
        <div className="text-center space-y-3">
          <h1 className="brand-wordmark text-5xl font-black tracking-tighter bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 bg-clip-text text-transparent">
            ONGDU
          </h1>
          <p className="text-slate-400 text-sm tracking-wide uppercase">{t("Casual Poker • 3-Layer Strategy")}</p>
        </div>

        {/* Player Count Selector */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-300">{t("Players")}</label>
          <div className="grid grid-cols-5 gap-2">
            {[2, 3, 4, 5, 6].map((count) => (
              <button
                key={count}
                aria-pressed={playerCount === count}
                onClick={() => setPlayerCount(count)}
                className={`
                  py-3 rounded-lg font-bold text-lg
                  transition-all duration-200
                  ${playerCount === count
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 shadow-lg shadow-amber-500/30'
                    : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-slate-300 border border-slate-600/30'
                  }
                `}
              >
                {count}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            {t('opponents', { count: playerCount - 1 })}
          </p>
        </div>

        {/* AI Difficulty Selector */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-300">{t("Difficulty")}</label>
          <div className="grid grid-cols-3 gap-2">
            {DIFFICULTY_OPTIONS.map((option) => (
              <button
                key={option.value}
                aria-pressed={aiDifficulty === option.value}
                onClick={() => setAiDifficulty(option.value)}
                className={`
                  py-3 rounded-lg font-bold text-sm
                  transition-all duration-200
                  ${aiDifficulty === option.value
                    ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-lg shadow-purple-500/30'
                    : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-slate-300 border border-slate-600/30'
                  }
                `}
              >
                {t(option.label)}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            {t(DIFFICULTY_OPTIONS.find(o => o.value === aiDifficulty)!.description)}
          </p>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-slate-300">{t("Game length")}</legend>
          <div className="grid grid-cols-3 gap-2">
            {GAME_LENGTH_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                aria-pressed={gameLength === option.value}
                onClick={() => setGameLength(option.value)}
                className={`rounded-lg border px-2 py-3 text-sm transition-colors ${gameLength === option.value
                  ? 'border-emerald-500 bg-emerald-600 text-white'
                  : 'border-slate-600/30 bg-slate-800/50 text-slate-400 hover:bg-slate-700/50'}`}
              >
                <span className="block font-medium">{t(option.label)}</span>
                <span className="mt-1 block text-xs opacity-80">{t('rounds', { count: option.rounds })}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400">{t('bankroll', { cash: number(startingCash) })}</p>
          <p className="text-xs text-slate-500">{t("Estimated length. Ends when anyone runs out of cash.")}</p>
        </fieldset>

        {/* Start Button */}
        <button
          onClick={handleStart}
          className="
            w-full py-4 rounded-xl
            bg-gradient-to-r from-emerald-500 to-teal-500
            text-white font-bold text-lg
            shadow-lg shadow-emerald-500/30
            transition-all duration-200
            hover:from-emerald-400 hover:to-teal-400
            hover:shadow-xl hover:shadow-emerald-500/40
            hover:-translate-y-0.5
          "
        >{t("Deal Cards")}</button>

        <div className="flex items-center justify-center gap-6">
          <button
            onClick={() => setShowRules(true)}
            className="py-2 text-slate-400 hover:text-amber-400 transition-colors text-sm"
          >
            <span>{t("How to Play")}</span>
          </button>

          {/* Card Helper Button */}
          <Link
            href="/helper"
            className="py-2 text-slate-400 hover:text-indigo-400 transition-colors text-sm"
          >
            <span>{t("Card Helper")}</span>
          </Link>
        </div>
      </div>

      {/* Rules Popup */}
      {showRules && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowRules(false)}
          />
          
          {/* Rules Modal */}
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl">
            {/* Header */}
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-amber-400">{t("How to Play Ongdu")}</h2><LanguageSwitch />
              <button
                onClick={() => setShowRules(false)}
                aria-label={t("Close")}
                className="text-slate-400 hover:text-white transition-colors text-2xl leading-none"
              >
                ×
              </button>
            </div>
            
            {/* Content */}
            <div className="px-6 py-5 space-y-5">
              {/* Overview */}
              <section>
                <h3 className="text-emerald-400 font-semibold mb-2">{t("🎯 Goal")}</h3>
                <p className="text-slate-300 text-sm leading-relaxed">{t("Arrange 9 cards into 3 layers (3 cards each). Beat opponents layer-by-layer to win points and cash!")}</p>
              </section>

              {/* Layer Rules */}
              <section>
                <h3 className="text-emerald-400 font-semibold mb-2">{t("📚 Layer Rules")}</h3>
                <ul className="text-slate-300 text-sm space-y-1.5">
                  <li className="flex gap-2">
                    <span className="text-amber-400">•</span>
                    <span><strong>{t("Bottom")}</strong>{' '}{t("must be your strongest hand")}</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-400">•</span>
                    <span><strong>{t("Middle")}</strong>{' '}{t("must be weaker than bottom")}</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-400">•</span>
                    <span><strong>{t("Top")}</strong>{' '}{t("must be your weakest hand")}</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-rose-400">⚠</span>
                    <span>{t("Breaking this order =")}<strong>{t("Foul")}</strong>{' '}{t("(10 pts penalty)")}</span>
                  </li>
                </ul>
              </section>

              {/* Hand Rankings */}
              <section>
                <h3 className="text-emerald-400 font-semibold mb-2">{t("🏆 Hand Rankings (Strongest → Weakest)")}</h3>
                <div className="bg-slate-800/50 rounded-lg p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between text-slate-300">
                    <span>{t("Three of a Kind")}</span>
                    <span className="text-amber-400 font-mono">{t("5 pts")}</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>{t("Straight Flush (J-Q-K same suit)")}</span>
                    <span className="text-amber-400 font-mono">{t("3 pts")}</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>{t("Straight (J-Q-K any suits)")}</span>
                    <span className="text-amber-400 font-mono">{t("3 pts")}</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>{t("Three of a Kind (with wild)")}</span>
                    <span className="text-amber-400 font-mono">{t("5 pts")}</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>{t("Three Face Cards (J/Q/K mix)")}</span>
                    <span className="text-amber-400 font-mono">{t("3 pts")}</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>{t("Sum Modulo 10 (9 best, 0 worst)")}</span>
                    <span className="text-amber-400 font-mono">{t("1 pt")}<span className="text-slate-500">{t("(3 if same suit)")}</span></span>
                  </div>
                </div>
              </section>

              {/* Scoring */}
              <section>
                <h3 className="text-emerald-400 font-semibold mb-2">{t("💰 Scoring")}</h3>
                <ul className="text-slate-300 text-sm space-y-1.5">
                  <li className="flex gap-2">
                    <span className="text-amber-400">•</span>
                    <span>{t("Compare each layer vs each opponent")}</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-400">•</span>
                    <span>{t("Winner gets points based on winning hand type")}</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-400">•</span>
                    <span><strong>{t("$1 per point")}</strong>{' '}{t("- loser pays winner")}</span>
                  </li>
                </ul>
              </section>

              {/* Special Hands */}
              <section>
                <h3 className="text-emerald-400 font-semibold mb-2">{t("✨ Special Bonuses")}</h3>
                <ul className="text-slate-300 text-sm space-y-1.5">
                  <li className="flex gap-2">
                    <span className="text-amber-400">•</span>
                    <span><strong>{t("Four of a Kind")}</strong>{' '}{t("across all cards = 10 pts/opponent")}</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-400">•</span>
                    <span><strong>{t("All Nines")}</strong>{' '}{t("(all 3 layers sum to 9) = 10 pts/opponent")}</span>
                  </li>
                </ul>
              </section>

              {/* Card Values */}
              <section>
                <h3 className="text-emerald-400 font-semibold mb-2">{t("🃏 Card Values (for Sum)")}</h3>
                <p className="text-slate-300 text-sm">{t("A=1, 2-10=face value, J/Q/K=10,")}<span className="text-amber-400">{t("Wild=any card")}</span>
                </p>
              </section>

              {/* Game End */}
              <section>
                <h3 className="text-emerald-400 font-semibold mb-2">{t("🏁 Game End")}</h3>
                <p className="text-slate-300 text-sm">{t("Game ends when any player goes bankrupt. Richest player wins!")}</p>
              </section>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-slate-900 border-t border-slate-700 px-6 py-4">
              <button
                onClick={() => setShowRules(false)}
                aria-label={t("Close")}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 font-bold transition-all hover:from-amber-400 hover:to-orange-400"
              >{t("Got it!")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

