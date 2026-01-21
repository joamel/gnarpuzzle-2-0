# GnarPuzzle 2.0 - Mobile-First Word Game

🎮 **En komplett ombyggnad av GnarPuzzle med mobile-first approach**

## 🎯 Vision

GnarPuzzle 2.0 är en helt ny version av vårt ordpussel-spel, byggd från grunden med fokus på:

- **Mobile-First Design** - Optimerat för touch och små skärmar
- **PWA Technology** - Installera som native app
- **Offline Support** - Spela utan internet
- **Real-time Multiplayer** - Socket.IO för instant gameplay
- **Modern Architecture** - TypeScript, React, och robust backend

## 🏗️ Projektstruktur

```
gnarpuzzle-2-0/
├── docs/                     # Dokumentation och specs
├── server/                   # Node.js backend med Socket.IO
├── client/                   # React PWA frontend
├── shared/                   # Delad kod (types, utils)
└── DEVELOPMENT_CHECKLIST.md  # Utvecklingschecklista
```

## 🚀 Quick Start

**Krav:**
- Node.js 18+
- npm eller yarn
- Git

**Setup:**
```bash
# Klona repo
git clone https://github.com/joamel/gnarpuzzle-2-0.git
cd gnarpuzzle-2-0

# Installera dependencies
npm run install:all

# Starta utvecklingsservrar
npm run dev
```

## 📱 Features

### Core Gameplay
- ✅ 4x4, 5x5, 6x6 spelplaner
- ✅ Svenska ordvalidering
- ✅ Real-time multiplayer (2-6 spelare)
- ✅ 15-sekunders timers för val och placering
- ✅ Smart poängsystem

### Online & Konton
- ✅ Inloggade spelare + gäster (anonyma) stöds
- ✅ Online-statistik räknar både inloggade och gäster (returnerar total + uppdelning)

### Logging (endast i dev)
- ✅ Frontend: tyst som standard (WARN) i dev, opt-in via `localStorage.gnarpuzzle_log_level = debug|info|warn|error`
- ✅ Backend: strukturerad logging med nivåer; använd `LOG_LEVEL=debug` vid felsökning (production default är `info`)

### Mobile Experience
- 📱 Touch-optimerade kontroller
- 📳 Haptic feedback (vibrationer)
- 🔔 Push notifications
- ⚡ Offline gameplay
- 📦 PWA installation

### Technical Stack
- **Frontend**: React 18, TypeScript, Vite
- **Backend**: Node.js, Express, Socket.IO, SQLite (better-sqlite3)
- **Testing**: Vitest, React Testing Library
- **Deployment**: Docker, Railway/Vercel

## 🗂️ Development Phases

Följ `DEVELOPMENT_CHECKLIST.md` för detaljerad utvecklingsplan:

1. **Fas 1**: Projektuppsättning & Database Design
2. **Fas 2**: Backend Foundation (Mobile-Optimized API)
3. **Fas 3**: Mobile-First Frontend Foundation
4. **Fas 4**: Mobile Game Experience
5. **Fas 5**: Mobile-Specific Features
6. **Fas 6**: PWA Features & Offline Support
7. **Fas 7**: Testing & Quality Assurance
8. **Fas 8**: Deployment & Production
9. **Fas 9**: Desktop Polish (Optional)

## 🤝 Contributing

1. Checka ut development checklist
2. Skapa feature branch från `main`
3. Följ code style (ESLint + Prettier)
4. Skriv tester för ny funktionalitet
5. Skapa PR med beskrivning

## 📄 License

MIT License - se `LICENSE` fil för detaljer

## 🎮 Legacy Version

Den ursprungliga versionen finns på: https://github.com/joamel/gnarpuzzle-vite

---

**Start Date**: 25 December 2025  
**Current Phase**: Setup & Planning  
**Next Milestone**: Backend API Foundation  

*"Building the future of mobile word gaming, one commit at a time"* 🚀