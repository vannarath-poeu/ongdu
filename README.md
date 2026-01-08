# Ongdu - Chinese Poker Card Game

A strategic 3-layer card game based on Chinese Poker, built with Next.js 16 and React.

![Ongdu Game](https://img.shields.io/badge/Status-Complete-brightgreen)

## 🎮 Game Overview

Ongdu is a 2-6 player card game where you arrange 9 cards into 3 layers of 3 cards each. The goal is to beat other players by having stronger hands in each layer.

### Key Rules

- **55 Card Deck**: Standard 52 cards + 3 Wildcards (Jokers)
- **Layer Requirement**: Bottom must be strongest, top must be weakest
- **Scoring**: 1 point per layer won, $1 per point
- **Game End**: When any player goes bankrupt

## 🃏 Hand Rankings (Strongest to Weakest)

1. **Three of a Kind (Pure)** - No wildcards
2. **Straight Flush J-Q-K** - Same suit
3. **Straight J-Q-K** - Any suits
4. **Three of a Kind (Wild)** - With wildcards
5. **Three Face Cards** - Any J, Q, K combination
6. **Sum Modulo 10** - Best is 0 (counts as 10)

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

Open [http://localhost:3000](http://localhost:3000) to play!

## 🎯 How to Play

1. **Lobby**: Choose number of players (2-6), enter your name, and set starting cash
2. **Deal**: Each player receives 9 cards (10 for starting player in 6-player games)
3. **Arrange**: Click cards to select, then click slots to place them
4. **Reveal**: All arrangements are revealed simultaneously
5. **Score**: Points are calculated and cash is exchanged
6. **Repeat**: Until someone goes bankrupt

## 🏗️ Tech Stack

- **Framework**: Next.js 16.1.1
- **UI**: React 19 + Tailwind CSS 4
- **Language**: TypeScript
- **Fonts**: Outfit, JetBrains Mono

## 📁 Project Structure

```
ongdu/
├── app/
│   ├── globals.css     # Global styles and animations
│   ├── layout.tsx      # Root layout with fonts
│   └── page.tsx        # Main game logic and state
├── components/
│   ├── Card.tsx        # Playing card component
│   ├── GameLobby.tsx   # Initial game setup screen
│   ├── GameTable.tsx   # Main game view
│   ├── HandArrangement.tsx  # Card placement interface
│   └── ScoreDisplay.tsx     # Round/game results
├── lib/
│   ├── types.ts        # TypeScript interfaces
│   ├── game-logic.ts   # Core game mechanics
│   └── ai.ts           # AI opponent logic
└── spec/
    └── ongdu.md        # Game specification
```

## 🤖 AI Opponents

The AI uses a brute-force algorithm to find the optimal card arrangement:
- Evaluates all possible 3-card groupings (1680 combinations)
- Validates layer ordering constraints
- Selects arrangement with highest combined score

## ⚡ Features

- ✅ Full game implementation per specification
- ✅ 2-6 player support (1 human vs AI opponents)
- ✅ Beautiful dark theme with glassmorphism effects
- ✅ Smooth animations and transitions
- ✅ Responsive card selection and placement
- ✅ Real-time arrangement validation
- ✅ Comprehensive scoring display
- ✅ Cryptographically secure card shuffling

## 📜 License

MIT
