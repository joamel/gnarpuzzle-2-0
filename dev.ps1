# GnarPuzzle 2.0 Development PowerShell Scripts

param(
    [Parameter(Position=0)]
    [string]$Command = "help"
)

Write-Host "🎮 GnarPuzzle 2.0 Development Helper" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

switch ($Command.ToLower()) {
    "setup" {
        Write-Host "🔧 Setting up entire project..." -ForegroundColor Yellow
        npm run setup
    }
    "dev" {
        Write-Host "🚀 Starting development servers..." -ForegroundColor Green
        npm run dev
    }
    "dev:server" {
        Write-Host "🖥️  Starting server in development mode..." -ForegroundColor Blue
        npm run dev:server
    }
    "dev:client" {
        Write-Host "📱 Starting client in development mode..." -ForegroundColor Magenta
        npm run dev:client
    }
    "build" {
        Write-Host "🏗️  Building both client and server..." -ForegroundColor Yellow
        npm run build:all
    }
    "start" {
        Write-Host "🌟 Starting production servers..." -ForegroundColor Green
        npm run start
    }
    "start:server" {
        Write-Host "🖥️  Starting production server..." -ForegroundColor Blue
        npm run start:server
    }
    "db:setup" {
        Write-Host "🗄️  Setting up database..." -ForegroundColor Cyan
        npm run db:setup
    }
    "test" {
        Write-Host "🧪 Running all tests..." -ForegroundColor Yellow
        npm run test
    }
    default {
        Write-Host "Available commands:"
        Write-Host "  setup      - Install dependencies and set up project"
        Write-Host "  dev        - Start both client and server in development"
        Write-Host "  dev:server - Start only server in development"  
        Write-Host "  dev:client - Start only client in development"
        Write-Host "  build      - Build both client and server"
        Write-Host "  start      - Start production servers"
        Write-Host "  start:server - Start only production server"
        Write-Host "  db:setup   - Set up database"
        Write-Host "  test       - Run all tests"
        Write-Host ""
        Write-Host "Usage: .\dev.ps1 [command]"
        Write-Host "Example: .\dev.ps1 dev:server"
    }
}