'use client';

import { useState } from 'react';

interface GameLobbyProps {
  onStartGame: (playerCount: number, playerName: string, startingCash: number) => void;
}

const AI_NAMES = [
  'Dragon', 'Phoenix', 'Tiger', 'Turtle', 'Serpent'
];

export default function GameLobby({ onStartGame }: GameLobbyProps) {
  const [playerName, setPlayerName] = useState('Player');
  const [playerCount, setPlayerCount] = useState(4);
  const [startingCash, setStartingCash] = useState(1000);
  const [isStarting, setIsStarting] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const handleStart = () => {
    setIsStarting(true);
    setTimeout(() => {
      onStartGame(playerCount, playerName, startingCash);
    }, 500);
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
          p-8 space-y-8
          transition-all duration-500
          ${isStarting ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}
        `}
      >
        {/* Logo/Title */}
        <div className="text-center space-y-3">
          <h1 className="text-5xl font-black tracking-tighter bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 bg-clip-text text-transparent">
            ONGDU
          </h1>
          <p className="text-slate-400 text-sm tracking-wide uppercase">
            Casual Poker • 3-Layer Strategy
          </p>
          <div className="flex justify-center gap-2 text-2xl">
            <span className="text-rose-500">♥</span>
            <span className="text-slate-300">♠</span>
            <span className="text-rose-500">♦</span>
            <span className="text-slate-300">♣</span>
          </div>
        </div>

        {/* Player Name Input */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">
            Your Name
          </label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={12}
            className="
              w-full px-4 py-3 rounded-lg
              bg-slate-800/50 border border-slate-600/50
              text-white placeholder-slate-500
              focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50
              transition-all
            "
            placeholder="Enter your name"
          />
        </div>

        {/* Player Count Selector */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-300">
            Number of Players
          </label>
          <div className="grid grid-cols-5 gap-2">
            {[2, 3, 4, 5, 6].map((count) => (
              <button
                key={count}
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
            You vs {playerCount - 1} AI opponent{playerCount > 2 ? 's' : ''}
          </p>
        </div>

        {/* AI Opponents Preview */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">
            AI Opponents
          </label>
          <div className="flex flex-wrap gap-2">
            {AI_NAMES.slice(0, playerCount - 1).map((name, idx) => (
              <div
                key={name}
                className="
                  px-3 py-1.5 rounded-full
                  bg-slate-800/50 border border-slate-600/30
                  text-sm text-slate-400
                  flex items-center gap-2
                "
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {name}
              </div>
            ))}
          </div>
        </div>

        {/* Starting Cash */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-300">
            Starting Cash
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[500, 1000, 2000, 5000].map((amount) => (
              <button
                key={amount}
                onClick={() => setStartingCash(amount)}
                className={`
                  py-2 rounded-lg font-medium text-sm
                  transition-all duration-200
                  ${startingCash === amount
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                    : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-slate-300 border border-slate-600/30'
                  }
                `}
              >
                ${amount.toLocaleString()}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            $1 per point • Game ends when any player goes bankrupt
          </p>
        </div>

        {/* Start Button */}
        <button
          onClick={handleStart}
          disabled={!playerName.trim()}
          className="
            w-full py-4 rounded-xl
            bg-gradient-to-r from-emerald-500 to-teal-500
            text-white font-bold text-lg
            shadow-lg shadow-emerald-500/30
            transition-all duration-200
            hover:from-emerald-400 hover:to-teal-400
            hover:shadow-xl hover:shadow-emerald-500/40
            hover:-translate-y-0.5
            disabled:opacity-50 disabled:cursor-not-allowed
            disabled:hover:translate-y-0
          "
        >
          Deal Cards
        </button>

        {/* How to Play Button */}
        <button
          onClick={() => setShowRules(true)}
          className="w-full py-2 text-slate-400 hover:text-amber-400 transition-colors text-sm font-medium flex items-center justify-center gap-2"
        >
          <span>📖</span>
          <span>How to Play</span>
        </button>
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
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-amber-400">How to Play Ongdu</h2>
              <button
                onClick={() => setShowRules(false)}
                className="text-slate-400 hover:text-white transition-colors text-2xl leading-none"
              >
                ×
              </button>
            </div>
            
            {/* Content */}
            <div className="px-6 py-5 space-y-5">
              {/* Overview */}
              <section>
                <h3 className="text-emerald-400 font-semibold mb-2">🎯 Goal</h3>
                <p className="text-slate-300 text-sm leading-relaxed">
                  Arrange 9 cards into 3 layers (3 cards each). Beat opponents layer-by-layer to win points and cash!
                </p>
              </section>

              {/* Layer Rules */}
              <section>
                <h3 className="text-emerald-400 font-semibold mb-2">📚 Layer Rules</h3>
                <ul className="text-slate-300 text-sm space-y-1.5">
                  <li className="flex gap-2">
                    <span className="text-amber-400">•</span>
                    <span><strong>Bottom</strong> must be your strongest hand</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-400">•</span>
                    <span><strong>Middle</strong> must be weaker than bottom</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-400">•</span>
                    <span><strong>Top</strong> must be your weakest hand</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-rose-400">⚠</span>
                    <span>Breaking this order = <strong>Foul</strong> (10 pts penalty)</span>
                  </li>
                </ul>
              </section>

              {/* Hand Rankings */}
              <section>
                <h3 className="text-emerald-400 font-semibold mb-2">🏆 Hand Rankings (Strongest → Weakest)</h3>
                <div className="bg-slate-800/50 rounded-lg p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between text-slate-300">
                    <span>Three of a Kind</span>
                    <span className="text-amber-400 font-mono">5 pts</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Straight Flush (J-Q-K same suit)</span>
                    <span className="text-amber-400 font-mono">3 pts</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Straight (J-Q-K any suits)</span>
                    <span className="text-amber-400 font-mono">3 pts</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Three of a Kind (with wild)</span>
                    <span className="text-amber-400 font-mono">5 pts</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Three Face Cards (J/Q/K mix)</span>
                    <span className="text-amber-400 font-mono">3 pts</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Sum Modulo 10 (9 best, 0 worst)</span>
                    <span className="text-amber-400 font-mono">1 pt <span className="text-slate-500">(3 if same suit)</span></span>
                  </div>
                </div>
              </section>

              {/* Scoring */}
              <section>
                <h3 className="text-emerald-400 font-semibold mb-2">💰 Scoring</h3>
                <ul className="text-slate-300 text-sm space-y-1.5">
                  <li className="flex gap-2">
                    <span className="text-amber-400">•</span>
                    <span>Compare each layer vs each opponent</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-400">•</span>
                    <span>Winner gets points based on winning hand type</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-400">•</span>
                    <span><strong>$1 per point</strong> - loser pays winner</span>
                  </li>
                </ul>
              </section>

              {/* Special Hands */}
              <section>
                <h3 className="text-emerald-400 font-semibold mb-2">✨ Special Bonuses</h3>
                <ul className="text-slate-300 text-sm space-y-1.5">
                  <li className="flex gap-2">
                    <span className="text-amber-400">•</span>
                    <span><strong>Four of a Kind</strong> across all cards = 10 pts/opponent</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-amber-400">•</span>
                    <span><strong>All Nines</strong> (all 3 layers sum to 9) = 10 pts/opponent</span>
                  </li>
                </ul>
              </section>

              {/* Card Values */}
              <section>
                <h3 className="text-emerald-400 font-semibold mb-2">🃏 Card Values (for Sum)</h3>
                <p className="text-slate-300 text-sm">
                  A=1, 2-10=face value, J/Q/K=10, <span className="text-amber-400">Wild=any card</span>
                </p>
              </section>

              {/* Game End */}
              <section>
                <h3 className="text-emerald-400 font-semibold mb-2">🏁 Game End</h3>
                <p className="text-slate-300 text-sm">
                  Game ends when any player goes bankrupt. Richest player wins!
                </p>
              </section>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-slate-900 border-t border-slate-700 px-6 py-4">
              <button
                onClick={() => setShowRules(false)}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 font-bold transition-all hover:from-amber-400 hover:to-orange-400"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

