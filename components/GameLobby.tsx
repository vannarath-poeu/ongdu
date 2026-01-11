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

        {/* Rules hint */}
        <p className="text-center text-xs text-slate-500">
          Arrange 9 cards into 3 layers • Bottom must be strongest • Top must be weakest
        </p>
      </div>
    </div>
  );
}

