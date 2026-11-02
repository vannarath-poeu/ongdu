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

## Languages

Khmer is the default throughout the game, card helper, camera review, and feedback.
Use **ខ្មែរ | English** in any screen header to switch instantly. The choice is
saved on this browser; switching during play keeps the current hand and analysis.
Card notation, digits (0–9), and the existing $ game currency stay unchanged.

Translations and the shared card-game glossary live in `lib/i18n/messages.ts`.
Use `useLocale()` for UI copy and domain labels, and store message descriptors
or error codes for text that outlives a render. Keep locale out of game state
and worker inputs. Both dictionaries must have matching keys and placeholders.
Run `npm run test:i18n` to check the translation contract and domain formatting.
Khmer terminology is a draft and should receive fluent-speaker review before release.

## 🎯 How to Play

1. **Lobby**: Choose the number of players (2-6), difficulty, and estimated game length
2. **Deal**: Each player receives 9 cards (10 for starting player in 6-player games)
3. **Arrange**: Click cards to select, then click slots to place them
4. **Reveal**: All arrangements are revealed simultaneously
5. **Score**: Points are calculated and cash is exchanged
6. **Repeat**: Until someone goes bankrupt

## 🏗️ Tech Stack

- **Framework**: Next.js 16.1.1
- **UI**: React 19 + Tailwind CSS 4
- **Language**: TypeScript
- **Fonts**: Noto Sans Khmer, Outfit, JetBrains Mono

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
entry is available through **Enter cards instead**. The default scanner uses the
frozen epoch-30 YOLO26n model through ONNX Runtime Web in a browser worker. Model
and runtime assets are served from the app's origin; photos stay on the device.
WebGPU is attempted when available, with a clean-worker WASM fallback.

The model recognizes 52 ordinary card identities from visible corners. Matching
rank-and-suit detections are merged into one card for Ongdu's single deck, using
the strongest corner as the preview. Conflicting readings stay flagged for review.
Use a sharp photo with every rank and suit visible. Add wildcards manually.
This remains an experimental model; independent hand accuracy and named mobile
device performance are not yet established.

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

Legacy OCR comparison checks use the canvas dev dependency and download English OCR data
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

The separate [model-training Python project](model-training/README.md) contains the
custom-training plan and local dataset inspection scaffold for YOLO26n/YOLOv8n.
Its datasets, weights, Python environment, and generated artifacts stay outside the
web build. No dataset download or API key is required for the supplied local exports.

### Game length

Quick, Standard, and Longer target roughly 5, 10, and 20 rounds by adjusting each
player's starting cash for the table size. Standard is the default ($60 each for
four players). Scoring stays $1 per point, and the game still ends at the first
bankruptcy; these are estimates, not round limits. Cards, skill, and AI difficulty
can lead to shorter or longer games.

Initial bankroll tuning used 80 sampled easy-AI rounds per table size and 2,000
resampled games per candidate bankroll, shuffling payout assignments between players.
This is a small simulation baseline, not measured human-play duration. Medium/hard
AI and human play still need calibration. The preset values live in `lib/game-setup.ts`.

## YOLO26 photo scanner setup

Open `/helper` to use the frozen epoch-30 YOLO26 model by default selected after stopping at 31 completed epochs. No scanner query parameter is required. Use `/helper?provider=wasm` to test the portable CPU path. Photos are processed locally in a dedicated browser worker; only same-origin model/runtime assets are fetched.

The epoch-30 FP32 model is checked in under `public/models/card-recognition/yolo26n-epoch30-2c3a1772-single-deck-v1/`, with its manifest, checkpoint hash, export parity evidence, source notices and license. `npm run model:prepare-runtime` copies ONNX Runtime Web 1.23.2 modules/WASM from installed npm dependencies and checks model bytes; `npm run dev` and `npm run build` run this local step automatically. No model download, export or training runs during builds.

This is an experimental integration, not an accepted scanner replacement. The model detects card corners. Because Ongdu uses one ordinary deck, repeated rank-and-suit detections are merged into one review card, keeping the strongest corner and its preview/overlay. Different ranks or suits remain separate; conflicting overlapping identities stay uncertain. Manual wildcards remain independently editable. Review every card and add jokers manually. Independent 9/10-card accuracy and named mobile-device/browser benchmarks remain pending. A new trained checkpoint needs a separate immutable export and manifest update; future training does not automatically replace the loaded epoch-30 model.

Run `npm run test:yolo26` for decoder/worker lifecycle checks, plus the existing card-contract, recognition, helper-worker and localization tests.

Reproduce the browser checks against a production server with a supplied local card photo:

```sh
# In one terminal:
npm run build
npm start -- --port 3100

# In another terminal (or run npx playwright install chromium first):
ONGDU_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:yolo26:browser -- /absolute/path/to/cards.jpg
```

The browser check covers real WASM inference, 20 scan/reset cycles, 9/10-card editing and arrangement handoff, cancellation, corrupt model rejection, GPU fallback and same-origin-only requests. Reports default to the ignored `models/card-recognition/reports/epoch30-browser/` directory. Desktop Chrome verification does not establish actual GPU execution, mobile performance or independent hand accuracy.

The epoch-30 model was selected by validation scores before the final 1,010-image test evaluation. At fixed 640px input, test box precision is 99.88%, recall 99.97%, mAP50 99.50%, and mAP50–95 57.54%. The training log reported 84.87% validation mAP50–95 with rectangular padding; fixed-640 validation rechecking measured 57.44%. These are different preprocessing conditions. The packaged `test-evaluation.json` records deployment-shape results; no test-set-driven tuning was applied.
