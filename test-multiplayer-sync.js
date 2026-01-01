const io = require('socket.io-client');

// Test multiplayer synchronization issues
class MultiplayerTest {
  constructor() {
    this.player1Socket = null;
    this.player2Socket = null;
    this.gameEvents = [];
    this.gameId = null;
  }

  async connectPlayers() {
    console.log('🔌 Connecting test players...');
    
    // Player 1 - Jocke
    this.player1Socket = io('http://localhost:3001', {
      auth: {
        token: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjMsInVzZXJuYW1lIjoiSm9ja2UiLCJpYXQiOjE3NjcxMzgxMDUsImV4cCI6MTc2NzIyNDUwNX0.example'
      }
    });

    // Player 2 - Emma  
    this.player2Socket = io('http://localhost:3001', {
      auth: {
        token: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjIsInVzZXJuYW1lIjoiRW1tYSIsImlhdCI6MTc2NzE4MzY3MSwiZXhwIjoxNzY3MjcwMDcxfQ.example'
      }
    });

    // Set up event logging
    this.setupEventLogging();
    
    return new Promise((resolve) => {
      let connectedCount = 0;
      const checkConnection = () => {
        connectedCount++;
        if (connectedCount === 2) {
          console.log('✅ Both players connected');
          resolve();
        }
      };

      this.player1Socket.on('connect', checkConnection);
      this.player2Socket.on('connect', checkConnection);
    });
  }

  setupEventLogging() {
    const logEvent = (player, event, data) => {
      const timestamp = new Date().toISOString();
      this.gameEvents.push({ timestamp, player, event, data });
      console.log(`[${timestamp}] ${player}: ${event}`, data);
    };

    // Player 1 events
    this.player1Socket.on('letter:selected', (data) => logEvent('P1', 'letter:selected', data));
    this.player1Socket.on('game:phase_changed', (data) => logEvent('P1', 'game:phase_changed', data));
    this.player1Socket.on('letter:placed', (data) => logEvent('P1', 'letter:placed', data));

    // Player 2 events
    this.player2Socket.on('letter:selected', (data) => logEvent('P2', 'letter:selected', data));
    this.player2Socket.on('game:phase_changed', (data) => logEvent('P2', 'game:phase_changed', data));
    this.player2Socket.on('letter:placed', (data) => logEvent('P2', 'letter:placed', data));
  }

  async testLetterSelectionRace() {
    console.log('\n🧪 Testing letter selection race conditions...');
    
    // Simulate both players trying to select letters quickly
    this.player1Socket.emit('game:select_letter', { gameId: this.gameId, letter: 'A' });
    setTimeout(() => {
      this.player2Socket.emit('game:select_letter', { gameId: this.gameId, letter: 'B' });
    }, 50);
    
    // Wait and analyze events
    await this.wait(3000);
    this.analyzeEvents('letter_selection_race');
  }

  async testTimerSync() {
    console.log('\n🧪 Testing timer synchronization...');
    
    const p1Timers = [];
    const p2Timers = [];
    
    this.player1Socket.on('game:phase_changed', (data) => {
      if (data.timer_end) {
        p1Timers.push({ time: Date.now(), timer_end: data.timer_end });
      }
    });
    
    this.player2Socket.on('game:phase_changed', (data) => {
      if (data.timer_end) {
        p2Timers.push({ time: Date.now(), timer_end: data.timer_end });
      }
    });
    
    await this.wait(5000);
    
    console.log('P1 Timers:', p1Timers);
    console.log('P2 Timers:', p2Timers);
    
    // Check if timers are synchronized
    if (p1Timers.length > 0 && p2Timers.length > 0) {
      const timeDiff = Math.abs(p1Timers[0].timer_end - p2Timers[0].timer_end);
      console.log(`Timer sync difference: ${timeDiff}ms`);
      
      if (timeDiff > 100) {
        console.error('❌ Timer synchronization issue detected!');
      } else {
        console.log('✅ Timers are synchronized');
      }
    }
  }

  async testPlacementPhaseTransitions() {
    console.log('\n🧪 Testing placement phase transitions...');
    
    let phaseEvents = [];
    
    const trackPhases = (player) => (data) => {
      phaseEvents.push({
        player,
        phase: data.phase,
        currentTurn: data.current_turn,
        timestamp: Date.now()
      });
    };
    
    this.player1Socket.on('game:phase_changed', trackPhases('P1'));
    this.player2Socket.on('game:phase_changed', trackPhases('P2'));
    
    await this.wait(10000);
    
    console.log('Phase transitions:', phaseEvents);
    
    // Analyze for unexpected phase jumps
    for (let i = 1; i < phaseEvents.length; i++) {
      const prev = phaseEvents[i-1];
      const curr = phaseEvents[i];
      
      if (prev.phase === 'letter_selection' && curr.phase === 'letter_selection' && 
          curr.timestamp - prev.timestamp < 5000) {
        console.error('❌ Phase jumped too quickly!', { prev, curr });
      }
    }
  }

  analyzeEvents(testName) {
    console.log(`\n📊 Analysis for ${testName}:`);
    
    const eventsByType = {};
    this.gameEvents.forEach(event => {
      if (!eventsByType[event.event]) eventsByType[event.event] = [];
      eventsByType[event.event].push(event);
    });
    
    // Check for event synchronization issues
    Object.keys(eventsByType).forEach(eventType => {
      const events = eventsByType[eventType];
      if (events.length > 1) {
        const timeDiffs = [];
        for (let i = 1; i < events.length; i++) {
          const diff = new Date(events[i].timestamp) - new Date(events[i-1].timestamp);
          timeDiffs.push(diff);
        }
        
        console.log(`${eventType}: ${events.length} events, time diffs: ${timeDiffs}ms`);
        
        if (timeDiffs.some(diff => Math.abs(diff) > 1000)) {
          console.error(`❌ Large time gap detected in ${eventType} events`);
        }
      }
    });
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async runTests() {
    try {
      await this.connectPlayers();
      
      console.log('\n🎮 Starting multiplayer tests...');
      console.log('Note: This requires an active game to be running');
      
      // Get current game ID from server logs or set manually
      this.gameId = 37; // Adjust based on current game
      
      await this.testTimerSync();
      await this.testLetterSelectionRace();
      await this.testPlacementPhaseTransitions();
      
      console.log('\n📋 Test Summary:');
      console.log(`Total events recorded: ${this.gameEvents.length}`);
      
      // Disconnect
      this.player1Socket.disconnect();
      this.player2Socket.disconnect();
      
    } catch (error) {
      console.error('❌ Test failed:', error);
    }
  }
}

// Run the tests
const test = new MultiplayerTest();
test.runTests().then(() => {
  console.log('✅ Tests completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Tests failed:', error);
  process.exit(1);
});