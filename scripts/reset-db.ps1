# Reset development database
# This script removes the SQLite database file so a fresh one is created on next server start

Write-Host "Resetting development database..." -ForegroundColor Yellow

# Kill any running Node processes first
Write-Host "Stopping any running Node processes..." -ForegroundColor Cyan
Get-Process | Where-Object {$_.ProcessName -match "node|tsx"} | ForEach-Object { 
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2

# Get the root directory of the project (parent of scripts directory)
$repoRoot = Split-Path -Parent $PSScriptRoot
$dbPath = Join-Path $repoRoot "server\data\gnarpuzzle.db"

Write-Host "Database path: $dbPath" -ForegroundColor Gray

if (Test-Path $dbPath) {
    try {
        Remove-Item $dbPath -Force -ErrorAction Stop
        Write-Host "SUCCESS: Database deleted!" -ForegroundColor Green
        Write-Host "A new database will be created when you start the server" -ForegroundColor Cyan
    } catch {
        Write-Host "ERROR: Could not delete database: $_" -ForegroundColor Red
    }
} else {
    Write-Host "Database file not found at: $dbPath" -ForegroundColor Yellow
    Write-Host "No action needed - a new database will be created on next server start" -ForegroundColor Cyan
}
