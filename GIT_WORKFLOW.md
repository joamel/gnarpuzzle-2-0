# Git Workflow Guide - GnarPuzzle

## 🏷️ Version v1.0.0-alpha Released!

Vi har nu en stabil grund med multiplayer funktionalitet. Första versionen är taggad som `v1.0.0-alpha`.

## 🌊 Branch Strategy

### Main Branches
- **`main`** - Production-ready kod, endast merge från develop
- **`develop`** - Integration branch för nya features

### Feature Branches
```bash
# Skapa ny feature branch från develop
git checkout develop
git pull origin develop
git checkout -b feature/socket-reconnection-handling

# Arbeta på feature...

# När klar, merge till develop
git checkout develop
git merge feature/socket-reconnection-handling
git branch -d feature/socket-reconnection-handling
```

## 📋 Nästa Prioriterade Features

Baserat på DEVELOPMENT_CHECKLIST.md:

### 🔴 Kritiska för Production
1. **feature/socket-reconnection** - Grace period vid disconnect
2. **feature/room-cleanup-service** - Smart cleanup utan för aggressiv removal
3. **feature/production-config** - Proper environment configuration

### 🟡 Förbättringar
4. **feature/game-end-logic** - Proper game completion detection
5. **feature/word-validation** - Swedish dictionary integration  
6. **feature/scoring-system** - Points calculation and leaderboard
7. **feature/pwa-offline** - Offline support och caching

## 📦 Version Strategy
- **Alpha** (v1.0.0-alpha) - Core multiplayer functionality
- **Beta** (v1.0.0-beta) - Production-ready with all critical fixes
- **Release** (v1.0.0) - Full feature set med PWA support

## 🚀 Release Process
1. Feature utveckling på feature branches
2. Merge till `develop` för integration testing
3. När develop är stabil → merge till `main`  
4. Tag nya versioner på `main`
5. Deploy från tagged versions

## 🔄 Current Status
- **v1.0.0-alpha**: ✅ Released - Stabil multiplayer grund
- **Next**: Socket reconnection och cleanup service fixes