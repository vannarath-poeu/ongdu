'use client';

import { Player, RoundScore, PlayerArrangement } from '@/lib/types';
import { evaluateHand, checkAutoWin, validateArrangement } from '@/lib/game-logic';
import Card from './Card';

interface ScoreDisplayProps {
  players: Player[];
  roundScores: RoundScore[];
  onContinue: () => void;
  isGameOver: boolean;
}

export default function ScoreDisplay({ players, roundScores, onContinue, isGameOver }: ScoreDisplayProps) {
  // Sort players by score change (winners first)
  const sortedScores = [...roundScores].sort((a, b) => b.cashChange - a.cashChange);

  // Check if a player has automatic win or foul
  const getPlayerStatus = (player: Player): { isAutoWin: boolean; isFoul: boolean } => {
    if (!player.arrangement) return { isAutoWin: false, isFoul: true };
    const isFoul = !validateArrangement(player.arrangement);
    const isAutoWin = !isFoul && checkAutoWin(player);
    return { isAutoWin, isFoul };
  };

  const renderArrangement = (arrangement: PlayerArrangement | null, playerName: string) => {
    if (!arrangement) return null;

    const layers: Array<{ key: 'top' | 'middle' | 'bottom'; label: string }> = [
      { key: 'top', label: 'Top' },
      { key: 'middle', label: 'Mid' },
      { key: 'bottom', label: 'Bot' },
    ];

    return (
      <div className="space-y-2">
        {layers.map(({ key, label }) => {
          const cards = arrangement[key].cards.filter(c => c !== null);
          const evaluation = cards.length === 3 ? evaluateHand(cards as any) : null;

          return (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-8">{label}</span>
              <div className="flex gap-1">
                {arrangement[key].cards.map((card, idx) => (
                  <Card
                    key={`${key}-${idx}`}
                    card={card}
                    size="sm"
                  />
                ))}
              </div>
              {evaluation && (
                <span className="text-xs text-slate-400 ml-2">
                  {evaluation.description}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
      {/* Ambient effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto py-8 space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
            {isGameOver ? 'Game Over!' : 'Round Complete'}
          </h2>
          <p className="text-slate-400">
            {isGameOver ? 'Final standings' : 'Results from this round'}
          </p>
        </div>

        {/* Score Cards */}
        <div className="space-y-4">
          {sortedScores.map((score, idx) => {
            const player = players.find(p => p.id === score.playerId);
            if (!player) return null;

            const isWinner = idx === 0 && score.cashChange > 0;
            const isLoser = score.cashChange < 0;
            const { isAutoWin, isFoul } = getPlayerStatus(player);

            return (
              <div
                key={score.playerId}
                className={`
                  rounded-xl p-5 border transition-all
                  ${isAutoWin
                    ? 'bg-gradient-to-r from-emerald-900/40 to-teal-900/30 border-emerald-500/50 ring-2 ring-emerald-500/30'
                    : isWinner 
                      ? 'bg-gradient-to-r from-amber-900/30 to-yellow-900/20 border-amber-600/30' 
                      : isFoul
                        ? 'bg-gradient-to-r from-rose-900/30 to-red-900/20 border-rose-600/30'
                        : 'bg-slate-800/40 border-slate-700/30'
                  }
                `}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Player Info */}
                  <div className="flex items-center gap-4">
                    <div className={`
                      w-12 h-12 rounded-full flex items-center justify-center text-2xl
                      ${isAutoWin
                        ? 'bg-emerald-500/30 text-emerald-300'
                        : isWinner 
                          ? 'bg-amber-500/20 text-amber-400' 
                          : isFoul
                            ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-slate-700/50 text-slate-400'
                      }
                    `}>
                      {isAutoWin ? '🏆' : isWinner ? '👑' : isFoul ? '❌' : player.isHuman ? '👤' : '🤖'}
                    </div>
                    <div>
                      <h3 className={`font-bold text-lg ${player.isHuman ? 'text-amber-400' : 'text-slate-200'}`}>
                        {player.name}
                        {player.isHuman && <span className="text-xs text-slate-500 ml-2">(You)</span>}
                      </h3>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-slate-400">
                          Cash: <span className="text-emerald-400 font-mono">${player.cash.toLocaleString()}</span>
                        </span>
                        {isAutoWin && (
                          <span className="text-emerald-400 font-bold animate-pulse">✨ ALL NINES - AUTO WIN!</span>
                        )}
                        {isFoul && (
                          <span className="text-rose-400 font-medium">FOUL</span>
                        )}
                        {player.isBankrupt && (
                          <span className="text-rose-400 font-medium">BANKRUPT</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Score Change */}
                  <div className="text-right">
                    <div className={`
                      text-2xl font-bold font-mono
                      ${score.cashChange > 0 
                        ? 'text-emerald-400' 
                        : score.cashChange < 0 
                          ? 'text-rose-400' 
                          : 'text-slate-400'
                      }
                    `}>
                      {score.cashChange > 0 ? '+' : ''}{score.cashChange}
                    </div>
                    <div className="text-xs text-slate-500">
                      {score.totalPoints > 0 ? '+' : ''}{score.totalPoints} pts
                    </div>
                  </div>
                </div>

                {/* Cards */}
                <div className="mt-4 pt-4 border-t border-slate-700/30">
                  {renderArrangement(player.arrangement, player.name)}
                </div>

                {/* Matchups breakdown */}
                <div className="mt-3 pt-3 border-t border-slate-700/30">
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(score.pointsAgainst).map(([opponentId, points]) => {
                      const opponent = players.find(p => p.id === opponentId);
                      if (!opponent) return null;
                      
                      return (
                        <div
                          key={opponentId}
                          className={`
                            text-xs px-2 py-1 rounded-full
                            ${points > 0 
                              ? 'bg-emerald-900/30 text-emerald-400' 
                              : points < 0 
                                ? 'bg-rose-900/30 text-rose-400' 
                                : 'bg-slate-700/30 text-slate-400'
                            }
                          `}
                        >
                          vs {opponent.name}: {points > 0 ? '+' : ''}{points}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Continue Button */}
        <button
          onClick={onContinue}
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
        >
          {isGameOver ? 'Return to Lobby' : 'Next Round'}
        </button>
      </div>
    </div>
  );
}

