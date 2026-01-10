// Simple test to verify turn logic by creating a game directly in database
const Database = require('better-sqlite3');
const fetch = require('node-fetch');

const API_BASE = 'http://localhost:3001/api';

async function makeRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  const data = await response.json();
  return { status: response.status, data };
}

async function testWithExistingData() {
  const db = new Database('./server/data/gnarpuzzle.db');
  
  try {
    console.log('🧪 Testing turn logic with direct database setup...');
    
    const roomCode = 'TST' + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    
    // 1. Create a room manually
    console.log('📝 Creating test room...');
    const roomResult = db.prepare(`
      INSERT INTO rooms (name, code, max_players, board_size, status, created_by)
      VALUES ('Test Room', ?, 2, 5, 'waiting', 4)
    `).run(roomCode);
    
    const roomId = roomResult.lastInsertRowid;
    console.log('✅ Created room:', roomId);
    
    // 2. Add players to room
    console.log('👥 Adding players to room...');
    db.prepare('INSERT INTO room_members (room_id, user_id) VALUES (?, ?)').run(roomId, 4); // testplayer1
    db.prepare('INSERT INTO room_members (room_id, user_id) VALUES (?, ?)').run(roomId, 5); // testplayer2
    
    // 3. Create a game manually
    console.log('🎮 Creating test game...');
    const gameResult = db.prepare(`
      INSERT INTO games (room_id, state, current_phase, current_turn, turn_number, board_state)
      VALUES (?, 'starting', 'letter_selection', 1, 1, '{}')
    `).run(roomId);
    
    const gameId = gameResult.lastInsertRowid;
    console.log('✅ Created game:', gameId);
    
    // 4. Add players to game
    console.log('👨‍💼 Adding players to game...');
    const gridState = JSON.stringify(Array(5).fill(null).map((_, y) => Array(5).fill(null).map((_, x) => ({ letter: null, x, y }))));
    
    db.prepare(`
      INSERT INTO players (game_id, user_id, position, grid_state, current_letter, placement_confirmed, final_score)
      VALUES (?, ?, ?, ?, NULL, 0, 0)
    `).run(gameId, 4, 1, gridState); // testplayer1 position 1
    
    db.prepare(`
      INSERT INTO players (game_id, user_id, position, grid_state, current_letter, placement_confirmed, final_score)
      VALUES (?, ?, ?, ?, NULL, 0, 0)
    `).run(gameId, 5, 2, gridState); // testplayer2 position 2
    
    console.log('✅ Players added to game');
    
    // 5. Login users and get tokens
    console.log('🔐 Getting auth tokens...');
    const login1 = await makeRequest(`${API_BASE}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ username: 'testplayer1', password: 'test123' })
    });
    
    const login2 = await makeRequest(`${API_BASE}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ username: 'testplayer2', password: 'test123' })
    });
    
    if (login1.status !== 200 || login2.status !== 200) {
      throw new Error('Failed to login players');
    }
    
    const token1 = login1.data.token;
    const token2 = login2.data.token;
    
    // 6. Test letter selection - player 1 should succeed (current_turn = 1)
    console.log('✅ Testing letter selection by player 1 (should work)...');
    const select1 = await makeRequest(`${API_BASE}/games/${gameId}/select-letter`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` },
      body: JSON.stringify({
        playerId: 4, // testplayer1
        letter: 'A'
      })
    });
    
    console.log('Player 1 select result:', select1.status, select1.data);
    
    // 7. Test letter selection - player 2 should fail (not their turn)
    console.log('❌ Testing letter selection by player 2 (should fail)...');
    const select2 = await makeRequest(`${API_BASE}/games/${gameId}/select-letter`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}` },
      body: JSON.stringify({
        playerId: 5, // testplayer2
        letter: 'B'
      })
    });
    
    console.log('Player 2 select result:', select2.status, select2.data);
    
    // 8. Check results
    console.log('\n📊 TURN LOGIC TEST RESULTS:');
    console.log(`✅ Player 1 (position 1, current turn):`, select1.status === 200 ? 'SUCCESS' : 'FAILED');
    console.log(`❌ Player 2 (position 2, not their turn):`, select2.status === 400 ? 'CORRECTLY BLOCKED' : 'SECURITY BREACH!');
    
    if (select1.status === 200 && select2.status === 400) {
      console.log('🎉 TURN LOGIC WORKING CORRECTLY!');
      console.log('The server correctly blocks wrong player from selecting letters.');
    } else {
      console.log('🚨 TURN LOGIC HAS ISSUES!');
      console.log('Expected: Player 1 success (200), Player 2 blocked (400)');
      console.log(`Actual: Player 1 (${select1.status}), Player 2 (${select2.status})`);
    }
    
    // Cleanup
    console.log('🧹 Cleaning up test data...');
    db.prepare('DELETE FROM players WHERE game_id = ?').run(gameId);
    db.prepare('DELETE FROM games WHERE id = ?').run(gameId);
    db.prepare('DELETE FROM room_members WHERE room_id = ?').run(roomId);
    db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
    console.log('✅ Test data cleaned up');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    db.close();
  }
}

testWithExistingData();