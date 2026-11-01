'use client';

import LanguageSwitch from '@/components/LanguageSwitch';
import { useLocale } from '@/lib/i18n/context';

import { useState } from 'react';
import { Player, RoundScore, PlayerArrangement, AIDifficulty } from '@/lib/types';
import { evaluateHand, checkBonuses, validateArrangement } from '@/lib/game-logic';
import Card from './Card';
import FeedbackModal from './FeedbackModal';

interface ScoreDisplayProps {
  players: Player[];
  roundScores: RoundScore[];
  onContinue: () => void;
  isGameOver: boolean;
  currentRound: number;
  aiDifficulty: AIDifficulty;
}

export default function ScoreDisplay({ players, roundScores, onContinue, isGameOver, currentRound, aiDifficulty }: ScoreDisplayProps) {
  const { t, handLabel, playerLabel, number } = useLocale();
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const humanPlayer = players.find(p => p.isHuman);

  // Sort players by score change (winners first)
  const sortedScores = [...roundScores].sort((a, b) => b.cashChange - a.cashChange);

  // Check if a player has special hand or foul
  const getPlayerStatus = (player: Player): { isSpecialHand: boolean; specialHandType: string | null; isFoul: boolean } => {
    if (!player.arrangement) return { isSpecialHand: false, specialHandType: null, isFoul: true };
    const isFoul = !validateArrangement(player.arrangement);
    if (isFoul) return { isSpecialHand: false, specialHandType: null, isFoul: true };
    
    const { specialHandId } = checkBonuses(player);
    
    if (specialHandId === 'all-nines') {
      return { isSpecialHand: true, specialHandType: t("All Nines"), isFoul: false };
    }
    if (specialHandId === 'four-of-a-kind') {
      return { isSpecialHand: true, specialHandType: t("Four of a Kind"), isFoul: false };
    }
    
    return { isSpecialHand: false, specialHandType: null, isFoul: false };
  };

  const renderArrangement = (arrangement: PlayerArrangement | null) => {
    if (!arrangement) return null;

    const layers: Array<{ key: 'top' | 'middle' | 'bottom'; label: string }> = [
      { key: 'top', label: t("Top") },
      { key: 'middle', label: t("Mid") },
      { key: 'bottom', label: t("Bot") },
    ];

    return (
      <div className="space-y-2">
        {layers.map(({ key, label }) => {
          const cards = arrangement[key].cards.filter(c => c !== null);
          const evaluation = cards.length === 3 ? evaluateHand(cards) : null;

          return (
            <div key={key} className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 min-w-12">{label}</span>
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
                  {handLabel(evaluation, cards)}
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
        <div className="flex justify-end"><LanguageSwitch /></div>
        {/* Header */}
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
            {isGameOver ? t("Game Over!") : t("Round Complete")}
          </h2>
          <p className="text-slate-400">
            {isGameOver ? t("Final standings") : t("Results from this round")}
          </p>
        </div>

        {/* Score Cards */}
        <div className="space-y-4">
          {sortedScores.map((score, idx) => {
            const player = players.find(p => p.id === score.playerId);
            if (!player) return null;

            const isWinner = idx === 0 && score.cashChange > 0;
            const { isSpecialHand, specialHandType, isFoul } = getPlayerStatus(player);

            return (
              <div
                key={score.playerId}
                className={`
                  rounded-xl p-5 border transition-all
                  ${isSpecialHand
                    ? 'bg-gradient-to-r from-emerald-900/40 to-teal-900/30 border-emerald-500/50 ring-2 ring-emerald-500/30'
                    : isWinner 
                      ? 'bg-gradient-to-r from-amber-900/30 to-yellow-900/20 border-amber-600/30' 
                      : isFoul
                        ? 'bg-gradient-to-r from-rose-900/30 to-red-900/20 border-rose-600/30'
                        : 'bg-slate-800/40 border-slate-700/30'
                  }
                `}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  {/* Player Info */}
                  <div className="flex items-center gap-4">
                    <div className={`
                      w-12 h-12 rounded-full flex items-center justify-center text-2xl
                      ${isSpecialHand
                        ? 'bg-emerald-500/30 text-emerald-300'
                        : isWinner 
                          ? 'bg-amber-500/20 text-amber-400' 
                          : isFoul
                            ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-slate-700/50 text-slate-400'
                      }
                    `}>
                      {isSpecialHand ? '🏆' : isWinner ? '👑' : isFoul ? '❌' : player.isHuman ? '👤' : '🤖'}
                    </div>
                    <div>
                      <h3 className={`font-bold text-lg ${player.isHuman ? 'text-amber-400' : 'text-slate-200'}`}>
                        {playerLabel(player)}
                        {player.isHuman && <span className="text-xs text-slate-500 ml-2">{t("(You)")}</span>}
                      </h3>
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="text-slate-400">{t("Cash:")}<span className="text-emerald-400 font-mono">${number(player.cash)}</span>
                        </span>
                        {isSpecialHand && (
                          <span className="text-emerald-400 font-bold animate-pulse">✨ {specialHandType}{' '}{t("- SPECIAL HAND!")}</span>
                        )}
                        {isFoul && (
                          <span className="text-rose-400 font-medium">{t("FOUL")}</span>
                        )}
                        {player.isBankrupt && (
                          <span className="text-rose-400 font-medium">{t("BANKRUPT")}</span>
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
                      {score.totalPoints > 0 ? '+' : ''}{score.totalPoints} {t("pts")}</div>
                  </div>
                </div>

                {/* Cards */}
                <div className="mt-4 pt-4 border-t border-slate-700/30">
                  {renderArrangement(player.arrangement)}
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
                        >{t("vs")} {playerLabel(opponent)}: {points > 0 ? '+' : ''}{points}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Flag My Hand Button */}
        {humanPlayer && !isGameOver && (
          <button
            onClick={() => setShowFeedbackModal(true)}
            className="
              w-full py-3 rounded-xl mb-3
              bg-slate-800 border border-amber-500/30
              text-amber-400 font-medium
              transition-all duration-200
              hover:bg-slate-700 hover:border-amber-400/50
            "
          >{t("Flag My Hand (Report AI Issue)")}</button>
        )}

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
          {isGameOver ? t("Return to Lobby") : t("Next Round")}
        </button>
      </div>

      {/* Feedback Modal */}
      {humanPlayer && (
        <FeedbackModal
          isOpen={showFeedbackModal}
          onClose={() => setShowFeedbackModal(false)}
          humanPlayer={humanPlayer}
          allPlayers={players}
          roundScores={roundScores}
          roundNumber={currentRound}
          aiDifficulty={aiDifficulty}
        />
      )}
    </div>
  );
}

