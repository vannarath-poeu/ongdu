'use client';

import { useState, useEffect } from 'react';
import { Card as CardType, PlayerArrangement, Layer } from '@/lib/types';
import { createEmptyArrangement, isArrangementComplete, validateArrangement, evaluateHand, findBestArrangement } from '@/lib/game-logic';
import Card from './Card';

interface HandArrangementProps {
  hand: CardType[];
  onConfirm: (arrangement: PlayerArrangement) => void;
  onArrangementChange?: (arrangement: PlayerArrangement) => void;
}

type LayerName = 'top' | 'middle' | 'bottom';

export default function HandArrangement({ hand, onConfirm, onArrangementChange }: HandArrangementProps) {
  const [arrangement, setArrangement] = useState<PlayerArrangement>(createEmptyArrangement);
  const [unplacedCards, setUnplacedCards] = useState<CardType[]>(hand);
  const [selectedCard, setSelectedCard] = useState<CardType | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ layer: LayerName; index: number } | null>(null);

  useEffect(() => {
    setUnplacedCards(hand);
    setArrangement(createEmptyArrangement());
    setSelectedCard(null);
    setSelectedSlot(null);
  }, [hand]);

  useEffect(() => {
    onArrangementChange?.(arrangement);
  }, [arrangement, onArrangementChange]);

  const isComplete = isArrangementComplete(arrangement);
  const isValid = isComplete && validateArrangement(arrangement);

  const handleCardClick = (card: CardType) => {
    if (selectedSlot) {
      // Place card in selected slot
      placeCard(card, selectedSlot.layer, selectedSlot.index);
      setSelectedSlot(null);
      setSelectedCard(null);
    } else if (selectedCard?.id === card.id) {
      // Deselect
      setSelectedCard(null);
    } else {
      // Select card
      setSelectedCard(card);
    }
  };

  const handleSlotClick = (layer: LayerName, index: number) => {
    const currentCard = arrangement[layer].cards[index];

    if (selectedCard) {
      // Place selected card in this slot
      placeCard(selectedCard, layer, index);
      setSelectedCard(null);
    } else if (currentCard) {
      // Card in slot - either select it or swap if another slot is selected
      if (selectedSlot) {
        // Swap cards between slots
        swapSlots(selectedSlot, { layer, index });
        setSelectedSlot(null);
      } else {
        // Return card to hand
        returnCardToHand(layer, index);
      }
    } else if (selectedSlot) {
      // Move card from one empty slot to another (shouldn't happen)
      setSelectedSlot(null);
    } else {
      // Select empty slot
      setSelectedSlot({ layer, index });
    }
  };

  const placeCard = (card: CardType, layer: LayerName, index: number) => {
    const newArrangement = { ...arrangement };
    const existingCard = newArrangement[layer].cards[index];

    // If there's already a card in this slot, return it to hand
    if (existingCard) {
      setUnplacedCards(prev => [...prev, existingCard]);
    }

    // Place the new card
    newArrangement[layer] = {
      cards: [...newArrangement[layer].cards]
    };
    newArrangement[layer].cards[index] = card;

    // Remove from unplaced cards
    setUnplacedCards(prev => prev.filter(c => c.id !== card.id));
    setArrangement(newArrangement);
  };

  const returnCardToHand = (layer: LayerName, index: number) => {
    const card = arrangement[layer].cards[index];
    if (!card) return;

    const newArrangement = { ...arrangement };
    newArrangement[layer] = {
      cards: [...newArrangement[layer].cards]
    };
    newArrangement[layer].cards[index] = null;

    setUnplacedCards(prev => [...prev, card]);
    setArrangement(newArrangement);
  };

  const swapSlots = (
    slot1: { layer: LayerName; index: number },
    slot2: { layer: LayerName; index: number }
  ) => {
    const newArrangement = { ...arrangement };
    
    const card1 = arrangement[slot1.layer].cards[slot1.index];
    const card2 = arrangement[slot2.layer].cards[slot2.index];

    newArrangement[slot1.layer] = { cards: [...newArrangement[slot1.layer].cards] };
    newArrangement[slot2.layer] = { cards: [...newArrangement[slot2.layer].cards] };

    newArrangement[slot1.layer].cards[slot1.index] = card2;
    newArrangement[slot2.layer].cards[slot2.index] = card1;

    setArrangement(newArrangement);
  };

  const clearAll = () => {
    setUnplacedCards(hand);
    setArrangement(createEmptyArrangement());
    setSelectedCard(null);
    setSelectedSlot(null);
  };

  const autoBestHand = () => {
    const bestArrangement = findBestArrangement(hand);
    if (bestArrangement) {
      setArrangement(bestArrangement);
      setUnplacedCards([]);
      setSelectedCard(null);
      setSelectedSlot(null);
    }
  };

  const getLayerEvaluation = (layer: Layer) => {
    const cards = layer.cards.filter(c => c !== null) as CardType[];
    if (cards.length !== 3) return null;
    return evaluateHand(cards);
  };

  const renderLayer = (layer: LayerName, label: string, hint: string) => {
    const layerData = arrangement[layer];
    const evaluation = getLayerEvaluation(layerData);

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              {label}
            </span>
            <span className="text-xs text-slate-600">({hint})</span>
          </div>
          {evaluation && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
              layer === 'bottom' ? 'bg-emerald-900/50 text-emerald-400' :
              layer === 'middle' ? 'bg-blue-900/50 text-blue-400' :
              'bg-slate-700/50 text-slate-400'
            }`}>
              {evaluation.description}
            </span>
          )}
        </div>
        <div className="flex gap-2 justify-center">
          {layerData.cards.map((card, idx) => (
            <Card
              key={`${layer}-${idx}`}
              card={card}
              onClick={() => handleSlotClick(layer, idx)}
              isSelected={selectedSlot?.layer === layer && selectedSlot?.index === idx}
              size="lg"
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Arrangement Area */}
      <div className="bg-slate-800/30 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50 space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-200">Your Arrangement</h3>
          <div className="flex items-center gap-3">
            <button
              onClick={autoBestHand}
              className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 border border-amber-500/30 hover:from-amber-500/30 hover:to-orange-500/30 hover:border-amber-400/50 transition-all duration-200 flex items-center gap-1.5"
              title="Auto-arrange cards into the best possible hand"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
              </svg>
              Best Hand
            </button>
            <button
              onClick={clearAll}
              className="text-xs text-slate-400 hover:text-slate-300 transition-colors"
            >
              Clear All
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {renderLayer('top', 'Top Layer', 'weakest')}
          {renderLayer('middle', 'Middle Layer', 'medium')}
          {renderLayer('bottom', 'Bottom Layer', 'strongest')}
        </div>

        {/* Validation Warning */}
        {isComplete && !isValid && (
          <div className="bg-rose-900/30 border border-rose-700/50 rounded-lg p-3 text-rose-300 text-sm">
            ⚠️ Invalid arrangement! Top layer cannot be stronger than middle, and middle cannot be stronger than bottom.
          </div>
        )}
      </div>

      {/* Unplaced Cards */}
      <div className="bg-slate-800/30 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
        <h3 className="text-sm font-medium text-slate-400 mb-4 uppercase tracking-wider">
          Your Cards ({unplacedCards.length} remaining)
        </h3>
        <div className="flex flex-wrap gap-2 justify-center min-h-[120px]">
          {unplacedCards.length === 0 ? (
            <p className="text-slate-500 text-sm self-center">All cards placed!</p>
          ) : (
            unplacedCards.map((card) => (
              <Card
                key={card.id}
                card={card}
                onClick={() => handleCardClick(card)}
                isSelected={selectedCard?.id === card.id}
                size="lg"
              />
            ))
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="text-center text-sm text-slate-500 space-y-1">
        <p>Click a card, then click a slot to place it</p>
        <p>Click a placed card to return it to your hand</p>
      </div>

      {/* Confirm Button */}
      <button
        onClick={() => onConfirm(arrangement)}
        disabled={!isValid}
        className={`
          w-full py-4 rounded-xl font-bold text-lg
          transition-all duration-200
          ${isValid
            ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 hover:from-emerald-400 hover:to-teal-400 hover:-translate-y-0.5'
            : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }
        `}
      >
        {!isComplete ? 'Place All Cards to Continue' : !isValid ? 'Fix Invalid Arrangement' : 'Ready!'}
      </button>
    </div>
  );
}

