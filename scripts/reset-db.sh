#!/bin/bash

# Reset development database
# This script removes the SQLite database file so a fresh one is created on next server start

echo "🗑️  Resetting development database..."

DB_PATH="./server/data/gnarpuzzle.db"

if [ -f "$DB_PATH" ]; then
    rm -f "$DB_PATH"
    echo "✅ Database deleted: $DB_PATH"
    echo "📝 A new database will be created when you start the server"
else
    echo "ℹ️  Database file not found at: $DB_PATH"
    echo "📝 No action needed - a new database will be created on next server start"
fi
