# AGENTS.md

## Project purpose

Ongdu is a browser-based, single-human-vs-AI implementation of a 2–6 player, three-layer card game inspired by Chinese poker. Players arrange nine cards into top, middle, and bottom three-card layers; the layers must be ordered from weakest to strongest. The canonical product rules are in `spec/ongdu.md`. When behavior, UI copy, and the spec disagree, inspect the current implementation and clarify the intended rule before changing scoring.

The application is a Next.js 16 App Router project using React 19, TypeScript in strict mode, and Tailwind CSS 4. Game state and gameplay run client-side. There is no application server or game-state persistence. Supabase is used only for optional AI-feedback submission and reporting.

## Architecture and directory map

- `app/page.tsx`: top-level game state machine. It creates players and hands, coordinates the discard/arrangement/scoring phases, dispatches AI work, rotates the starting player, and starts the next round.
- `app/layout.tsx`, `app/globals.css`: root metadata, Google fonts, Tailwind import, global theme, and shared animations/styles.
- `app/helper/page.tsx`: standalone `/helper` tool for entering 9 or 10 cards and comparing expected-value arrangements.
- `app/feedback/page.tsx`: client-side `/feedback` dashboard backed by Supabase.
- `components/`: game UI. `GameLobby` collects setup, `GameTable` renders active play, `HandArrangement` manages placement and suggestions, `ScoreDisplay` renders results, `FeedbackModal` captures corrections, and `Card` is the shared card renderer.
- `lib/types.ts`: shared cards, players, arrangements, phases, scores, and hand-ranking types.
- `lib/game-logic.ts`: deck creation/shuffling, hand evaluation, layer validation, pairwise scoring, special hands, cash updates, and a basic arrangement search. This is the central rules module.
- `lib/ai.ts`: difficulty selection and AI arrangement/discard entry points.
- `lib/expected-value.ts`: sampling, EV ranking, and risk-adjusted decisions used by medium/hard AI and the helper page.
- `lib/ai.worker.ts`, `lib/use-ai-worker.ts`: Web Worker protocol and React hook that keep expensive AI searches off the browser main thread.
- `lib/supabase.ts`, `lib/feedback.ts`: optional browser Supabase client and `ai_feedback` access.
- `scripts/experiment.ts`, `scripts/experiment-types.ts`: Node CLI for comparing hard and easy AI strategies and writing CSV results.
- `spec/ongdu.md`: detailed gameplay specification. `README.md` is the user-facing overview and setup guide.
- `public/`: stock static assets. Root configuration lives in `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, and `postcss.config.mjs`.

## Prerequisites and local commands

The repository uses npm and commits `package-lock.json`. No Node version is pinned in the repository; use a Node/npm version supported by Next.js 16.

```bash
npm ci                 # reproducible install from package-lock.json
npm run dev            # development server at http://localhost:3000
npm run lint           # ESLint: Next core-web-vitals + TypeScript rules
npm run build          # production compilation and Next checks
npm start              # serve an existing production build
npm run experiment     # run the default AI simulation; writes experiment-results.csv
```

The experiment runner accepts `--players=2|4|6|all`, `--split=half|solo|all`, `--games=N`, `--rounds=N`, and `--output=PATH`. Use a small run while iterating, for example:

```bash
npm run experiment -- --players=2 --split=solo --games=2 --rounds=5 --output=/tmp/ongdu-results.csv
```

Generated experiment CSV files are not currently ignored; do not accidentally commit them.

## Testing and quality checks

There is currently no test framework, test directory, or `npm test` script. For every change, run `npm run lint` and `npm run build`. Add focused automated tests when introducing a test harness, especially around pure exports in `lib/game-logic.ts` and `lib/expected-value.ts`; do not imply test coverage that does not exist.

Manually exercise the affected paths:

- `/`: start 2-player and 6-player games, arrange/confirm a hand, let AI finish, inspect scoring, and continue a round. In a 6-player game, verify the rotating starting player receives 10 cards and discards one.
- `/helper`: try both typed and picker input, nine-card suggestions, and ten-card discard analysis.
- `/feedback`: test only with a configured Supabase project; without it the page intentionally returns empty data and submissions report that Supabase is not configured.

AI and EV behavior is randomized through shuffling and sampling, so compare invariants and aggregate results rather than expecting identical arrangements on every run. Keep expensive AI calculations in the worker and check that the UI stays responsive.

## Coding conventions

- Keep TypeScript strict and use the shared domain types from `lib/types.ts`. Avoid `any` and preserve nullability in arrangement slots.
- Use the `@/` alias for application imports. Components and pages use default exports; reusable library functions use named exports.
- Add `'use client'` only to modules that require state, effects, browser APIs, or event handlers. The game and feedback flows currently depend heavily on client-side APIs.
- Follow the existing functional React style: hooks, immutable array/object updates, typed props, and small event callbacks. Never mutate `GameState`, players, hands, or arrangements in place.
- Styling is utility-first Tailwind in JSX, with shared/global effects in `app/globals.css`. Reuse `Card` and established slate/amber/rose/emerald visual patterns rather than duplicating card markup.
- Preserve stable, unique card IDs. `evaluateHand` memoizes by sorted card IDs, and deck-removal logic also normalizes IDs.
- Comments should explain game rules, performance choices, or non-obvious constraints, not restate code. Existing files vary between single and double quotes; follow the file being edited because no formatter is configured.

## Rules, AI, and scoring workflow

Treat changes to rules as cross-cutting. A hand-ranking or wildcard change may need coordinated updates in:

1. `spec/ongdu.md` and user-visible descriptions;
2. `HandType`, evaluations, comparisons, point values, fouls, and special hands in `lib/types.ts` and `lib/game-logic.ts`;
3. arrangement scoring and special-hand detection in `lib/ai.ts`;
4. EV simulation and risk logic in `lib/expected-value.ts`;
5. helper/score/feedback UI text and rendering.

Do not assume the two exported `findBestArrangement` implementations are interchangeable: `lib/game-logic.ts` contains a rules-level exhaustive optimizer, while `lib/ai.ts` supplies the difficulty-aware AI path and delegates medium/hard modes to EV logic. There is also duplicated scoring/special-hand logic across these modules; update all relevant copies or consolidate carefully.

Important current invariants include a 55-card deck, exactly three cards per layer, `top <= middle <= bottom`, a 10-point foul/special-hand outcome, pairwise zero-sum cash changes, and game end when any player reaches zero or less. Wildcards cannot form J-Q-K straights, straight flushes, or same-suit bonuses in the current implementation. Use the implementation and spec together when resolving edge cases.

Worker requests are correlated by generated IDs and return promises. If adding a worker operation, update the request/response unions, worker handler, and hook together, and reject or clean up outstanding work on errors/unmount.

## Environment, integrations, and deployment

Copy `.env.local.example` to `.env.local` only when feedback features are needed:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Both variables are intentionally browser-visible. Never put a Supabase service-role key or another secret in a `NEXT_PUBLIC_*` variable. `.env*` is ignored while `.env.local.example` is explicitly committed; keep real credentials out of Git.

The client expects an `ai_feedback` table with fields matching `AIFeedback` plus `id`, `created_at`, and `session_id`. Schema migrations, row-level-security policies, and deployment setup are not stored in this repository, so verify them in the target Supabase project before changing queries. A per-browser UUID is kept in `localStorage` as `feedback_session_id`; it is an identifier, not authentication.

No checked-in CI workflow or hosting configuration exists. Production is the standard `npm run build` followed by `npm start`; configure the two public Supabase variables in the hosting environment if feedback is enabled. Do not claim a specific deployment provider based only on the default Next.js/Vercel ignore entries and assets.

## Practical cautions

- Preserve the client-only design unless a task explicitly introduces server authority or persistence. Reloading the page currently resets the game.
- `crypto.getRandomValues` is used by the shared shuffle code and must work in both browser play and the Node experiment environment.
- Medium/hard AI sampling counts directly affect latency; benchmark the browser worker and run a small experiment before increasing them.
- Avoid broad refactors of rule logic without regression coverage. Small ranking changes can alter validation, AI search, scoring, special hands, and simulations simultaneously.
- Check `git status` before and after work. Preserve unrelated user changes and do not commit generated `.next`, environment files, or experiment output.
