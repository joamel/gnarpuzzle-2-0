const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function testAutoPlacement() {
  console.log('🔍 Testing auto-placement behavior with pre-placed letters...');
  
  // Test case: Letter already manually placed but not confirmed
  function testPrePlacedLetter() {
    console.log('\n🧪 TESTING: Letter already placed manually but timeout occurs');
    
    // Simulate a grid where player has already placed 'C' at (2, 1)
    const gridState = [];
    for (let y = 0; y < 4; y++) {
      gridState[y] = [];
      for (let x = 0; x < 4; x++) {
        gridState[y][x] = { letter: null, x, y };
      }
    }
    
    // Player manually placed 'C' at position (2, 1)
    gridState[1][2] = { letter: 'C', x: 2, y: 1 };
    console.log('📍 Player manually placed "C" at (2, 1)');
    
    // Now simulate the auto-placement logic when timeout occurs
    const currentLetter = 'C';
    console.log(`🤖 Timeout occurs, auto-placing letter "${currentLetter}"`);
    
    // First check if the letter is already placed somewhere in the grid
    let foundExistingPlacement = false;
    for (let y = 0; y < gridState.length; y++) {
      for (let x = 0; x < gridState[y].length; x++) {
        const cellLetter = gridState[y][x].letter;
        console.log(`  🔍 Checking cell (${x}, ${y}): "${cellLetter}" vs "${currentLetter}" (match: ${cellLetter === currentLetter})`);
        
        if (cellLetter === currentLetter) {
          console.log(`  ✅ Found existing placement at (${x}, ${y})!`);
          foundExistingPlacement = true;
          break;
        }
      }
      if (foundExistingPlacement) break;
    }
    
    if (foundExistingPlacement) {
      console.log('🎉 SUCCESS: Auto-placement found existing letter and will confirm it');
      return true;
    } else {
      console.log('❌ FAILURE: Auto-placement did not find existing letter, would place randomly');
      
      // Show what would happen - random placement
      const emptyCells = [];
      for (let y = 0; y < gridState.length; y++) {
        for (let x = 0; x < gridState[y].length; x++) {
          if (!gridState[y][x].letter) {
            emptyCells.push({x, y});
          }
        }
      }
      
      if (emptyCells.length > 0) {
        const randomIndex = Math.floor(Math.random() * emptyCells.length);
        const {x, y} = emptyCells[randomIndex];
        console.log(`  ⚠️ Would place new letter at random position (${x}, ${y})`);
        console.log(`  📊 Grid would then have 2 'C' letters - at (2, 1) and (${x}, ${y})`);
      }
      
      return false;
    }
  }
  
  // Test edge case with null vs undefined
  function testNullVsUndefined() {
    console.log('\n🧪 TESTING: null vs undefined comparison issues');
    
    const testCases = [
      { cellLetter: null, currentLetter: 'C' },
      { cellLetter: undefined, currentLetter: 'C' },
      { cellLetter: 'C', currentLetter: 'C' },
      { cellLetter: '', currentLetter: 'C' }
    ];
    
    testCases.forEach((test, i) => {
      const match = test.cellLetter === test.currentLetter;
      console.log(`  Test ${i + 1}: "${test.cellLetter}" === "${test.currentLetter}" = ${match}`);
    });
  }
  
  // Run tests
  const success = testPrePlacedLetter();
  testNullVsUndefined();
  
  if (success) {
    console.log('\n✅ Auto-placement logic correctly handles pre-placed letters');
  } else {
    console.log('\n❌ Auto-placement logic has issues with pre-placed letters');
    console.log('🔧 This explains why letters move to random positions even when manually placed');
  }
}

// Run the test
testAutoPlacement();