// Comprehensive test of the turn logic fix
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const BASE_URL = 'http://localhost:3001';

async function testTurnLogic() {
  console.log('🧪 Testing turn logic after fix...\n');

  try {
    // Step 1: Login as Emma
    console.log('1️⃣ Logging in as Emma...');
    const loginResponse1 = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Emma' })
    });
    const emma = await loginResponse1.json();
    console.log('✅ Emma logged in:', { username: emma.user.username, token: emma.token.substring(0, 20) + '...' });

    // Step 2: Login as Jocke
    console.log('\n2️⃣ Logging in as Jocke...');
    const loginResponse2 = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Jocke' })
    });
    const jocke = await loginResponse2.json();
    console.log('✅ Jocke logged in:', { username: jocke.user.username, token: jocke.token.substring(0, 20) + '...' });

    // Step 3: Emma creates a room
    console.log('\n3️⃣ Emma creates a room...');
    const roomResponse = await fetch(`${BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${emma.token}`
      },
      body: JSON.stringify({ name: 'Turn Logic Test Room' })
    });
    const room = await roomResponse.json();
    console.log('✅ Room created:', { id: room.id, code: room.code, name: room.name });

    // Step 4: Jocke joins the room
    console.log('\n4️⃣ Jocke joins the room...');
    const joinResponse = await fetch(`${BASE_URL}/api/rooms/${room.code}/join`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${jocke.token}`
      }
    });
    const joinResult = await joinResponse.json();
    console.log('✅ Jocke joined room:', { success: joinResult.success });

    // Step 5: Emma starts the game
    console.log('\n5️⃣ Emma starts the game...');
    const gameResponse = await fetch(`${BASE_URL}/api/rooms/${room.id}/start`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${emma.token}`
      }
    });
    const game = await gameResponse.json();
    console.log('✅ Game started:', { id: game.id, phase: game.phase });

    // Step 6: Get game state to check turn logic
    console.log('\n6️⃣ Getting game state...');
    const gameStateResponse = await fetch(`${BASE_URL}/api/games/${game.id}`, {
      headers: { 'Authorization': `Bearer ${emma.token}` }
    });
    const gameState = await gameStateResponse.json();
    console.log('🎮 Game state:', {
      id: gameState.game.id,
      currentTurn: gameState.game.current_turn,
      currentPhase: gameState.game.current_phase,
      playerCount: gameState.game.players.length
    });

    // Step 7: Check player positions
    console.log('\n7️⃣ Checking player positions...');
    gameState.game.players.forEach((player, index) => {
      console.log(`   Player ${index + 1}: ${player.username} (position: ${player.position}, userId: ${player.user_id})`);
    });

    // Step 8: Test turn logic
    console.log('\n8️⃣ Testing turn logic...');
    const currentTurnPlayer = gameState.game.players.find(p => p.position === gameState.game.current_turn);
    const otherPlayer = gameState.game.players.find(p => p.position !== gameState.game.current_turn);
    
    console.log('🎯 Current turn logic:');
    console.log(`   Current turn: ${gameState.game.current_turn}`);
    console.log(`   Should be ${currentTurnPlayer?.username}'s turn (position ${currentTurnPlayer?.position})`);
    console.log(`   ${otherPlayer?.username} should wait (position ${otherPlayer?.position})`);

    // Step 9: Try letter selection for current player (should work)
    console.log('\n9️⃣ Testing letter selection for current player...');
    const currentPlayerToken = currentTurnPlayer?.username === 'Emma' ? emma.token : jocke.token;
    try {
      const selectResponse = await fetch(`${BASE_URL}/api/games/${game.id}/select-letter`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentPlayerToken}`
        },
        body: JSON.stringify({ letter: 'A' })
      });
      
      if (selectResponse.ok) {
        console.log(`✅ ${currentTurnPlayer?.username} successfully selected letter A (correct - it's their turn)`);
      } else {
        const error = await selectResponse.json();
        console.log(`❌ ${currentTurnPlayer?.username} failed to select letter: ${error.message}`);
      }
    } catch (error) {
      console.log(`❌ Error testing current player: ${error.message}`);
    }

    // Step 10: Try letter selection for other player (should fail)
    console.log('\n🔟 Testing letter selection for other player...');
    const otherPlayerToken = otherPlayer?.username === 'Emma' ? emma.token : jocke.token;
    try {
      const selectResponse2 = await fetch(`${BASE_URL}/api/games/${game.id}/select-letter`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${otherPlayerToken}`
        },
        body: JSON.stringify({ letter: 'B' })
      });
      
      if (selectResponse2.ok) {
        console.log(`❌ ${otherPlayer?.username} incorrectly selected letter B (BUG - it's not their turn!)`);
      } else {
        const error = await selectResponse2.json();
        console.log(`✅ ${otherPlayer?.username} correctly blocked from selecting letter: ${error.message}`);
      }
    } catch (error) {
      console.log(`✅ Other player correctly blocked: ${error.message}`);
    }

    console.log('\n🎯 Turn logic test completed!');
    console.log('Expected results:');
    console.log('  ✅ Current turn player can select letters');
    console.log('  ✅ Other player is blocked from selecting letters');

  } catch (error) {
    console.error('💥 Test failed:', error.message);
  }
}

testTurnLogic();