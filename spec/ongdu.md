# Ongdu Game Specification

## 1. Game Overview

Ongdu is a 2-6 player card game based off chinese poker, where you rearrange a hand of 9 cards into 3 layers of 3 cards. The scoring is based on comparison to all other players individually.

**Genre:** Card Game, Strategy  
**Players:** 2-6  
**Platform:** Mobile  
**Play Style:** All reveal at the same time and 1 round calculation.

## 2. Deck Composition

The deck consists of the standard 2 to Ace (4 suits) plus 3 wildcards. The total number of cards is hence 55.

**Standard Cards:** 52 (2-Ace, 4 suits: Hearts, Diamonds, Clubs, Spades)  
**Wildcards:** 3  
**Total Cards:** 55

### 2.1 Wildcard Rules
[TODO: Define how wildcards work]
- Can wildcards substitute for any card? Yes
- Do wildcards have special properties or restrictions? No
- Are there visual distinctions for wildcards? No

## 3. Game Setup

### 3.1 Initial Cash Pool
- Starting amount per player: $1,000
- $1 per point against

### 3.2 Card Distribution

Card distribution by the number of players:
- 2 to 5 players: 9 cards each and remaining are left in the pile.
- 6 players: 9 cards each, with the starting player receiving 10 cards (to discard one before comparison).

### 3.3 Starting Player
- First game: Random
- Subsequent games: Rotates anti-clockwise after each hand comparison

## 4. Hand Rankings

Each player needs to stack up 3 layers of 3 cards. Once done, they take turn to compare against another player, layer by layer. The points scored will be used to settle the payment. Repeat until finish comparison.

### 4.1 Three-Card Hand Types (Ranked from highest to lowest)
1. Three of a kind without wildcards (Card number rank for tiebreaker)
2. Straight Flush (Jack, Queen and King only) - Can be tied
3. Straight (Jack, Queen and King only) - Can be tied
4. Three of a kind with wildcards (Card number rank for tiebreaker)
5. Three of any Jack, Queen King
6. Sum of three cards modulo 10 i.e. 1-9 (Jack, Queen and King are valued at 10, Ace at 1)

### 4.2 Layer Requirements/Restrictions
- Top layer cannot be better than middle or bottom layers.
- Middle layer cannot be better than bottom layer. 
- What happens if player violates layer ordering? Invalid hand and automatic 10 points against another player.

## 5. Gameplay Flow

### 5.1 Phase 1: Dealing
1. Provide each card one by one
2. Starting player receives cards
3. [For 6 players: Starting player receives 10 cards]

### 5.2 Phase 2: Discard (6-player games only)
1. Starting player must discard 1 card from their 10 cards
2. Discard face-up and other players can see

### 5.3 Phase 3: Arrangement
1. Each player arranges their 9 cards into 3 layers of 3 cards each
2. No time limit
3. Cannot rearrange when everyone is ready and reveal simultaneously


### 5.4 Phase 4: Comparison & Scoring
1. All players reveal their arrangements
2. Each player's hand is compared against every other player individually
3. Scoring is calculated (see Section 6)
4. Cash is exchanged based on scores

### 5.5 Phase 5: Next Round
1. Check for bankruptcy (see Section 7)
2. Rotate starting player anti-clockwise
3. If game continues, return to Phase 1

## 6. Scoring System

### 6.1 Layer-by-Layer Comparison
For each pair of players (Player A vs Player B):
- Compare top layer: 1 point for winner
- Compare middle layer: 1 point for winner
- Compare bottom layer: 1 point for winner

### 6.2 Bonuses
- Special hands: 4 of a kind, or no layer with less than 9 score for all 3 layers without wildcard

### 6.3 Invalid Hand (Foul)
Fixed penalty amount of 10 points per opponent

### 6.4 Cash Conversion
- 1 point = $1$
- Payment direction: Loser pays winner

## 7. Win/Loss Conditions

### 7.1 Bankruptcy
- A player reaches $0 (or below)
- Game ends immediately when any player goes bankrupt

### 7.2 Game End
- Richesst player wins

### 7.3 Alternative End Conditions
No.

## 8. Special Rules & Edge Cases

### 8.1 Wildcard Interaction
- Can multiple wildcards be in the same layer? Yes
- Wildcard value in tiebreakers? No tiebreaker
- Visual representation of wildcard substitution? Joker


## 9. User Interface Requirements

### 9.1 Game Lobby
- Create/join game options
- Player count selection (2-6) Basically 1 person versus computers
- Starting cash configuration
- Player names/avatars

### 9.2 Game Table View
- Card display for current player
- Opponent displays (hidden/revealed)
- Current scores/cash for all players
- Starting player indicator
- Phase indicator

### 9.3 Card Arrangement Interface
- Click to select and click to place. Will swap if existing.
- Confirmation button before reveal

### 9.4 Scoring Display
Show summary

### 9.5 Game History
No

## 10. Technical Considerations

### 10.2 Card Shuffling & Dealing
- Use cryptographically secure random number generator
- Client-side

### 10.3 Data Persistence
No
