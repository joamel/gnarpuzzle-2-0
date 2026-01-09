# Logging Strategy - GnarPuzzle 2.0

## Overview
Strukturerad loggning för felsökning av produktionsproblem och utveckling.

## Log Levels

### Backend (Winston)
- **ERROR** - Kritiska fel som kräver omedelbar åtgärd (alltid loggat + fil)
- **WARN** - Varningar som bör undersökas (produktion + utveckling)
- **INFO** - Viktiga operationella händelser (produktion + utveckling)
- **DEBUG** - Detaljerad felsökningsinformation (endast utveckling)

### Frontend (Console)
- **ERROR** - Kritiska fel (alltid loggat)
- **WARN** - Varningar (produktion + utveckling)
- **INFO** - Viktig information (endast utveckling)
- **DEBUG** - Felsökningsinfo (endast utveckling)

## Usage

### Backend (server/src)
```typescript
import { gameLogger, socketLogger, roomLogger, dbLogger, authLogger } from '../utils/logger';

// Game events
gameLogger.info('Player joined game', { gameId, userId, username });
gameLogger.error('Failed to place letter', { gameId, playerId, error });

// Socket events
socketLogger.debug('Socket connected', { socketId, userId });
socketLogger.warn('Socket reconnection attempt', { attempt, maxAttempts });

// Room events
roomLogger.info('Room created', { roomId, code, createdBy });

// Database operations
dbLogger.error('Query failed', { query, error });
```

### Frontend (client/src)
```typescript
import { logger } from '../utils/logger';

// Game events
logger.game.info('Game started', { gameId, players });
logger.game.error('Failed to submit placement', { error });

// Socket events  
logger.socket.debug('Connected to server');
logger.socket.warn('Connection lost, reconnecting');

// Room events
logger.room.info('Joined room', { roomCode });

// API calls
logger.api.error('API request failed', { endpoint, error });
```

## Production Behavior

### Backend
- Loggar ERROR, WARN, INFO till console och fil
- Filloggning: `logs/error.log` och `logs/combined.log`
- Automatisk filrotation (5MB max, 5 filer)
- DEBUG loggar INTE i produktion

### Frontend
- Loggar endast ERROR och WARN till console
- INFO och DEBUG loggar INTE i produktion
- Minimal console output för prestanda

## Development Behavior

### Backend
- Alla nivåer (ERROR, WARN, INFO, DEBUG) till console
- Färgkodade loggar
- Kategoriserade för enkel filtrering

### Frontend  
- Alla nivåer till console med emojis
- 🔍 DEBUG - Detaljerad felsökning
- ℹ️ INFO - Viktig information
- ⚠️ WARN - Varningar
- ❌ ERROR - Fel

## Kritiska Händelser att Logga

### Game Logic
- ✅ Game start/end (INFO)
- ✅ Phase changes (INFO)
- ✅ Player turns (DEBUG)
- ✅ Letter selection (DEBUG)
- ✅ Letter placement (DEBUG)
- ✅ Timeout events (WARN)
- ✅ Score calculations (DEBUG)
- ❌ Grid state changes (för verbose - hoppa över)

### Socket Events
- ✅ Connection/disconnection (INFO)
- ✅ Reconnection attempts (WARN)
- ✅ Authentication success/failure (INFO/ERROR)
- ✅ Room join/leave (INFO)
- ❌ Every socket emit (för verbose - hoppa över)

### Database
- ✅ Connection issues (ERROR)
- ✅ Query failures (ERROR)
- ✅ Transaction failures (ERROR)
- ❌ Successful queries (för verbose - hoppa över)

### Room Management
- ✅ Room created/deleted (INFO)
- ✅ Player joined/left (INFO)
- ✅ Game started (INFO)
- ❌ Member list updates (för verbose - hoppa över)

## Felsökningsexempel

### Problem: Bokstav försvinner efter placering
```typescript
// GameStateService.ts - Relevant loggning
gameLogger.debug('Letter placed', { 
  gameId, 
  playerId, 
  letter: player.current_letter,
  position: { x, y },
  gridStateBefore: JSON.stringify(gridState)
});

gameLogger.warn('Auto-placement triggered', {
  gameId,
  playerId,
  reason: 'timeout',
  letter: player.current_letter
});
```

### Problem: Socket disconnect under spel
```typescript
// SocketService.ts - Relevant loggning
socketLogger.warn('Player disconnected during game', {
  socketId: socket.id,
  userId,
  gameId,
  gracePeriod: 90000
});

socketLogger.info('Player reconnected', {
  socketId: socket.id,
  userId,
  timeDisconnected: Date.now() - disconnectTime
});
```

## Migration Strategy

### Phase 1: Core services (PRIO 1) ✅
- [x] GameStateService - game logic errors
- [x] SocketService - connection issues  
- [x] RoomModel - room management

### Phase 2: Supporting services (PRIO 2)
- [ ] WordValidationService - validation errors
- [ ] GameController - API errors
- [ ] AuthService - authentication

### Phase 3: Cleanup (PRIO 3)
- [ ] Ta bort debug console.logs
- [ ] Ta bort development-only loggar
- [ ] Verifiera produktion har minimal logging

## Testing

```bash
# Backend - testa olika log levels
LOG_LEVEL=debug npm run dev       # All logging
LOG_LEVEL=info npm run dev        # Production-like
NODE_ENV=production npm start     # Production mode

# Frontend - kontrollera console
# Development: Öppna DevTools, se alla loggar
# Production build: Bör endast visa ERROR/WARN
npm run build && npm run preview
```

## File Structure
```
logs/
  ├── error.log          # Endast ERROR (alltid)
  ├── combined.log       # ERROR+WARN+INFO (produktion)
  └── .gitignore        # Exkludera från git
```

## Environment Variables

```bash
# Backend
NODE_ENV=production           # production | development
LOG_LEVEL=info               # error | warn | info | debug

# Frontend
VITE_LOG_LEVEL=warn          # error | warn | info | debug (optional)
```
