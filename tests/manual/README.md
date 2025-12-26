# Manual Testing

Detta directory innehåller manuella test-verktyg för att validera systemfunktionalitet.

## 🧪 Test Files

### `test-multiplayer.html` 
**Komplett multiplayer test-interface**
- Testa två spelare samtidigt i samma webbläsare
- Validera Socket.IO real-time events
- End-to-end multiplayer flow (login → create room → join → sync)

**Användning:**
```bash
# Starta servern
npm run dev

# Öppna test-sidan
Start-Process tests/manual/test-multiplayer.html
```

### `test-socket.js`
**Socket.IO anslutningstest**
- Testa Socket.IO authentication med giltig JWT token
- Validera WebSocket-anslutning och events

**Användning:**
```bash
# Kräver Node.js och socket.io-client
npm install socket.io-client
node tests/manual/test-socket.js
```

### `test-auth.html`
**Authentication test-interface**
- Testa login API direkt i webbläsare
- Socket.IO authentication debugging

## 🚀 Kör alla tester

1. **Starta servern med rätt JWT secret:**
   ```bash
   $env:JWT_SECRET = 'test-secret-key'; npm run dev
   ```

2. **Öppna multiplayer-testsidan:**
   ```bash
   Start-Process tests/manual/test-multiplayer.html
   ```

3. **Testa flödet:**
   - Login Player 1 & Player 2
   - Skapa rum med Player 1
   - Se att Player 2 ser rummet automatiskt
   - Player 2 går med i rummet
   - Validera att båda ser varandras medlemskap real-time

## ✅ Expected Results

- Socket.IO authentication lyckas för båda spelare
- Real-time room updates mellan användare
- Medlems-synkronisering fungerar direkt utan refresh
- Alla events loggas i "Real-time Logs" sektionen