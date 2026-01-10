// Test script to verify turn logic works correctly
const https = require('https');
const http = require('http');
const { URL } = require('url');

const API_BASE = 'http://localhost:3001/api';

// Test users
const user1 = { username: 'testplayer1', password: 'test123' };
const user2 = { username: 'testplayer2', password: 'test123' };

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const req = client.request(reqOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: parsed });
        } catch (err) {
          resolve({ status: res.statusCode, data: { error: 'Invalid JSON', raw: data } });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

async function testTurnLogic() {
  try {
    console.log('🧪 Testing turn logic...');
    
    // 1. Register and login users
    console.log('📝 Registering users...');
    await makeRequest(`${API_BASE}/auth/register`, {
      method: 'POST',
      body: JSON.stringify(user1)
    });
    
    await makeRequest(`${API_BASE}/auth/register`, {
      method: 'POST',
      body: JSON.stringify(user2)
    });
    
    // Login users
    console.log('🔐 Logging in users...');
    const login1 = await makeRequest(`${API_BASE}/auth/login`, {
      method: 'POST',
      body: JSON.stringify(user1)
    });
    
    const login2 = await makeRequest(`${API_BASE}/auth/login`, {
      method: 'POST',
      body: JSON.stringify(user2)
    });
    
    console.log('Login1 response:', login1.status, login1.data);
    console.log('Login2 response:', login2.status, login2.data);
    
    const token1 = login1.data.token;
    const token2 = login2.data.token;
    
    if (!token1 || !token2) {
      throw new Error(`Failed to get tokens: token1=${!!token1}, token2=${!!token2}`);
    }
    
    console.log('✅ Users logged in successfully');
    
    // 2. Create a room
    console.log('🏠 Creating room...');
    const roomResult = await makeRequest(`${API_BASE}/rooms`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` },
      body: JSON.stringify({
        name: 'Turn Test Room',
        max_players: 2,
        board_size: 5,
        turn_duration: 60,
        settings: {
          letter_timer: 10,
          placement_timer: 20,
          is_private: false
        }
      })
    });
    
    console.log('Room creation response:', roomResult.status, roomResult.data);
    const room = roomResult.data.room;
    console.log('✅ Room created:', room.code);
    
    // 3. Join room with second player
    console.log('👥 Player 2 joining room...');
    await makeRequest(`${API_BASE}/rooms/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}` },
      body: JSON.stringify({ code: room.code })
    });
    
    console.log('✅ Player 2 joined');
    
    // 4. Start game
    console.log('🎮 Starting game...');
    const startResult = await makeRequest(`${API_BASE}/games/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` },
      body: JSON.stringify({ roomId: room.id })
    });
    
    const gameId = startResult.data.game.id;
    console.log('✅ Game started with ID:', gameId);
    
    // 5. Get current game state to see who's turn it is
    console.log('🎯 Checking game state...');
    const gameState = await makeRequest(`${API_BASE}/games/${gameId}`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    
    console.log('Current turn:', gameState.data.game.current_turn);
    console.log('Players:', gameState.data.game.players.map(p => ({
      user_id: p.user_id,
      position: p.position,
      username: p.username
    })));
    
    const currentTurnPosition = gameState.data.game.current_turn;
    const currentPlayerUserId = gameState.data.game.players.find(p => p.position === currentTurnPosition)?.user_id;
    
    console.log('Current player user_id:', currentPlayerUserId);
    
    // 6. Test letter selection - current player should succeed
    console.log('✅ Testing letter selection by current player...');
    const currentPlayerToken = currentPlayerUserId === login1.data.user.id ? token1 : token2;
    const wrongPlayerToken = currentPlayerUserId === login1.data.user.id ? token2 : token1;
    
    const selectResult1 = await makeRequest(`${API_BASE}/games/${gameId}/select-letter`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${currentPlayerToken}` },
      body: JSON.stringify({
        playerId: currentPlayerUserId,
        letter: 'A'
      })
    });
    
    console.log('Current player letter selection:', selectResult1.status, selectResult1.data);
    
    // 7. Test letter selection - wrong player should fail
    console.log('❌ Testing letter selection by wrong player...');
    const wrongPlayerUserId = currentPlayerUserId === login1.data.user.id ? login2.data.user.id : login1.data.user.id;
    
    const selectResult2 = await makeRequest(`${API_BASE}/games/${gameId}/select-letter`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${wrongPlayerToken}` },
      body: JSON.stringify({
        playerId: wrongPlayerUserId,
        letter: 'B'
      })
    });
    
    console.log('Wrong player letter selection:', selectResult2.status, selectResult2.data);
    
    // Summary
    console.log('\n📊 TURN LOGIC TEST RESULTS:');
    console.log(`✅ Current player (${currentPlayerUserId}) selection:`, selectResult1.status === 200 ? 'SUCCESS' : 'FAILED');
    console.log(`❌ Wrong player (${wrongPlayerUserId}) selection:`, selectResult2.status === 400 ? 'CORRECTLY BLOCKED' : 'SECURITY BREACH!');
    
    if (selectResult1.status === 200 && selectResult2.status === 400) {
      console.log('🎉 TURN LOGIC WORKING CORRECTLY!');
    } else {
      console.log('🚨 TURN LOGIC HAS ISSUES!');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testTurnLogic();