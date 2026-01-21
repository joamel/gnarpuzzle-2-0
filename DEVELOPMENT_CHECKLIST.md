# GnarPuzzle – Utvecklingschecklista (condensed)

Den här filen är en **ren checklista** för fortsatt utveckling.
Den äldre, mer utförliga versionen (med historik/anteckningar) finns i: `docs/DEVELOPMENT_CHECKLIST_ARCHIVE.md`.

## 📍 Status
- **Release**: v2.1.0 (LIVE)
- **Tester (senast lokalt)**: **157 passed | 22 skipped** (expected)
- **Nästa steg**: Fas 9 – Post-release förbättringar (optional)

## ✅ Fas 1–8 (klart)
Målet här är att lista *vad som finns* på hög nivå – detaljer finns i koden och i arkivet.

### 📋 Fas 1: Projektuppsättning & Databas ✅
- [x] Repo-struktur (`server/`, `client/`, `shared/`, `docs/`)
- [x] TypeScript + scripts för dev/build/test
- [x] SQLite (better-sqlite3) + migrations + seed

### 🔧 Fas 2: Backend Foundation ✅
- [x] Express API + Socket.IO
- [x] Auth (inkl. gäster/anonyma) + JWT
- [x] Rooms: lista/skapa/join/leave/start game
- [x] GameStateService + core socket events

### 📱 Fas 3: Frontend Foundation ✅
- [x] React app shell + routing
- [x] Room list/lobby + real-time updates
- [x] PWA grund (manifest + service worker registrering)

### 🎮 Fas 4: Spelupplevelse ✅
- [x] Letter selection + placement + timers
- [x] Resultatskärm/leaderboard
- [x] Stabil leave/reconnect-flow

### 📳 Fas 5: Mobile/Performance ✅
- [x] Code splitting / lazy loading
- [x] Socket reconnect backoff + cleanup
- [ ] Haptics / gestures (valfritt)

### 🌐 Fas 6: PWA & Offline (valfritt / delvis)
- [x] PWA manifest + service worker registrering
- [ ] Offline-first gameplay (IndexedDB persistence + sync)
- [ ] Background sync / konfliktlösning

### 🧪 Fas 7: Testing & QA ✅
- [x] Vitest (client + server)
- [x] Race condition test suite

### 🚀 Fas 8: Deployment & Production ✅
- [x] Render deploy (server + client)
- [x] Dokumentation för deploy

## ⚠️ Kända begränsningar (förväntade test-skips)
- [ ] `server/src/tests/config/database.test.ts` – real SQLite/migrations gör isolation svår (skippad)
- [ ] `server/src/tests/integration/sqlite.test.ts` – migration conflicts / singleton state (skippad)

## 🧭 Fas 9: Post-release förbättringar (NEXT, optional)

### 9.1 Logging & Observability
- [ ] Sentry (client + server) eller motsvarande error tracking
- [ ] Produktions-metadata i loggar (requestId, userId när möjligt)
- [ ] Dokumentera rekommenderade nivåer: `LOG_LEVEL=info|warn|error` i prod

### 9.2 PWA / Offline (först om det behövs)
- [ ] Spara game state i IndexedDB
- [ ] Queue actions offline + sync online
- [ ] UI för offline-status + recovery

### 9.3 Mobile UX
- [ ] Haptic feedback vid viktiga events
- [ ] Tillgänglighet (screen reader/keyboard)

### 9.4 Desktop/Tablet polish (valfritt)
- [ ] Tablet layout
- [ ] Keyboard navigation / shortcuts

## 🎮 Fas 10: Future (om ni vill)
- [ ] Custom game modes
- [ ] Social features (friends, leaderboards)
