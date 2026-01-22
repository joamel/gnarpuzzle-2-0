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

### 9.0 P0/P1 – Buggar & måste-fixar

#### P0 (högsta prioritet)
- [ ] **BUG: Ready-status syncar inte stabilt i lobby**
	- Symptom: När en spelare togglar “redo” uppdateras inte andra klienter (ibland krävs flera försök/refresh/rejoin innan start går).
	- Impact: Blockerar start av spel → **måste fixas**.
	- Repro (förslag):
		- Skapa rum på en telefon + anslut 1–2 andra klienter
		- Toggla redo/inte redo snabbt, byt nät (WiFi/4G), låt en klient gå i bakgrunden/återvänd
		- Observera om “alla redo” och UI-indikatorer divergerar mellan klienter
	- Acceptans:
		- Alla clients ser samma ready-state inom < 250ms under normal latency
		- Efter reconnect ska klienten alltid synka korrekt state utan manuell refresh
		- Start-knappen ska aldrig låsas p.g.a. stale ready-state

#### P1
- [ ] **Svensk tid för “Senast spelat” (GMT+1 / Europe/Stockholm)**
	- Beslut: Visa alltid tid i **Europe/Stockholm** (inte serverns timezone).
	- Förslag på lösning: Server returnerar timestamp i ISO 8601 (UTC, t.ex. `2026-01-22T13:37:00Z`) och client formaterar med `Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' })`.
	- Acceptans: “Senast spelat” matchar svensk lokal tid även om server kör UTC.

### 9.5 Rooms – Moderation & regler
- [ ] **Kick-funktion (spelledare/room owner)**
	- Endast room creator (eller admin) kan kicka.
	- Kick ska funka både i lobby och under spel (definiera policy: auto-walkover/abandon?).
	- Acceptans: Kickad spelare lämnar rummet direkt, får tydligt meddelande, kan ev. re-join om room inte är låst.

- [ ] **Rate limit: skapa rum max 1 per användare per 5 min (eller max 1 aktivt rum)**
	- En användare ska inte kunna skapa flera rum i snabb följd.
	- Förslag: 
		- Antingen: “max 1 aktivt rum” per user
		- Eller: “cooldown 5 min” på create-room endpoint
	- Acceptans: UI visar begripligt fel (och ev. nedräkning) om användaren försöker skapa för tidigt.

- [ ] **Auto-städa tomma rum snabbt**
	- Rum utan deltagare ska försvinna efter t.ex. 5 min.
	- Definiera “tomt”: inga room_members (inkl creator om den lämnade).
	- Acceptans: Tomma rum tas bort utan att störa aktiva rum; listan uppdateras i realtid.

### 9.6 Lobby UX – mobil
- [ ] **Start-knapp alltid synlig på mobil (ingen scroll för att starta)**
	- Förslag: gör start-CTA + “redo-status sammanfattning” sticky/absolute nere till höger (eller sticky footer).
	- Acceptans: På 360×640 (typisk mobil) syns start-knapp + redo-indikator alltid.

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
