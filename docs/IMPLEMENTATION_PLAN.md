# GnarPuzzle 2.0 - Implementation Plan

## 🎯 Next Steps: Game State Management

Baserat på våra regelspecifikationer behöver vi implementera kärn-logiken för spelet.

## 🔧 Tekniska beslut tagna:

### Rumkonfiguration:
- **Publika rum**: 4x4, 5x5, 6x6 (max 6 spelare, 10s/15s timers)
- **Privata rum**: Konfigurerbart (grid 3x3-8x8, spelare 2-6, timers 5-30s)
- **Lösenordsskydd**: Endast privata rum

### Spelmekanik:
- **Timer**: 10s bokstavsval, 15s placering
- **Bokstäver**: Alla svenska bokstäver (A-Ö) alltid tillgängliga
- **Minimumord**: 2 bokstäver
- **Poäng**: 1p/bokstav + 2p helradsbonus

## 📝 Implementation Priority:

### 1. Enhanced Database Schema ⚡
Behöver uppdatera nuvarande schema för att stödja:
```sql
-- Rooms table: lägg till settings JSON
ALTER TABLE rooms ADD COLUMN settings TEXT; -- JSON med grid_size, max_players, timers, password

-- Games table: utöka state management
ALTER TABLE games ADD COLUMN current_phase TEXT; -- 'letter_selection' | 'letter_placement' | 'finished'
ALTER TABLE games ADD COLUMN phase_timer_end INTEGER; -- timestamp när nuvarande fas slutar
ALTER TABLE games ADD COLUMN letter_pool TEXT; -- JSON array med tillgängliga bokstäver

-- Players table: utöka för game state
ALTER TABLE players ADD COLUMN current_letter TEXT; -- bokstav spelaren håller på att placera
ALTER TABLE players ADD COLUMN grid_state TEXT; -- JSON representation av spelarens grid
ALTER TABLE players ADD COLUMN placement_confirmed BOOLEAN DEFAULT 0;
```

### 2. Game State Service 🎮
```typescript
class GameStateService {
  // Fas hantering
  async startLetterSelection(gameId: string): Promise<void>
  async advanceToPlacement(gameId: string): Promise<void>
  async processPlacementTimeout(gameId: string): Promise<void>
  
  // Letter hantering
  async selectLetter(gameId: string, playerId: string, letter: string): Promise<void>
  async placeLetter(gameId: string, playerId: string, x: number, y: number): Promise<void>
  async confirmPlacement(gameId: string, playerId: string): Promise<void>
  
  // Spel logik
  async checkGameEnd(gameId: string): Promise<boolean>
  async calculateScores(gameId: string): Promise<PlayerScore[]>
}
```

### 3. Word Validation Service 📚
**Kortsiktig lösning**:
```typescript
// Använd en statisk svensk ordlista först
class WordValidationService {
  private words: Set<string>; // ladda från fil
  
  async validateWord(word: string): Promise<boolean>
  async getValidWords(grid: string[][]): Promise<ValidWord[]>
  async calculateGridScore(grid: string[][]): Promise<number>
}
```

**Långsiktig lösning**: Integrera med språkdata.gu.se eller Svenska Akademiens API om tillgängligt

### 4. Timer Management ⏱️
```typescript
class TimerService {
  // Phase timers
  async startPhaseTimer(gameId: string, phase: GamePhase, duration: number): Promise<void>
  async handleTimerExpiry(gameId: string): Promise<void>
  
  // Auto-advance logic
  private async autoAdvanceTurn(gameId: string): Promise<void>
  private async autoPlaceLetters(gameId: string): Promise<void>
}
```

### 5. Socket Events Update 📡
Utöka SocketService med:
```typescript
// Game phase events
'game:phase_changed' // letter_selection → letter_placement
'game:timer_update'  // countdown updates
'game:timer_warning' // 5s warning

// Letter events  
'letter:selected'    // spelare valde bokstav
'letter:placed'      // spelare placerade bokstav
'letter:confirmed'   // spelare bekräftade placering

// Game end events
'game:ended'         // spelet avslutades
'game:scores'        // slutresultat
```

## 🚀 Implementation Order:

1. **Database migration** (ny schema) ✅ Prioritet 1
2. **GameStateService** (kärn-logik) ✅ Prioritet 1  
3. **WordValidationService** (basic ordlista) ✅ Prioritet 1
4. **TimerService** (fas-hantering) ✅ Prioritet 1
5. **Enhanced Socket events** ✅ Prioritet 1
6. **API endpoint updates** (nya game actions) ✅ Prioritet 2
7. **Testing** (unit + integration) ✅ Prioritet 2

## 📋 Ordlista-lösning:

**Steg 1**: Hitta svensk ordlista-fil (txt/json format)
**Steg 2**: Ladda in i `WordValidationService` vid server start  
**Steg 3**: Cache i memory för snabb validering
**Steg 4**: (Framtid) Integrera med externa API:er

---

**Status**: Ready för implementation  
**Nästa action**: Börja med database migration för utökad schema