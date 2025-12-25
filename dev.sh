#!/bin/bash
# GnarPuzzle 2.0 Development Scripts

echo "🎮 GnarPuzzle 2.0 Development Helper"
echo "===================================="

case "$1" in
  "setup")
    echo "🔧 Setting up entire project..."
    npm run setup
    ;;
  "dev")
    echo "🚀 Starting development servers (both client and server)..."
    npm run dev
    ;;
  "dev:server")
    echo "🖥️  Starting server in development mode..."
    npm run dev:server
    ;;
  "dev:client")
    echo "📱 Starting client in development mode..."
    npm run dev:client
    ;;
  "build")
    echo "🏗️  Building both client and server..."
    npm run build:all
    ;;
  "start")
    echo "🌟 Starting production servers..."
    npm run start
    ;;
  "db:setup")
    echo "🗄️  Setting up database..."
    npm run db:setup
    ;;
  "db:reset")
    echo "♻️  Resetting database..."
    npm run db:reset
    ;;
  "test")
    echo "🧪 Running all tests..."
    npm run test
    ;;
  "lint")
    echo "🔍 Linting all code..."
    npm run lint
    ;;
  "clean")
    echo "🧹 Cleaning build artifacts..."
    npm run clean
    ;;
  *)
    echo "Available commands:"
    echo "  setup      - Install dependencies and set up project"
    echo "  dev        - Start both client and server in development"
    echo "  dev:server - Start only server in development"
    echo "  dev:client - Start only client in development"
    echo "  build      - Build both client and server"
    echo "  start      - Start production servers"
    echo "  db:setup   - Set up database with migrations and seeds"
    echo "  db:reset   - Reset database completely"
    echo "  test       - Run all tests"
    echo "  lint       - Lint all code"
    echo "  clean      - Clean build artifacts"
    echo ""
    echo "Usage: ./dev.sh [command]"
    echo "Example: ./dev.sh dev"
    ;;
esac