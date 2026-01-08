'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  GameState,
  GamePhase,
  Player,
  PlayerArrangement,
  Card,
  RoundScore,
} from '@/lib/types';
import {
  createDeck,
  dealCards,
  calculateRoundScores,
  applyRoundScores,
  shouldGameEnd,
} from '@/lib/game-logic';
import { findBestArrangement, chooseCardToDiscard, getAIDelay } from '@/lib/ai';
import GameLobby from '@/components/GameLobby';
import GameTable from '@/components/GameTable';
import ScoreDisplay from '@/components/ScoreDisplay';

const AI_NAMES = ['Dragon', 'Phoenix', 'Tiger', 'Turtle', 'Serpent'];

export default function Home() {
  const [gameState, setGameState] = useState<GameState>({
    phase: 'lobby',
    players: [],
    deck: [],
    discardPile: [],
    startingPlayerIndex: 0,
    currentRound: 1,
    roundScores: null,
  });
  
  const [waitingForAI, setWaitingForAI] = useState(false);

  // Initialize a new game
  const initializeGame = useCallback((playerCount: number, playerName: string, startingCash: number) => {
    const players: Player[] = [];
    
    // Human player
    players.push({
      id: 'human',
      name: playerName,
      isHuman: true,
      cash: startingCash,
      hand: [],
      arrangement: null,
      isReady: false,
      isBankrupt: false,
    });
    
    // AI players
    for (let i = 0; i < playerCount - 1; i++) {
      players.push({
        id: `ai-${i}`,
        name: AI_NAMES[i],
        isHuman: false,
        cash: startingCash,
        hand: [],
        arrangement: null,
        isReady: false,
        isBankrupt: false,
      });
    }
    
    // Create and deal cards
    const deck = createDeck();
    const { hands, remainingDeck } = dealCards(deck, playerCount);
    
    // Assign hands to players
    const playersWithHands = players.map((player, idx) => ({
      ...player,
      hand: hands[idx],
    }));
    
    // Randomly select starting player
    const startingPlayerIndex = Math.floor(Math.random() * playerCount);
    
    setGameState({
      phase: playerCount === 6 ? 'discard' : 'arrangement',
      players: playersWithHands,
      deck: remainingDeck,
      discardPile: [],
      startingPlayerIndex,
      currentRound: 1,
      roundScores: null,
    });
  }, []);

  // Handle 6-player discard phase
  const handleDiscard = useCallback((cardToDiscard: Card) => {
    setGameState(prev => {
      const startingPlayer = prev.players[prev.startingPlayerIndex];
      
      const updatedPlayers = prev.players.map(player => {
        if (player.id === startingPlayer.id) {
          return {
            ...player,
            hand: player.hand.filter(c => c.id !== cardToDiscard.id),
          };
        }
        return player;
      });
      
      return {
        ...prev,
        phase: 'arrangement',
        players: updatedPlayers,
        discardPile: [...prev.discardPile, cardToDiscard],
      };
    });
  }, []);

  // Handle player arrangement confirmation
  const handleArrangementConfirm = useCallback((arrangement: PlayerArrangement) => {
    setGameState(prev => {
      const updatedPlayers = prev.players.map(player => {
        if (player.isHuman) {
          return {
            ...player,
            arrangement,
            isReady: true,
          };
        }
        return player;
      });
      
      return {
        ...prev,
        players: updatedPlayers,
      };
    });
  }, []);

  // AI players make their arrangements
  useEffect(() => {
    if (gameState.phase !== 'arrangement') return;
    
    const humanPlayer = gameState.players.find(p => p.isHuman);
    if (!humanPlayer?.isReady) return;
    
    const unreadyAI = gameState.players.filter(p => !p.isHuman && !p.isReady);
    if (unreadyAI.length === 0) return;
    
    setWaitingForAI(true);
    
    // Process AI players one by one with delays
    const processAI = async () => {
      for (const aiPlayer of unreadyAI) {
        await new Promise(resolve => setTimeout(resolve, getAIDelay()));
        
        const arrangement = findBestArrangement(aiPlayer.hand);
        
        setGameState(prev => ({
          ...prev,
          players: prev.players.map(p => 
            p.id === aiPlayer.id
              ? { ...p, arrangement, isReady: true }
              : p
          ),
        }));
      }
      
      setWaitingForAI(false);
    };
    
    processAI();
  }, [gameState.phase, gameState.players]);

  // Check if all players are ready and move to reveal
  useEffect(() => {
    if (gameState.phase !== 'arrangement') return;
    
    const allReady = gameState.players.every(p => p.isReady);
    if (!allReady) return;
    
    // Brief delay before reveal
    const timer = setTimeout(() => {
      setGameState(prev => ({
        ...prev,
        phase: 'reveal',
      }));
    }, 500);
    
    return () => clearTimeout(timer);
  }, [gameState.phase, gameState.players]);

  // Process scoring after reveal
  useEffect(() => {
    if (gameState.phase !== 'reveal') return;
    
    // Calculate scores after a brief reveal moment
    const timer = setTimeout(() => {
      const roundScores = calculateRoundScores(gameState.players);
      const updatedPlayers = applyRoundScores(gameState.players, roundScores);
      
      setGameState(prev => ({
        ...prev,
        phase: 'scoring',
        players: updatedPlayers,
        roundScores,
      }));
    }, 1500);
    
    return () => clearTimeout(timer);
  }, [gameState.phase, gameState.players]);

  // Handle continuing after scoring
  const handleScoreContinue = useCallback(() => {
    // Check if game should end
    if (shouldGameEnd(gameState.players)) {
      setGameState(prev => ({
        ...prev,
        phase: 'gameOver',
      }));
      return;
    }
    
    // Start next round
    const deck = createDeck();
    const playerCount = gameState.players.length;
    const { hands, remainingDeck } = dealCards(deck, playerCount);
    
    // Rotate starting player anti-clockwise
    const newStartingPlayerIndex = (gameState.startingPlayerIndex + playerCount - 1) % playerCount;
    
    // Reset players for new round
    const resetPlayers = gameState.players.map((player, idx) => ({
      ...player,
      hand: hands[idx],
      arrangement: null,
      isReady: false,
    }));
    
    setGameState(prev => ({
      ...prev,
      phase: playerCount === 6 ? 'discard' : 'arrangement',
      players: resetPlayers,
      deck: remainingDeck,
      discardPile: [],
      startingPlayerIndex: newStartingPlayerIndex,
      currentRound: prev.currentRound + 1,
      roundScores: null,
    }));
  }, [gameState.players, gameState.startingPlayerIndex]);

  // Handle game over -> return to lobby
  const handleGameOver = useCallback(() => {
    setGameState({
      phase: 'lobby',
      players: [],
      deck: [],
      discardPile: [],
      startingPlayerIndex: 0,
      currentRound: 1,
      roundScores: null,
    });
  }, []);

  // Render based on game phase
  if (gameState.phase === 'lobby') {
    return <GameLobby onStartGame={initializeGame} />;
  }

  if (gameState.phase === 'scoring' || gameState.phase === 'gameOver') {
    return (
      <ScoreDisplay
        players={gameState.players}
        roundScores={gameState.roundScores || []}
        onContinue={gameState.phase === 'gameOver' ? handleGameOver : handleScoreContinue}
        isGameOver={gameState.phase === 'gameOver'}
      />
    );
  }

  // Game table for dealing, discard, arrangement, reveal phases
  const humanPlayerIndex = gameState.players.findIndex(p => p.isHuman);
  
  return (
    <GameTable
      players={gameState.players}
      currentPlayerIndex={humanPlayerIndex}
      phase={gameState.phase}
      currentRound={gameState.currentRound}
      startingPlayerIndex={gameState.startingPlayerIndex}
      onArrangementConfirm={handleArrangementConfirm}
      waitingForAI={waitingForAI}
    />
  );
}
