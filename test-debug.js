// Simple test script to debug the turn logic issue
const fetch = require('node-fetch');
const io = require('socket.io-client');

const BASE_URL = 'http://localhost:3001';
let token;
let socket;

async function login(username) {
  console.log(`🔑 Logging in as ${username}...`);
  try {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    
    const data = await response.json();
    console.log('✅ Login response:', data);
    return data;
  } catch (error) {
    console.error('❌ Login failed:', error.message);
    throw error;
  }
}

async function createRoom(roomName = "DebugRoom") {
  console.log(`🏠 Creating room: ${roomName}...`);
  try {
    const response = await fetch(`${BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name: roomName })
    });
    
    const data = await response.json();
    console.log('✅ Room created:', data);
    return data;
  } catch (error) {
    console.error('❌ Room creation failed:', error.message);
    throw error;
  }
}

async function startGame(roomId) {
  console.log(`🎮 Starting game in room ${roomId}...`);
  try {
    const response = await fetch(`${BASE_URL}/api/games/start`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ roomId })
    });
    
    const data = await response.json();
    console.log('✅ Game start response:', data);
    return data;
  } catch (error) {
    console.error('❌ Game start failed:', error.message);
    throw error;
  }
}

async function getGameState(gameId) {
  console.log(`🔍 Getting game state for game ${gameId}...`);
  try {
    const response = await fetch(`${BASE_URL}/api/games/${gameId}`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    console.log('📊 Game state:', JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error('❌ Get game state failed:', error.message);
    throw error;
  }
}

function connectSocket() {
  console.log('🔌 Connecting to Socket.IO...');
  socket = io(BASE_URL, {
    auth: { token }
  });

  socket.on('connect', () => {
    console.log('✅ Socket connected');
  });

  socket.on('game:started', (data) => {
    console.log('🎮 Game started event received:', JSON.stringify(data, null, 2));
  });

  socket.on('game:phase_changed', (data) => {
    console.log('⏱️ Game phase changed:', JSON.stringify(data, null, 2));
  });

  socket.on('disconnect', () => {
    console.log('❌ Socket disconnected');
  });
}

async function runDebugTest() {
  try {
    console.log('🚀 Starting debug test...\n');
    
    // 1. Login
    const loginData = await login('Emma');
    token = loginData.token;
    
    // 2. Connect socket
    connectSocket();
    
    // Wait a bit for socket connection
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 3. Create room
    const roomData = await createRoom();
    const roomId = roomData.id;
    
    // 4. Start game
    const gameData = await startGame(roomId);
    const gameId = gameData.id;
    
    // 5. Get game state to debug
    await getGameState(gameId);
    
    console.log('\n🔍 Debug test completed. Check the logs above for issues.');
    
  } catch (error) {
    console.error('💥 Debug test failed:', error.message);
  } finally {
    if (socket) {
      socket.disconnect();
    }
  }
}

runDebugTest();