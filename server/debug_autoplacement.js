/**
 * Direct test script for debugging auto-placement issue
 * This simulates the exact scenario where auto-placement fails
 */
import { DatabaseManager } from './src/config/database.js';

async function testAutoPlacement() {
  console.log('🔍 Testing auto-placement behavior...');
  
  try {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    // Create a test game scenario
    const gameId = 999; // Test game ID
    
    // Insert test game
    await db.run(`
      INSERT OR REPLACE INTO games (id, room_id, state, current_phase, current_turn) 
      VALUES (?, 1, 'playing', 'letter_placement', 1)
    `, gameId);
    
    // Create test players
    const testPlayers = [
      { userId: 101, position: 1 },
      { userId: 102, position: 2 }
    ];
    
    // Initialize empty grids for each player
    const emptyGrid = [];
    for (let y = 0; y < 4; y++) {
      emptyGrid[y] = [];
      for (let x = 0; x < 4; x++) {
        emptyGrid[y][x] = { letter: null, x, y };
      }
    }
    
    // Insert players
    for (const player of testPlayers) {
      await db.run(`
        INSERT OR REPLACE INTO players (
          game_id, user_id, position, grid_state, current_letter, placement_confirmed
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, gameId, player.userId, player.position, JSON.stringify(emptyGrid), 'C', 0);
    }
    
    console.log('✅ Test data created');
    
    // Simulate manual placement for player 101 at position (2,1)
    const player101Grid = JSON.parse(JSON.stringify(emptyGrid));
    player101Grid[1][2] = { letter: 'C', x: 2, y: 1 }; // Place C at (2,1)
    
    await db.run(`
      UPDATE players 
      SET grid_state = ? 
      WHERE game_id = ? AND user_id = ?
    `, JSON.stringify(player101Grid), gameId, 101);
    
    console.log('📍 Simulated manual placement for player 101: C at (2,1)');
    
    // Now check what happens during auto-placement timeout simulation
    const unconfirmedPlayers = await db.all(`
      SELECT * FROM players 
      WHERE game_id = ? AND placement_confirmed = 0
    `, gameId);
    
    console.log(`📊 Found ${unconfirmedPlayers.length} unconfirmed players`);
    
    for (const player of unconfirmedPlayers) {
      console.log(`\n🔍 Processing player ${player.user_id} with letter "${player.current_letter}"`);
      console.log(`📄 Grid state:`, JSON.stringify(player.grid_state));
      
      const gridState = JSON.parse(player.grid_state);
      console.log(`🗂️ Parsed grid:`, gridState);
      
      // Check if letter already exists in grid
      let found = false;
      for (let y = 0; y < gridState.length; y++) {
        for (let x = 0; x < gridState[y].length; x++) {
          const cellLetter = gridState[y][x].letter;
          console.log(`  Cell (${x}, ${y}): "${cellLetter}" vs "${player.current_letter}" (match: ${cellLetter === player.current_letter})`);
          if (cellLetter === player.current_letter) {
            console.log(`  ✅ Letter found at (${x}, ${y})!`);
            found = true;
          }
        }
      }
      
      if (!found) {
        console.log(`  ⚠️ Letter "${player.current_letter}" NOT found in grid - would be auto-placed at (0,0)`);
        
        // Debug: Check exact values
        console.log(`  🔬 Debug info:`);
        console.log(`    - player.current_letter type: ${typeof player.current_letter}`);
        console.log(`    - player.current_letter length: ${player.current_letter?.length}`);
        console.log(`    - player.current_letter codes: [${[...player.current_letter].map(c => c.charCodeAt(0)).join(', ')}]`);
        
        // Check if any cell has a letter at all
        const lettersInGrid = [];
        for (let y = 0; y < gridState.length; y++) {
          for (let x = 0; x < gridState[y].length; x++) {
            if (gridState[y][x].letter) {
              lettersInGrid.push({
                pos: `(${x}, ${y})`,
                letter: gridState[y][x].letter,
                type: typeof gridState[y][x].letter,
                codes: [...gridState[y][x].letter].map(c => c.charCodeAt(0))
              });
            }
          }
        }
        console.log(`    - Letters found in grid:`, lettersInGrid);
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testAutoPlacement();