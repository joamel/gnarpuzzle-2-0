# 🚀 GnarPuzzle 2.0 Development Scripts

Enkla kommandon för att köra utvecklingsservrar och bygga projektet från root-mappen.

## 📋 Snabbkommandon från Root-mappen

### 🔧 Utveckling (Development)

```bash
# Starta båda servrar samtidigt (rekommenderat för utveckling)
npm run dev

# Starta endast backend server
npm run dev:server

# Starta endast frontend client  
npm run dev:client
```

### 🏗️ Byggning (Build)

```bash
# Bygga hela projektet
npm run build:all

# Bygga endast server
npm run build:server  

# Bygga endast client
npm run build:client
```

### 🌟 Produktion (Production)

```bash
# Starta båda produktionsservrar
npm run start

# Starta endast produktionsserver
npm run start:server

# Starta endast produktionsklient
npm run start:client
```

### 🗄️ Database Management

```bash
# Sätt upp databas med migrations och seed data
npm run db:setup

# Kör migrations
npm run db:migrate

# Rulla tillbaka senaste migration
npm run db:rollback

# Återställ databas helt
npm run db:reset

# Seed data
npm run db:seed
```

### 🧪 Test & Quality

```bash
# Kör alla tester
npm run test

# Kör server-tester
npm run test:server

# Kör client-tester  
npm run test:client

# Linta all kod
npm run lint
```

### 🛠️ Setup & Maintenance

```bash
# Fullständig projektsetup (körs en gång)
npm run setup

# Installera alla dependencies
npm run install:all

# Rensa build artifacts
npm run clean
```

## 🖥️ Platform-Specifika Scripts

### Windows PowerShell
```powershell
.\dev.ps1 dev         # Starta utvecklingsservrar
.\dev.ps1 dev:server  # Endast server
.\dev.ps1 build       # Bygga projektet
.\dev.ps1             # Visa alla kommandon
```

### Windows Command Prompt
```cmd
dev.bat dev         # Starta utvecklingsservrar
dev.bat dev:server  # Endast server
dev.bat build       # Bygga projektet
dev.bat             # Visa alla kommandon
```

### Linux/macOS
```bash
./dev.sh dev         # Starta utvecklingsservrar
./dev.sh dev:server  # Endast server
./dev.sh build       # Bygga projektet
./dev.sh             # Visa alla kommandon
```

## 🔧 Utvecklingsflow

1. **Första gången:**
   ```bash
   npm run setup
   ```

2. **Daglig utveckling:**
   ```bash
   npm run dev
   ```

3. **Före commit:**
   ```bash
   npm run lint
   npm run test
   ```

4. **Production build:**
   ```bash
   npm run build:all
   npm run start
   ```

## 📂 Port Mapping

- **Frontend (Client)**: http://localhost:5173
- **Backend (Server)**: http://localhost:3001
  - **API**: http://localhost:3001/api/*
  - **Health Check**: http://localhost:3001/api/health
- **Socket.IO**: ws://localhost:3001

## 🎯 Features

- ✅ **Hot Reloading**: Både server och client reloadar automatiskt vid ändringar
- ✅ **Parallel Execution**: Kör båda servrar samtidigt med `concurrently` 
- ✅ **TypeScript Support**: Full TypeScript-kompilering och watching
- ✅ **Database Management**: Enkla kommandon för migration och seeding
- ✅ **Cross-Platform**: Fungerar på Windows, macOS och Linux
- ✅ **Mobile-First**: CORS och optimizationer för mobil utveckling

Nu slipper du navigera mellan mappar - allt körs från root! 🚀