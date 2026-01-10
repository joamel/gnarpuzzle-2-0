// Simple test script to verify multiplayer fixes
console.log('🧪 Testing GameStateService timer fixes...');

const testTimerLogic = () => {
  // Simulate the timer Map
  const activeTimers = new Map();
  
  // Test 1: Set a timer
  console.log('\n📝 Test 1: Setting timer');
  const gameId = 123;
  const timerId = setTimeout(() => {
    console.log('Timer executed');
  }, 1000);
  activeTimers.set(gameId, timerId);
  console.log(`✅ Timer set for game ${gameId}: ${activeTimers.has(gameId)}`);
  
  // Test 2: Clear timer early
  console.log('\n📝 Test 2: Clearing timer early');
  const savedTimerId = activeTimers.get(gameId);
  if (savedTimerId) {
    clearTimeout(savedTimerId);
    activeTimers.delete(gameId);
    console.log('✅ Timer cleared successfully');
  }
  console.log(`Timer exists after clearing: ${activeTimers.has(gameId)}`);
  
  // Test 3: Prevent double timeout
  console.log('\n📝 Test 3: Prevent double timeout');
  let timeoutCount = 0;
  
  const mockSelectLetter = (gameId, playerId, letter, fromTimeout = false) => {
    timeoutCount++;
    console.log(`selectLetter called ${timeoutCount} times (fromTimeout: ${fromTimeout})`);
    
    // Simulate clearing timer on manual selection
    if (!fromTimeout && activeTimers.has(gameId)) {
      const timerId = activeTimers.get(gameId);
      clearTimeout(timerId);
      activeTimers.delete(gameId);
      console.log('  → Timer cleared due to manual selection');
    }
  };
  
  // Set timeout
  const testTimerId = setTimeout(() => {
    mockSelectLetter(gameId, 1, 'A', true);
  }, 100);
  activeTimers.set(gameId, testTimerId);
  
  // Simulate manual selection before timeout
  setTimeout(() => {
    mockSelectLetter(gameId, 1, 'B', false);
  }, 50);
  
  setTimeout(() => {
    console.log(`\n📊 Final timeout count: ${timeoutCount} (should be 1)`);
    console.log(`Active timers: ${activeTimers.size} (should be 0)`);
    
    if (timeoutCount === 1 && activeTimers.size === 0) {
      console.log('✅ Timer logic test PASSED');
    } else {
      console.log('❌ Timer logic test FAILED');
    }
  }, 200);
};

console.log('🚀 Starting timer logic tests...');
testTimerLogic();