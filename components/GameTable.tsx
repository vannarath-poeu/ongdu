'use client';

import { useState } from 'react';
import { Player, GamePhase, PlayerArrangement, Card as CardType } from '@/lib/types';
import { evaluateHand } from '@/lib/game-logic';
import Card from './Card';
import HandArrangement from './HandArrangement';

interface GameTableProps {
  players: Player[];
  currentPlayerIndex: number;
  phase: GamePhase;
  currentRound: number;
  startingPlayerIndex: number;
  onArrangementConfirm: (arrangement: PlayerArrangement) => void;
  onDiscard?: (card: CardType) => void;
  onQuit: () => void;
  waitingForAI: boolean;
}

export default function GameTable({
  players,
  currentPlayerIndex,
  phase,
  currentRound,
  startingPlayerIndex,
  onArrangementConfirm,
  onDiscard,
  onQuit,
  waitingForAI,
}: GameTableProps) {
  const [selectedDiscardCard, setSelectedDiscardCard] = useState<CardType | null>(null);
  const [showQuitDialog, setShowQuitDialog] = useState(false);
  const humanPlayer = players.find(p => p.isHuman);
  const aiPlayers = players.filter(p => !p.isHuman);
  const startingPlayer = players[startingPlayerIndex];
  const isHumanStartingPlayer = startingPlayer?.isHuman;

  const renderOpponentCard = (player: Player, index: number) => {
    const isReady = player.isReady;
    const totalPlayers = players.length;
    
    // Position opponent cards in a semicircle at the top
    const positions = getOpponentPositions(aiPlayers.length);
    const position = positions[index];

    return (
      <div
        key={player.id}
        className="flex flex-col items-center gap-2"
        style={{
          position: 'absolute',
          left: `${position.x}%`,
          top: `${position.y}%`,
          transform: 'translate(-50%, -50%)',
        }}
      >
        {/* Player Info */}
        <div className={`
          px-3 py-1.5 rounded-lg 
          ${isReady ? 'bg-emerald-900/50 border-emerald-600/50' : 'bg-slate-800/50 border-slate-600/50'}
          border backdrop-blur-sm
          flex items-center gap-2
        `}>
          <div className={`w-2 h-2 rounded-full ${isReady ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
          <span className="text-sm font-medium text-slate-200">{player.name}</span>
          <span className="text-xs text-emerald-400 font-mono">${player.cash}</span>
          {startingPlayerIndex === players.indexOf(player) && (
            <span className="text-amber-400 text-xs">⭐</span>
          )}
        </div>

        {/* Cards or Ready State */}
        {phase === 'reveal' || phase === 'scoring' ? (
          // Show revealed cards
          player.arrangement && (
            <div className="flex flex-col gap-1 scale-75 origin-top">
              {(['top', 'middle', 'bottom'] as const).map((layer) => (
                <div key={layer} className="flex gap-0.5">
                  {player.arrangement![layer].cards.map((card, idx) => (
                    <Card key={`${layer}-${idx}`} card={card} size="sm" />
                  ))}
                </div>
              ))}
            </div>
          )
        ) : (
          // Show face-down cards
          <div className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <Card key={i} card={null} faceDown size="sm" />
            ))}
          </div>
        )}
      </div>
    );
  };

  // During arrangement/discard phase, use compact layout
  const isArrangementPhase = phase === 'arrangement' || phase === 'discard';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
        
        {/* Table felt pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.05)_0%,_transparent_70%)]" />
      </div>

      {/* Quit Confirmation Dialog */}
      {showQuitDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowQuitDialog(false)}
          />
          
          {/* Dialog */}
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm mx-4 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-100 mb-2">Quit Game?</h3>
            <p className="text-slate-400 mb-6">
              Are you sure you want to quit? Your current game progress will be lost.
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowQuitDialog(false)}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium
                  bg-slate-700 text-slate-300 
                  hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowQuitDialog(false);
                  onQuit();
                }}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium
                  bg-gradient-to-r from-rose-500 to-red-500 text-white
                  hover:from-rose-400 hover:to-red-400 transition-colors"
              >
                Quit Game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compact Header */}
      <div className="relative z-10 flex items-center justify-between px-4 py-2 border-b border-slate-800/50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowQuitDialog(true)}
            className="text-lg font-bold bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent hover:from-amber-300 hover:to-orange-300 transition-all"
          >
            ONGDU
          </button>
          <span className="px-2 py-0.5 rounded bg-slate-800/50 text-slate-400 text-xs">
            R{currentRound}
          </span>
          <span className="text-emerald-400 text-xs font-medium capitalize">
            {phase === 'arrangement' ? 'Arrange' : phase}
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Compact opponents display during arrangement */}
          {isArrangementPhase && (
            <div className="flex items-center gap-2">
              {aiPlayers.map((player) => (
                <div
                  key={player.id}
                  className={`
                    flex items-center gap-1.5 px-2 py-1 rounded-full text-xs
                    ${player.isReady 
                      ? 'bg-emerald-900/40 border border-emerald-600/40' 
                      : 'bg-slate-800/50 border border-slate-700/40'
                    }
                  `}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${player.isReady ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  <span className="text-slate-300">{player.name}</span>
                  {startingPlayerIndex === players.indexOf(player) && (
                    <span className="text-amber-400">⭐</span>
                  )}
                </div>
              ))}
            </div>
          )}
          
          {/* Player cash */}
          {humanPlayer && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-800/50 border border-slate-700/40">
              <span className="text-emerald-400 font-mono text-sm font-bold">${humanPlayer.cash}</span>
            </div>
          )}
        </div>
      </div>

      {/* Game Table Area */}
      <div className="relative z-10 h-[calc(100vh-48px)] flex flex-col">
        {/* Opponents Area - only show expanded during reveal/scoring */}
        {!isArrangementPhase && (
          <div className="relative h-1/3 min-h-[180px]">
            {aiPlayers.map((player, idx) => renderOpponentCard(player, idx))}
          </div>
        )}

        {/* Center Area - shows current phase info */}
        {waitingForAI && (
          <div className="flex-shrink-0 flex items-center justify-center py-2">
            <div className="bg-slate-800/70 backdrop-blur-sm px-4 py-2 rounded-full border border-slate-700/50">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-slate-300 text-sm">AI arranging cards...</span>
              </div>
            </div>
          </div>
        )}

        {/* Human Player Area */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {humanPlayer && (
            <div className="max-w-2xl mx-auto">

              {/* Discard phase - 6 player only, starting player discards 1 card */}
              {phase === 'discard' && isHumanStartingPlayer && (
                <div className="bg-slate-800/40 rounded-xl p-6 border border-slate-700/30">
                  <h3 className="text-lg font-bold text-amber-400 mb-2">Discard Phase</h3>
                  <p className="text-slate-400 mb-4">
                    As the starting player, you must discard 1 card from your hand of 10.
                  </p>
                  
                  {/* Show all 10 cards */}
                  <div className="flex flex-wrap gap-2 justify-center mb-4">
                    {humanPlayer.hand.map((card) => (
                      <div
                        key={card.id}
                        onClick={() => setSelectedDiscardCard(card)}
                        className={`cursor-pointer transition-all duration-150 ${
                          selectedDiscardCard?.id === card.id 
                            ? 'ring-2 ring-rose-500 ring-offset-2 ring-offset-slate-900 scale-105' 
                            : 'hover:scale-105'
                        }`}
                      >
                        <Card card={card} size="md" />
                      </div>
                    ))}
                  </div>
                  
                  {/* Confirm discard button */}
                  <button
                    onClick={() => {
                      if (selectedDiscardCard && onDiscard) {
                        onDiscard(selectedDiscardCard);
                        setSelectedDiscardCard(null);
                      }
                    }}
                    disabled={!selectedDiscardCard}
                    className={`
                      w-full py-3 rounded-lg font-bold transition-all
                      ${selectedDiscardCard
                        ? 'bg-gradient-to-r from-rose-500 to-red-500 text-white hover:from-rose-400 hover:to-red-400'
                        : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                      }
                    `}
                  >
                    {selectedDiscardCard 
                      ? `Discard ${selectedDiscardCard.isWild ? 'Wild' : `${selectedDiscardCard.rank} of ${selectedDiscardCard.suit}`}`
                      : 'Select a card to discard'
                    }
                  </button>
                </div>
              )}
              
              {/* Waiting for AI to discard (6-player, AI is starting player) */}
              {phase === 'discard' && !isHumanStartingPlayer && (
                <div className="bg-slate-800/40 rounded-xl p-8 border border-slate-700/30 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                  <h3 className="text-xl font-bold text-amber-400 mb-2">Discard Phase</h3>
                  <p className="text-slate-400">{startingPlayer?.name} is discarding a card...</p>
                </div>
              )}

              {/* Card arrangement interface */}
              {phase === 'arrangement' && !humanPlayer.isReady && (
                <HandArrangement
                  hand={humanPlayer.hand}
                  onConfirm={onArrangementConfirm}
                />
              )}

              {/* Waiting state */}
              {phase === 'arrangement' && humanPlayer.isReady && (
                <div className="bg-slate-800/40 rounded-xl p-8 border border-slate-700/30 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <span className="text-3xl">✓</span>
                  </div>
                  <h3 className="text-xl font-bold text-emerald-400 mb-2">Ready!</h3>
                  <p className="text-slate-400">Waiting for other players to finish...</p>
                </div>
              )}

              {/* Reveal phase - show your cards */}
              {(phase === 'reveal' || phase === 'scoring') && humanPlayer.arrangement && (
                <div className="bg-slate-800/40 rounded-xl p-6 border border-slate-700/30">
                  <h3 className="text-lg font-bold text-slate-200 mb-4">Your Arrangement</h3>
                  <div className="space-y-3">
                    {(['top', 'middle', 'bottom'] as const).map((layer) => {
                      const cards = humanPlayer.arrangement![layer].cards.filter(c => c !== null);
                      const evaluation = cards.length === 3 ? evaluateHand(cards as any) : null;

                      return (
                        <div key={layer} className="flex items-center gap-4">
                          <span className="text-xs text-slate-500 w-12 uppercase">{layer}</span>
                          <div className="flex gap-2">
                            {humanPlayer.arrangement![layer].cards.map((card, idx) => (
                              <Card key={`${layer}-${idx}`} card={card} size="md" />
                            ))}
                          </div>
                          {evaluation && (
                            <span className="text-sm text-slate-400">{evaluation.description}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper to position opponents in semicircle
function getOpponentPositions(count: number): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];
  
  if (count === 1) {
    return [{ x: 50, y: 40 }];
  }
  
  if (count === 2) {
    return [
      { x: 30, y: 40 },
      { x: 70, y: 40 },
    ];
  }
  
  if (count === 3) {
    return [
      { x: 20, y: 45 },
      { x: 50, y: 35 },
      { x: 80, y: 45 },
    ];
  }
  
  if (count === 4) {
    return [
      { x: 15, y: 50 },
      { x: 38, y: 35 },
      { x: 62, y: 35 },
      { x: 85, y: 50 },
    ];
  }
  
  // 5 opponents
  return [
    { x: 10, y: 55 },
    { x: 30, y: 38 },
    { x: 50, y: 30 },
    { x: 70, y: 38 },
    { x: 90, y: 55 },
  ];
}

