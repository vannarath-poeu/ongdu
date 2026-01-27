'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  GameState,
  GamePhase,
  Player,
  PlayerArrangement,
  Card,
  RoundScore,
  AIDifficulty,
} from '@/lib/types';
import {
  createDeck,
  dealCards,
  calculateRoundScores,
  applyRoundScores,
  shouldGameEnd,
} from '@/lib/game-logic';
import { getAIDelay, AIContext } from '@/lib/ai';
import { useAIWorker } from '@/lib/use-ai-worker';
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
    aiDifficulty: 'easy',
  });

  // Track starting cash for risk calculations (Hard mode)
  const [startingCash, setStartingCash] = useState(1000);
  const [waitingForAI, setWaitingForAI] = useState(false);

  // AI Worker for off-main-thread calculations
  const { getArrangement, getDiscard } = useAIWorker();

  // Initialize a new game
  const initializeGame = useCallback((playerCount: number, playerName: string, cash: number, aiDifficulty: AIDifficulty) => {
    const players: Player[] = [];

    // Store starting cash for risk calculations
    setStartingCash(cash);

    // Human player
    players.push({
      id: 'human',
      name: playerName,
      isHuman: true,
      cash: cash,
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
        cash: cash,
        hand: [],
        arrangement: null,
        isReady: false,
        isBankrupt: false,
      });
    }

    // Randomly select starting player BEFORE dealing (affects who gets 10 cards in 6-player)
    const startingPlayerIndex = Math.floor(Math.random() * playerCount);

    // Create and deal cards (starting player gets 10 cards in 6-player game)
    const deck = createDeck();
    const { hands, remainingDeck } = dealCards(deck, playerCount, startingPlayerIndex);

    // Assign hands to players
    const playersWithHands = players.map((player, idx) => ({
      ...player,
      hand: hands[idx],
    }));

    setGameState({
      phase: playerCount === 6 ? 'discard' : 'arrangement',
      players: playersWithHands,
      deck: remainingDeck,
      discardPile: [],
      startingPlayerIndex,
      currentRound: 1,
      roundScores: null,
      aiDifficulty,
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

  // Helper to create AI context for difficulty-aware decisions
  const createAIContext = useCallback((aiPlayer: Player): AIContext => {
    const opponentCashes = gameState.players
      .filter(p => p.id !== aiPlayer.id)
      .map(p => p.cash);

    return {
      difficulty: gameState.aiDifficulty,
      myCash: aiPlayer.cash,
      opponentCashes,
      startingCash,
      numOpponents: gameState.players.length - 1,
    };
  }, [gameState.players, gameState.aiDifficulty, startingCash]);

  // Handle AI discard in 6-player game when starting player is AI
  useEffect(() => {
    if (gameState.phase !== 'discard') return;

    const startingPlayer = gameState.players[gameState.startingPlayerIndex];
    if (!startingPlayer || startingPlayer.isHuman) return;

    let cancelled = false;

    // AI needs to discard (using Web Worker)
    const processDiscard = async () => {
      await new Promise(resolve => setTimeout(resolve, getAIDelay()));
      if (cancelled) return;

      const context = createAIContext(startingPlayer);
      try {
        const cardToDiscard = await getDiscard(startingPlayer.hand, context);
        if (!cancelled && cardToDiscard) {
          handleDiscard(cardToDiscard);
        }
      } catch (error) {
        console.error('AI discard error:', error);
      }
    };

    processDiscard();

    return () => {
      cancelled = true;
    };
  }, [gameState.phase, gameState.players, gameState.startingPlayerIndex, handleDiscard, createAIContext, getDiscard]);

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

    let cancelled = false;
    setWaitingForAI(true);

    // Calculate ALL AI arrangements in parallel, then show with staggered delays
    const processAI = async () => {
      // Start all calculations in parallel
      const calculationPromises = unreadyAI.map(async (aiPlayer) => {
        const context = createAIContext(aiPlayer);
        try {
          const arrangement = await getArrangement(aiPlayer.hand, context);
          return { aiPlayer, arrangement };
        } catch (error) {
          console.error('AI arrangement error:', error);
          return { aiPlayer, arrangement: null };
        }
      });

      // Wait for all calculations to complete
      const results = await Promise.all(calculationPromises);
      if (cancelled) return;

      // Show results with short staggered delays for visual effect
      for (let i = 0; i < results.length; i++) {
        if (cancelled) break;

        const { aiPlayer, arrangement } = results[i];
        if (arrangement) {
          // Short staggered delay (150-300ms per player)
          await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 150));
          if (cancelled) break;

          setGameState(prev => ({
            ...prev,
            players: prev.players.map(p =>
              p.id === aiPlayer.id
                ? { ...p, arrangement, isReady: true }
                : p
            ),
          }));
        }
      }

      if (!cancelled) {
        setWaitingForAI(false);
      }
    };

    processAI();

    return () => {
      cancelled = true;
    };
  }, [gameState.phase, gameState.players, createAIContext, getArrangement]);

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
    const playerCount = gameState.players.length;
    
    // Rotate starting player anti-clockwise BEFORE dealing (affects who gets 10 cards)
    const newStartingPlayerIndex = (gameState.startingPlayerIndex + playerCount - 1) % playerCount;
    
    const deck = createDeck();
    const { hands, remainingDeck } = dealCards(deck, playerCount, newStartingPlayerIndex);
    
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
      aiDifficulty: 'easy',
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
        currentRound={gameState.currentRound}
        aiDifficulty={gameState.aiDifficulty}
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
      onDiscard={handleDiscard}
      onQuit={handleGameOver}
      waitingForAI={waitingForAI}
    />
  );
}
