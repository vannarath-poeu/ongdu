'use client';

import { Player, GamePhase, PlayerArrangement } from '@/lib/types';
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
  waitingForAI: boolean;
}

export default function GameTable({
  players,
  currentPlayerIndex,
  phase,
  currentRound,
  startingPlayerIndex,
  onArrangementConfirm,
  waitingForAI,
}: GameTableProps) {
  const humanPlayer = players.find(p => p.isHuman);
  const aiPlayers = players.filter(p => !p.isHuman);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
        
        {/* Table felt pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.05)_0%,_transparent_70%)]" />
      </div>

      {/* Game Header */}
      <div className="relative z-10 flex items-center justify-between p-4 border-b border-slate-800/50">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
            ONGDU
          </h1>
          <span className="px-2 py-1 rounded bg-slate-800/50 text-slate-400 text-sm">
            Round {currentRound}
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Phase indicator */}
          <div className="px-3 py-1.5 rounded-full bg-slate-800/50 text-sm">
            <span className="text-slate-400">Phase: </span>
            <span className="text-emerald-400 font-medium capitalize">
              {phase === 'arrangement' ? 'Arrange Cards' : phase}
            </span>
          </div>
          
          {/* Player count */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/50">
            <span className="text-slate-400 text-sm">{players.filter(p => p.isReady).length}/{players.length}</span>
            <span className="text-emerald-400 text-sm">ready</span>
          </div>
        </div>
      </div>

      {/* Game Table Area */}
      <div className="relative z-10 h-[calc(100vh-64px)] flex flex-col">
        {/* Opponents Area (top half) */}
        <div className="relative h-1/3 min-h-[180px]">
          {aiPlayers.map((player, idx) => renderOpponentCard(player, idx))}
        </div>

        {/* Center Area - shows current phase info */}
        <div className="flex-shrink-0 flex items-center justify-center py-4">
          {waitingForAI && (
            <div className="bg-slate-800/70 backdrop-blur-sm px-6 py-3 rounded-full border border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-slate-300">AI players are arranging their cards...</span>
              </div>
            </div>
          )}
        </div>

        {/* Human Player Area (bottom) */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {humanPlayer && (
            <div className="max-w-2xl mx-auto">
              {/* Human player info bar */}
              <div className="flex items-center justify-between mb-4 p-3 bg-slate-800/40 rounded-lg border border-slate-700/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white font-bold">
                    {humanPlayer.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-200">{humanPlayer.name}</h3>
                    <p className="text-xs text-slate-500">Your Hand</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-emerald-400 font-mono">
                    ${humanPlayer.cash.toLocaleString()}
                  </div>
                  <p className="text-xs text-slate-500">Cash</p>
                </div>
              </div>

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

