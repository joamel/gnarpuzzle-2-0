# GnarPuzzle - Kodgranskning & Optimeringsförslag

## 📋 Checklista Status Sammanfattning

### ✅ FÄRDIG (Phase 8 - Deployment & Production)
- **Core Gameplay**: Multiplayer turn-based system, scoring, timers
- **UI/UX**: Mobile-first responsive design, all screens functional
- **Ready Status Sync**: 3-layer system (API + Socket + Client listeners)
- **Component Refactoring**: RoomLobby split into 3 focused components (PlayersList, RoomSettings, TipsModal)
- **Performance**: Code splitting, lazy loading, Socket optimization with exponential backoff
- **Database**: 6 migrations, all CRUD operations, room cleanup service
- **Deployment**: Live on Render, all 59 tests passing
- **Branding**: Favicon implemented with GnarPuzzle logo

### 🔧 ONÖDIGA useEffects & DUBBLETTER

#### RoomLobby.tsx - **5 useEffects, flera är redundanta**

**PROBLEM #1: Dual player list sync**
```
useEffect #1 (line 72): Initialize readyPlayers from API 
useEffect #2 (line 91): Socket room join + readyPlayers sync
useEffect #3 (line 138): Initial player list setup (adds self + API fetch)
useEffect #4 (line 198): Member joined/left listeners
useEffect #5 (line 256): Re-sync readyPlayers when playerList changes
```

**ISSUE**: useEffect #5 är helt onödig! Den gör API-anrop när playerList ändras, men:
- readyPlayers synkas redan från socket events (useEffect #2)
- readyPlayers synkas redan från room:member_joined event (useEffect #4)
- Skapar extra API-trafik och race conditions

**LÖSUNG**: **Ta bort useEffect #5 helt** - readyPlayers uppdateras redan korrekt från sockets

---

**PROBLEM #2: Dual API fetches vid room change**
```
useEffect #3 har TWO API calls:
1. getRoomByCode() direkt från hook
2. getRoomByCode() INUTI if-statement
```

**ISSUE**: getRoomByCode anropas TWO GÅNGER när room byts
- Första anropet startar omedelbart
- Andra anropet körs inuti if-statement med samma data

**LÖSUNG**: Konsolidera till EN API-fetch:
```tsx
useEffect(() => {
  if (currentRoom?.code) {
    apiService.getRoomByCode(currentRoom.code)
      .then(data => {
        if (data?.room?.members?.length > 0) {
          // Update both playerList AND readyPlayers här
          const members = data.room.members.map(m => ({...}));
          setPlayerList(members);
          
          // ALSO extract ready status här
          const ready = new Set<string>();
          data.room.players?.forEach(p => {
            if (p.ready) ready.add(String(p.userId));
          });
          setReadyPlayers(ready);
        }
      });
  }
}, [currentRoom?.code]);
```

---

**PROBLEM #3: Socket listeners registered multiple times**
```
useEffect #4 (line 198) registrerar:
- room:member_joined
- room:member_left

useEffect #2 (line 91) registrerar:
- room:joined  ✅ OK
- player:ready_changed  ✅ OK
```

**ISSUE**: `handleMemberJoined` i useEffect #4 anropar `getRoomByCode` för member_joined
- Men member_joined redan innehåller room.members i data!
- onödig API-fetch när data redan är där

**LÖSUNG**: Använd socket event data direkt, skippa API-anrop för member_joined

---

#### HomePage.tsx - **4 useEffects, 1 är potentiellt onödig**

**ISSUE**: 4 useEffects utan tydlig vy av varför alla är nödvändiga
- useEffect #1 (line 43): Fetch rooms
- useEffect #2 (line 52): Fetch user stats
- useEffect #3 (line 62): Setup socket listeners
- useEffect #4 (line 73): Fetch recent games

**FRÅGA**: Kan #1 och #4 kombineras? (båda fetch från API vid mount)

---

#### GameContext.tsx - **3 useEffects**

**ISSUE**: useEffect #2 (line 97) kör `joinRoom` varje gång currentRoomCode ändras
- Men där finns redan en socket listener setup
- Potentiell dubbel-join risk?

---

## 🎯 Optimeringsrekommendationer

### HÖGSTA PRIORITET - Quick Wins

**1. Ta bort RoomLobby.tsx useEffect #5 (line 256)** ⭐
   - Helt redundant
   - Skapar onödiga API-anrop
   - Kan orsaka race conditions
   - **Estimated fix time**: 2 min

**2. Konsolidera RoomLobby initial fetch** ⭐⭐
   - Slå ihop useEffect #3 och API-duplett
   - One fetch per room change
   - Include ready status i samma anrop
   - **Estimated fix time**: 5 min

**3. Skippa API-fetch för member_joined** ⭐⭐
   - Använd socket event data direkt
   - Data är redan komplett
   - Spara bandwidth
   - **Estimated fix time**: 3 min

### MEDIUM PRIORITET

**4. Review HomePage useEffects**
   - Kombinera relaterade fetches?
   - Prevent simultaneous requests?
   - **Estimated fix time**: 10 min

**5. Förenkla ready status sync**
   - Kolla om vi behöver både socket events OCH API
   - Socket events bör räcka
   - **Estimated fix time**: 5 min

---

## 📊 Aktuell Status per Fil

| Fil | useEffects | Optimeringsmöjligheter |
|-----|-----------|------------------------|
| RoomLobby.tsx | 5 | ⭐⭐⭐ Remove 1, consolidate 2 |
| HomePage.tsx | 4 | ⭐⭐ Review & potentially combine |
| GameContext.tsx | 3 | ⭐⭐ Check for double-join |
| GameInterface.tsx | 2 | ✅ OK |
| GamePage.tsx | 1 | ✅ OK |
| GameResultBoard.tsx | 2 | ✅ OK |
| AuthContext.tsx | 1 | ✅ OK |
| App.tsx | 2 | ✅ OK |

---

## 🎯 Nästa Steg

1. **Högsta prioritet fixes** (10 min total)
   - [ ] Ta bort RoomLobby useEffect #5
   - [ ] Konsolidera initial room fetch
   - [ ] Skip API för member_joined

2. **Testing efter fixes**
   - [ ] Verifiera playerList uppdateras korrekt
   - [ ] Verifiera readyPlayers synkas
   - [ ] Checka DevTools Network-tab för API-anrop

3. **Medium prioritet** (efter main fixes)
   - [ ] Review HomePage effects
   - [ ] Förenkling av ready-status logik

---

## ✅ Redan Bra Implementerat

- ✅ RoomLobby refactoring (3 komponenter istället för 546 rader)
- ✅ Ready status 3-layer sync (fungerar väl)
- ✅ Socket event listeners med proper cleanup
- ✅ Type safety och error handling
- ✅ Logging för debugging
- ✅ Component separation of concerns

**Bara några små optimeringar kvar!**
