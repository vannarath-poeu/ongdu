'use client';

import { errorMessages, type UIErrorCode } from '@/lib/i18n/errors';
import { useLocale } from '@/lib/i18n/context';

import { useState, useEffect } from 'react';
import { Card as CardType, PlayerArrangement, Player, RoundScore, AIDifficulty } from '@/lib/types';
import { createEmptyArrangement, validateArrangement, evaluateHand } from '@/lib/game-logic';
import { useAIWorker } from '@/lib/use-ai-worker';
import { submitFeedback, AIFeedback } from '@/lib/feedback';
import Card from './Card';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  humanPlayer: Player;
  allPlayers: Player[];
  roundScores: RoundScore[];
  roundNumber: number;
  aiDifficulty: AIDifficulty;
}

type LayerName = 'top' | 'middle' | 'bottom';

export default function FeedbackModal({
  isOpen,
  onClose,
  humanPlayer,
  allPlayers,
  roundScores,
  roundNumber,
  aiDifficulty,
}: FeedbackModalProps) {
  const { t, handLabel, message } = useLocale();
  const [aiSuggestion, setAiSuggestion] = useState<PlayerArrangement | null>(null);
  const [userCorrection, setUserCorrection] = useState<PlayerArrangement>(createEmptyArrangement());
  const [unplacedCards, setUnplacedCards] = useState<CardType[]>([]);
  const [selectedCard, setSelectedCard] = useState<CardType | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<UIErrorCode>('FEEDBACK_FAILED');
  const [aiFailed, setAiFailed] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const { getArrangement } = useAIWorker();

  // Get the 9 cards from human player's hand
  const cards = humanPlayer.hand;

  // Calculate AI suggestion when modal opens
  useEffect(() => {
    if (!isOpen || aiSuggestion) return;

    const calculateAI = async () => {
      setIsCalculating(true);
      setAiFailed(false);
      try {
        const suggestion = await getArrangement(cards, {
          difficulty: aiDifficulty,
          myCash: humanPlayer.cash,
          opponentCashes: allPlayers.filter(p => p.id !== humanPlayer.id).map(p => p.cash),
          startingCash: 1000,
          numOpponents: allPlayers.length - 1,
        });
        setAiSuggestion(suggestion);
      } catch (error) {
        console.error('Failed to calculate AI suggestion:', error);
        setAiFailed(true);
      } finally {
        setIsCalculating(false);
      }
    };

    calculateAI();
  }, [isOpen, aiSuggestion, cards, aiDifficulty, humanPlayer, allPlayers, getArrangement]);

  // Initialize user correction with all cards unplaced
  useEffect(() => {
    if (isOpen) {
      setUnplacedCards(cards);
      setUserCorrection(createEmptyArrangement());
      setSelectedCard(null);
      setSubmitStatus('idle');
    }
  }, [isOpen, cards]);

  const handleCardClick = (card: CardType) => {
    if (selectedCard?.id === card.id) {
      setSelectedCard(null);
    } else {
      setSelectedCard(card);
    }
  };

  const handleSlotClick = (layer: LayerName, index: number) => {
    const currentCard = userCorrection[layer].cards[index];

    if (selectedCard) {
      // Place selected card
      const newCorrection = { ...userCorrection };
      newCorrection[layer] = { cards: [...newCorrection[layer].cards] };

      if (currentCard) {
        setUnplacedCards(prev => [...prev, currentCard]);
      }

      newCorrection[layer].cards[index] = selectedCard;
      setUnplacedCards(prev => prev.filter(c => c.id !== selectedCard.id));
      setUserCorrection(newCorrection);
      setSelectedCard(null);
    } else if (currentCard) {
      // Return card to hand
      const newCorrection = { ...userCorrection };
      newCorrection[layer] = { cards: [...newCorrection[layer].cards] };
      newCorrection[layer].cards[index] = null;
      setUnplacedCards(prev => [...prev, currentCard]);
      setUserCorrection(newCorrection);
    }
  };

  const isComplete = userCorrection.top.cards.every(c => c !== null) &&
    userCorrection.middle.cards.every(c => c !== null) &&
    userCorrection.bottom.cards.every(c => c !== null);

  const isValid = isComplete && validateArrangement(userCorrection);

  const handleSubmit = async () => {
    if (!isValid || !aiSuggestion) return;

    setIsSubmitting(true);

    const feedback: AIFeedback = {
      ai_difficulty: aiDifficulty,
      player_count: allPlayers.length,
      round_number: roundNumber,
      cards,
      ai_suggestion: aiSuggestion,
      user_correction: userCorrection,
      all_players: allPlayers.map(p => ({
        id: p.id,
        name: p.name,
        isHuman: p.isHuman,
        hand: p.hand,
        arrangement: p.arrangement,
      })),
      round_scores: roundScores,
    };

    let result: Awaited<ReturnType<typeof submitFeedback>>;
    try { result = await submitFeedback(feedback); }
    catch (error) { console.error('Feedback submission failed:', error); result = { success: false, errorCode: 'FEEDBACK_FAILED' }; }
    setSubmitError(result.errorCode ?? 'FEEDBACK_FAILED');

    setIsSubmitting(false);
    setSubmitStatus(result.success ? 'success' : 'error');

    if (result.success) {
      setTimeout(onClose, 1500);
    }
  };

  const renderArrangement = (arrangement: PlayerArrangement | null, label: string) => {
    if (!arrangement) {
      return (
        <div className="flex items-center justify-center h-48 text-slate-500">{t("Calculating...")}</div>
      );
    }

    const layers: Array<{ key: LayerName; label: string }> = [
      { key: 'top', label: t("Top") },
      { key: 'middle', label: t("Mid") },
      { key: 'bottom', label: t("Bot") },
    ];

    return (
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-slate-400">{label}</h4>
        {layers.map(({ key, label: layerLabel }) => {
          const layerCards = arrangement[key].cards.filter(c => c !== null) as CardType[];
          const evaluation = layerCards.length === 3 ? evaluateHand(layerCards) : null;

          return (
            <div key={key} className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 min-w-12">{layerLabel}</span>
              <div className="flex gap-1">
                {arrangement[key].cards.map((card, idx) => (
                  <Card key={`${key}-${idx}`} card={card} size="sm" />
                ))}
              </div>
              {evaluation && (
                <span className="text-xs text-slate-400 ml-1">{handLabel(evaluation, layerCards)}</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderCorrectionArea = () => {
    const layers: Array<{ key: LayerName; label: string }> = [
      { key: 'top', label: t("Top") },
      { key: 'middle', label: t("Mid") },
      { key: 'bottom', label: t("Bot") },
    ];

    return (
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-slate-400">{t("Your Correction")}</h4>
        {layers.map(({ key, label }) => {
          const layerCards = userCorrection[key].cards.filter(c => c !== null) as CardType[];
          const evaluation = layerCards.length === 3 ? evaluateHand(layerCards) : null;

          return (
            <div key={key} className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 min-w-12">{label}</span>
              <div className="flex gap-1">
                {userCorrection[key].cards.map((card, idx) => (
                  <div
                    key={`${key}-${idx}`}
                    onClick={() => handleSlotClick(key, idx)}
                    className="cursor-pointer"
                  >
                    <Card card={card} size="sm" />
                  </div>
                ))}
              </div>
              {evaluation && (
                <span className="text-xs text-slate-400 ml-1">{handLabel(evaluation, layerCards)}</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-slate-900 rounded-xl border border-slate-700 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-slate-200">{t("Flag AI Decision")}</h3>
          <button
            onClick={onClose}
            aria-label={t("Close")}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Cards display */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-slate-400 mb-2">{t("Your 9 Cards")}</h4>
          <div className="flex flex-wrap gap-1 justify-center">
            {cards.map(card => (
              <Card key={card.id} card={card} size="sm" />
            ))}
          </div>
        </div>

        {/* Side by side comparison */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
          {/* AI Suggestion */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            {isCalculating ? (
              <div className="flex items-center justify-center h-48">
                <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              aiFailed ? <p role="alert" className="text-sm text-rose-300">{message(errorMessages.ANALYSIS_FAILED)}</p> : renderArrangement(aiSuggestion, t("AI Suggestion"))
            )}
          </div>

          {/* User Correction */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            {renderCorrectionArea()}
          </div>
        </div>

        {/* Unplaced cards for correction */}
        <div className="mb-6 bg-slate-800/30 rounded-lg p-4">
          <h4 className="text-sm font-medium text-slate-400 mb-2">
            {t('placeRemaining', { count: unplacedCards.length })}
          </h4>
          <div className="flex flex-wrap gap-1 justify-center min-h-[60px]">
            {unplacedCards.length === 0 ? (
              <p className="text-slate-500 text-sm self-center">{t("All cards placed!")}</p>
            ) : (
              unplacedCards.map(card => (
                <div
                  key={card.id}
                  onClick={() => handleCardClick(card)}
                  className={`cursor-pointer transition-transform ${selectedCard?.id === card.id ? 'scale-110 ring-2 ring-amber-400 rounded' : ''}`}
                >
                  <Card card={card} size="sm" />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Validation warning */}
        {isComplete && !isValid && (
          <div className="mb-4 bg-rose-900/30 border border-rose-700/50 rounded-lg p-3 text-rose-300 text-sm">{t("Invalid arrangement! Top must be weakest, bottom must be strongest.")}</div>
        )}

        {/* Submit status */}
        {submitStatus === 'success' && (
          <div className="mb-4 bg-emerald-900/30 border border-emerald-700/50 rounded-lg p-3 text-emerald-300 text-sm">{t("Feedback submitted successfully! Thank you for helping improve the AI.")}</div>
        )}
        {submitStatus === 'error' && (
          <div className="mb-4 bg-rose-900/30 border border-rose-700/50 rounded-lg p-3 text-rose-300 text-sm">{message(errorMessages[submitError])}</div>
        )}

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={!isValid || !aiSuggestion || isSubmitting || submitStatus === 'success'}
          className={`
            w-full py-3 rounded-xl font-bold
            transition-all duration-200
            ${isValid && aiSuggestion && !isSubmitting && submitStatus !== 'success'
              ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-400 hover:to-orange-400'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }
          `}
        >
          {isSubmitting ? t("Submitting...") : submitStatus === 'success' ? t("Submitted!") : t("Submit Feedback")}
        </button>
      </div>
    </div>
  );
}
