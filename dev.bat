@echo off
REM GnarPuzzle 2.0 Development Scripts for Windows

echo 🎮 GnarPuzzle 2.0 Development Helper
echo ====================================

if "%1"=="setup" (
    echo 🔧 Setting up entire project...
    npm run setup
    goto :eof
)

if "%1"=="dev" (
    echo 🚀 Starting development servers (both client and server)...
    npm run dev
    goto :eof
)

if "%1"=="dev:server" (
    echo 🖥️  Starting server in development mode...
    npm run dev:server
    goto :eof
)

if "%1"=="dev:client" (
    echo 📱 Starting client in development mode...
    npm run dev:client
    goto :eof
)

if "%1"=="build" (
    echo 🏗️  Building both client and server...
    npm run build:all
    goto :eof
)

if "%1"=="start" (
    echo 🌟 Starting production servers...
    npm run start
    goto :eof
)

if "%1"=="db:setup" (
    echo 🗄️  Setting up database...
    npm run db:setup
    goto :eof
)

if "%1"=="db:reset" (
    echo ♻️  Resetting database...
    npm run db:reset
    goto :eof
)

if "%1"=="test" (
    echo 🧪 Running all tests...
    npm run test
    goto :eof
)

if "%1"=="lint" (
    echo 🔍 Linting all code...
    npm run lint
    goto :eof
)

if "%1"=="clean" (
    echo 🧹 Cleaning build artifacts...
    npm run clean
    goto :eof
)

echo Available commands:
echo   setup      - Install dependencies and set up project
echo   dev        - Start both client and server in development
echo   dev:server - Start only server in development
echo   dev:client - Start only client in development
echo   build      - Build both client and server
echo   start      - Start production servers
echo   db:setup   - Set up database with migrations and seeds
echo   db:reset   - Reset database completely
echo   test       - Run all tests
echo   lint       - Lint all code
echo   clean      - Clean build artifacts
echo.
echo Usage: dev.bat [command]
echo Example: dev.bat dev