# Ongdu - Casual Poker Card Game

A strategic 3-layer card game based on Casual Poker, built with Next.js 16 and React.

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

## Card Helper photo scanning

At `/helper`, choose **Upload a photo** or **Take a photo**. The helper starts
reading the image automatically, then shows a compact hand for review. Manual
entry is available through **Enter cards instead**. Recognition runs locally with free Tesseract.js OCR
and suit silhouette matching. Photos are never sent to a recognition service.
The OCR engine and English language data download from public CDNs on first use.

The scanner first looks for separate white card faces. If it finds fewer than
nine, it also searches for exposed rank/suit pairs using local contrast, corrects
their rotation, and retries weak OCR readings. This supports some overlapping,
fanned hands without requiring complete card outlines or a dark background.
Keep corner indices visible and use a sharp, close photo. Decorative, heavily
rotated, obscured, or poorly lit cards may still be missed or misread. Wildcards
must be marked manually in the review screen. This remains experimental; a single
successful fan reference does not establish accuracy across decks and conditions.

Review the detected hand, tap a card to edit it, and use its checkbox to include
or exclude it. Uncertain cards are marked **Check**; the original photo and
numbered regions are available under **Compare with your photo**. Photos may
contain more than ten cards. Add missed cards or remove false detections as needed.
**Find my best arrangement** confirms the hand and immediately starts analysis.
It requires 9 or 10 selected cards, rejects duplicate ordinary cards, and allows
up to three wildcards.

Arrangement analysis runs in a cancellable Web Worker. The result emphasizes the
top, middle, and bottom layers, and the recommended discard for a ten-card hand.
Other arrangements and estimated win rates are available on demand. Table size
defaults to two players and can be changed before scanning or after seeing a result.
Editing a result preserves the reviewed hand; **Try another hand** resets the flow.

Focused scanner checks (Node 22.18+ with built-in TypeScript support):

```bash
node --test tests/card-recognition.test.mjs
node --test tests/helper-analysis-worker.test.mjs
```

Image/OCR checks use the canvas dev dependency and download free English OCR data
on first use (cached in the OS temporary directory):

```bash
node --test tests/card-recognition-images.test.mjs
```

The optional `ONGDU_FAN_REFERENCE_PHOTO` environment variable points to the supplied
13-card fan reference JPEG to enable its regression check. The reference photo is
not included in the repository.

## 📜 License

MIT


### YOLO migration preparation

The live photo scanner remains on its existing engine pending the acceptance gates in
`spec/yolo-card-recognition-plan.md`. Source pinning, static checkpoint inspection,
the fixed class mapping, and independent model-contract tests are available. See
[model preparation status](models/card-recognition/README.md) for commands and missing
release evidence. `npm run test:card-contract` runs the independent contract tests;
`npm run model:inspect -- --help` describes the explicit, hash-checked source inspection.
No model download or Python execution occurs during the application build.
