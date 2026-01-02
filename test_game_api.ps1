# Test script to simulate two players playing the game

$baseUrl = "http://localhost:3001/api"

Write-Host "🎮 Starting GnarPuzzle API test..."

# Step 1: Create room
try {
    $room = Invoke-RestMethod -Uri "$baseUrl/rooms" -Method POST -ContentType "application/json" -Body '{"name":"API Test Room","maxPlayers":2}'
    Write-Host "✅ Created room - ID: $($room.id), Code: $($room.roomCode)"
    $roomId = $room.id
} catch {
    Write-Host "❌ Failed to create room: $_"
    exit 1
}

# Step 2: Join room as player 1 (userId: 1)
try {
    $join1 = Invoke-RestMethod -Uri "$baseUrl/rooms/$roomId/join" -Method POST -ContentType "application/json" -Body '{"userId":1,"userName":"Player1"}'
    Write-Host "✅ Player 1 joined room"
} catch {
    Write-Host "❌ Player 1 failed to join: $_"
    exit 1
}

# Step 3: Join room as player 2 (userId: 2)
try {
    $join2 = Invoke-RestMethod -Uri "$baseUrl/rooms/$roomId/join" -Method POST -ContentType "application/json" -Body '{"userId":2,"userName":"Player2"}'
    Write-Host "✅ Player 2 joined room"
} catch {
    Write-Host "❌ Player 2 failed to join: $_"
    exit 1
}

# Step 4: Start game
try {
    $start = Invoke-RestMethod -Uri "$baseUrl/rooms/$roomId/start" -Method POST -ContentType "application/json" -Body '{}'
    Write-Host "✅ Game started - Game ID: $($start.gameId)"
    $gameId = $start.gameId
} catch {
    Write-Host "❌ Failed to start game: $_"
    exit 1
}

Write-Host "🎯 Game setup complete. Game ID: $gameId, Room ID: $roomId"
Write-Host "🔍 Now check the server logs for game phases and letter distribution..."

# Wait a bit and then check game state
Start-Sleep 2

try {
    $gameState = Invoke-RestMethod -Uri "$baseUrl/games/$gameId" -Method GET
    Write-Host "📊 Current game phase: $($gameState.phase)"
} catch {
    Write-Host "⚠️ Could not fetch game state: $_"
}

Write-Host "🚀 Test completed. Check server logs for detailed behavior."