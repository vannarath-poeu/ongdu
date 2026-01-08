'use client';

import { Card as CardType } from '@/lib/types';

interface CardProps {
  card: CardType | null;
  onClick?: () => void;
  isSelected?: boolean;
  isDisabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  faceDown?: boolean;
}

const suitSymbols: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
  wild: '★',
};

const suitColors: Record<string, string> = {
  hearts: 'text-rose-600',
  diamonds: 'text-rose-600',
  clubs: 'text-slate-900',
  spades: 'text-slate-900',
  wild: 'text-amber-500',
};

const sizeClasses = {
  sm: 'w-12 h-16 text-xs',
  md: 'w-16 h-24 text-sm',
  lg: 'w-20 h-28 text-base',
};

export default function Card({ 
  card, 
  onClick, 
  isSelected = false, 
  isDisabled = false,
  size = 'md',
  faceDown = false 
}: CardProps) {
  if (!card) {
    // Empty slot
    return (
      <div
        onClick={onClick}
        className={`
          ${sizeClasses[size]}
          rounded-lg border-2 border-dashed border-slate-400/50
          bg-slate-800/30 backdrop-blur-sm
          flex items-center justify-center
          transition-all duration-200
          ${onClick && !isDisabled ? 'cursor-pointer hover:border-amber-400/70 hover:bg-slate-700/40' : ''}
        `}
      >
        <span className="text-slate-500 text-lg">+</span>
      </div>
    );
  }

  if (faceDown) {
    return (
      <div
        className={`
          ${sizeClasses[size]}
          rounded-lg
          bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-900
          border-2 border-indigo-600
          shadow-lg shadow-indigo-900/50
          flex items-center justify-center
          relative overflow-hidden
        `}
      >
        {/* Card back pattern */}
        <div className="absolute inset-2 border border-indigo-400/30 rounded opacity-60">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_20%,_rgba(99,102,241,0.1)_20%,_rgba(99,102,241,0.1)_40%,_transparent_40%)] bg-[length:8px_8px]" />
        </div>
        <span className="text-indigo-300 text-xl font-bold z-10">☯</span>
      </div>
    );
  }

  const suitSymbol = suitSymbols[card.suit];
  const colorClass = suitColors[card.suit];
  const displayRank = card.isWild ? 'W' : card.rank;

  return (
    <div
      onClick={onClick}
      className={`
        ${sizeClasses[size]}
        rounded-lg
        bg-gradient-to-br from-slate-50 to-slate-100
        border-2 transition-all duration-200
        shadow-md
        flex flex-col justify-between p-1.5
        relative overflow-hidden
        ${isSelected 
          ? 'border-amber-400 ring-2 ring-amber-400/50 scale-105 shadow-amber-400/30 shadow-lg -translate-y-1' 
          : 'border-slate-300 hover:border-slate-400'
        }
        ${onClick && !isDisabled 
          ? 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5' 
          : ''
        }
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${card.isWild ? 'bg-gradient-to-br from-amber-50 to-amber-100 border-amber-300' : ''}
      `}
    >
      {/* Top left rank/suit */}
      <div className={`flex flex-col items-start leading-none ${colorClass}`}>
        <span className="font-bold">{displayRank}</span>
        <span className="text-lg -mt-1">{suitSymbol}</span>
      </div>
      
      {/* Center suit */}
      <div className={`absolute inset-0 flex items-center justify-center ${colorClass} opacity-20`}>
        <span className="text-4xl">{suitSymbol}</span>
      </div>
      
      {/* Bottom right rank/suit (inverted) */}
      <div className={`flex flex-col items-end leading-none rotate-180 ${colorClass}`}>
        <span className="font-bold">{displayRank}</span>
        <span className="text-lg -mt-1">{suitSymbol}</span>
      </div>

      {/* Wild card glow effect */}
      {card.isWild && (
        <div className="absolute inset-0 bg-gradient-to-br from-amber-400/10 to-orange-400/10 pointer-events-none" />
      )}
    </div>
  );
}

