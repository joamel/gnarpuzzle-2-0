# Reconnection Architecture Fix

## Problem Identified
Multiple `useEffect` handlers were running simultaneously when various events occurred (screen lock, internet disconnect, page refresh, leave room), causing **race conditions** where they all tapped into the same state management, resulting in:
- currentRoom being set then cleared unexpectedly
- State inconsistency between API and React state
- User stuck on "Du är inte i något rum" even after successful reconnect

## Root Causes
1. **Local variables in effects** - `isProcessing` flag was local to effect, reset on each re-run
2. **Scattered cleanup logic** - Multiple effects trying to manage same state independently
3. **Missing socket disconnect handler** - No explicit handling for internet kicks
4. **No coordination** - Different scenarios (lock screen, intentional leave, socket error) didn't communicate

## Solution: Unified State Management

### 1. **Persistent Refs Instead of Local Flags**
```tsx
const reconnectInProgressRef = useRef(false);      // Persist across effect re-runs
const isIntentionallyLeavingRef = useRef(false);   // Signals other effects NOT to reconnect
const appIsHiddenRef = useRef(false);              // Track visibility state
```

**Why Refs?** They persist their values across effect re-runs, unlike local variables that reset. This prevents multiple simultaneous reconnect attempts.

### 2. **Explicit Scenario Coordination**

#### Screen Lock/Unlock (Visibility Change)
```
1. Hidden → Save ref state, don't clear room
2. Visible → Check if intentionally left, check if reconnecting, attempt rejoin
```

#### Intentional Leave (User Clicks "Leave")  
```
1. Set isIntentionallyLeavingRef = true
2. Call API to leave
3. Clear room state
4. Prevents visibility change from triggering reconnect
```

#### Internet Kick (Socket Disconnect)
```
1. Listen for socket disconnect event
2. Log but DON'T clear room state
3. Room stays in state for reconnect attempt
4. When screen comes back to foreground, auto-rejoin
```

#### Page Refresh
```
1. beforeUnload handler checks if in room
2. If yes, calls leaveRoom with intentional=true
3. Clears sessionStorage
4. Prevents orphaned sessions
```

### 3. **Socket Disconnect Handler (NEW)**
Previously missing - now handles:
- `transport close` / `transport error` → Keep room, retry on visibility change
- `io server disconnect` → Server kicked us, log but keep room state  
- Distinguishes between temporary loss and intentional disconnection

## Architecture Diagram

```
Scenarios & Handlers
├── 🔒 Screen Lock
│   └── appIsHiddenRef = true
│       └── Stop reconnect attempts
│       └── Keep sessionStorage entry
│
├── 🔓 Screen Unlock  
│   └── Check isIntentionallyLeavingRef
│   └── Check reconnectInProgressRef (prevent duplicates)
│   └── Check currentRoom state
│   └── Attempt rejoin via joinRoom()
│
├── 🌐 Internet Disconnected (socket:disconnect)
│   └── Log "connection lost"
│   └── DON'T clear room state
│   └── Room stays until:
│       ├── User manually leaves, OR
│       ├── Screen locks (visibility), OR  
│       └── Page refresh
│
├── 🚪 User Clicks "Leave"
│   └── Set isIntentionallyLeavingRef = true
│   └── Call leaveRoom(intentional=true)
│   └── Clear sessionStorage entry
│   └── Clear room state
│   └── Block any reconnect attempts
│
└── 🔄 Page Refresh/Close
    └── beforeUnload checks currentRoom
    └── If in game, leave room (intentional)
    └── Prevent orphaned server-side sessions
```

## Key Behaviors

### Before Fix
- `isProcessing` resets on every effect run → Multiple simultaneous join attempts
- Scatter logic across multiple effects → No coordination → race conditions
- No socket disconnect handler → Unclear what state to maintain
- Screen lock + socket error → Chaos

### After Fix
- `reconnectInProgressRef` persists → Only one join attempt at a time
- Centralized coordination through refs → All scenarios aware of each other
- Socket disconnect handler added → Explicit "keep room in state" logic
- Clear state machine → Each scenario has explicit entry/exit conditions

## Testing Scenarios

✅ **Screen lock during game** → Room persists, rejoin on unlock  
✅ **Internet kicks out** → Socket disconnect, room stays, rejoin on next unlock  
✅ **Click "Leave" button** → Set flag, clear room, no auto-rejoin  
✅ **Page refresh** → beforeUnload calls leaveRoom, clean session  
✅ **Screen lock → Unlock → Socket still reconnecting** → Waits for socket, then joins  
✅ **Multiple rapid lock/unlocks** → Ref flag prevents duplicate attempts  

## Files Modified
- `client/src/contexts/GameContext.tsx` - Core fix with refs, socket handler, leaveRoom flag

## Future Improvements
- Add Redux/Zustand for cleaner state management (currently using Context API)
- Separate game state from connectivity state (room vs game vs socket)
- Add exponential backoff for reconnect attempts
- Add visual indicators for socket status vs room status
