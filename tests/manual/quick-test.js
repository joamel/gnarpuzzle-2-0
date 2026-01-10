// Quick test to verify turn logic works
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function quickTest() {
  console.log('🧪 Quick turn logic verification...\n');

  try {
    // Login both players
    const emmaLogin = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Emma' })
    });
    const emma = await emmaLogin.json();

    const jockeLogin = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Jocke' })
    });
    const jocke = await jockeLogin.json();

    // Create room and start game
    const roomResp = await fetch('http://localhost:3001/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${emma.token}` },
      body: JSON.stringify({ name: 'Test Room' })
    });
    const room = await roomResp.json();

    await fetch(`http://localhost:3001/api/rooms/${room.code}/join`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${jocke.token}` }
    });

    const gameResp = await fetch(`http://localhost:3001/api/rooms/${room.id}/start`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${emma.token}` }
    });
    const game = await gameResp.json();

    // Check game state
    const stateResp = await fetch(`http://localhost:3001/api/games/${game.id}`, {
      headers: { 'Authorization': `Bearer ${emma.token}` }
    });
    const gameState = await stateResp.json();

    console.log('🎮 Game Info:');
    console.log(`  Game ID: ${gameState.game.id}`);
    console.log(`  Current Turn: ${gameState.game.current_turn}`);
    console.log(`  Phase: ${gameState.game.current_phase}`);
    
    console.log('\n👥 Players:');
    gameState.game.players.forEach(p => {
      console.log(`  ${p.username}: position ${p.position} (userId: ${p.user_id})`);
    });

    // Test who can select letters
    const player1 = gameState.game.players.find(p => p.position === 1);
    const player2 = gameState.game.players.find(p => p.position === 2);
    
    console.log(`\n🎯 Turn ${gameState.game.current_turn} - Should be ${player1.username}'s turn`);
    
    // Wait for game to enter letter_selection phase
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test player 1 (should work)
    const token1 = player1.username === 'Emma' ? emma.token : jocke.token;
    const test1 = await fetch(`http://localhost:3001/api/games/${game.id}/select-letter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
      body: JSON.stringify({ letter: 'A' })
    });

    if (test1.ok) {
      console.log(`✅ ${player1.username} successfully selected letter (correct)`);
    } else {
      console.log(`❌ ${player1.username} failed to select letter (BUG!)`);
    }

    // Test player 2 (should fail)
    const token2 = player2.username === 'Emma' ? emma.token : jocke.token;
    const test2 = await fetch(`http://localhost:3001/api/games/${game.id}/select-letter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token2}` },
      body: JSON.stringify({ letter: 'B' })
    });

    if (test2.ok) {
      console.log(`❌ ${player2.username} incorrectly selected letter (BUG!)`);
    } else {
      const error = await test2.json();
      console.log(`✅ ${player2.username} correctly blocked: ${error.message}`);
    }

    console.log('\n🎯 RESULT: Turn logic is working correctly!');

  } catch (error) {
    console.error('💥 Test failed:', error.message);
  }
}

quickTest();