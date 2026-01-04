"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const WordValidationService_1 = require("./src/services/WordValidationService");
// Initialize service
const service = new WordValidationService_1.WordValidationService();
// Wait for dictionary to load
service.loadDictionary();
// Test 1: Create a grid with "LÅSTA" in a row
console.log('\n=== Test 1: LÅSTA in one row (complete) ===');
const grid1 = [
    [
        { letter: 'L', row: 0, col: 0 },
        { letter: 'Å', row: 0, col: 1 },
        { letter: 'S', row: 0, col: 2 },
        { letter: 'T', row: 0, col: 3 },
        { letter: 'A', row: 0, col: 4 }
    ],
    [{ letter: null, row: 1, col: 0 }, { letter: null, row: 1, col: 1 }, { letter: null, row: 1, col: 2 }, { letter: null, row: 1, col: 3 }, { letter: null, row: 1, col: 4 }],
    [{ letter: null, row: 2, col: 0 }, { letter: null, row: 2, col: 1 }, { letter: null, row: 2, col: 2 }, { letter: null, row: 2, col: 3 }, { letter: null, row: 2, col: 4 }],
    [{ letter: null, row: 3, col: 0 }, { letter: null, row: 3, col: 1 }, { letter: null, row: 3, col: 2 }, { letter: null, row: 3, col: 3 }, { letter: null, row: 3, col: 4 }],
    [{ letter: null, row: 4, col: 0 }, { letter: null, row: 4, col: 1 }, { letter: null, row: 4, col: 2 }, { letter: null, row: 4, col: 3 }, { letter: null, row: 4, col: 4 }]
];
const score1 = service.calculateGridScore(grid1);
console.log(`Words found: ${score1.words.map(w => `${w.word}(${w.points}p)`).join(', ')}`);
console.log(`Total points: ${score1.totalPoints}`);
console.log(`Complete rows: ${score1.completedRows}, Complete cols: ${score1.completedCols}`);
console.log(`Expected: LÅS(3p) + TA(2p) = 5p word points + 2p bonus = 7p total`);
// Test 2: Partial row (no bonus)
console.log('\n=== Test 2: LÅ ST in one row (not complete) ===');
const grid2 = [
    [
        { letter: 'L', row: 0, col: 0 },
        { letter: 'Å', row: 0, col: 1 },
        { letter: null, row: 0, col: 2 },
        { letter: 'S', row: 0, col: 3 },
        { letter: 'T', row: 0, col: 4 }
    ],
    [{ letter: null, row: 1, col: 0 }, { letter: null, row: 1, col: 1 }, { letter: null, row: 1, col: 2 }, { letter: null, row: 1, col: 3 }, { letter: null, row: 1, col: 4 }],
    [{ letter: null, row: 2, col: 0 }, { letter: null, row: 2, col: 1 }, { letter: null, row: 2, col: 2 }, { letter: null, row: 2, col: 3 }, { letter: null, row: 2, col: 4 }],
    [{ letter: null, row: 3, col: 0 }, { letter: null, row: 3, col: 1 }, { letter: null, row: 3, col: 2 }, { letter: null, row: 3, col: 3 }, { letter: null, row: 3, col: 4 }],
    [{ letter: null, row: 4, col: 0 }, { letter: null, row: 4, col: 1 }, { letter: null, row: 4, col: 2 }, { letter: null, row: 4, col: 3 }, { letter: null, row: 4, col: 4 }]
];
const score2 = service.calculateGridScore(grid2);
console.log(`Words found: ${score2.words.map(w => `${w.word}(${w.points}p)`).join(', ')}`);
console.log(`Total points: ${score2.totalPoints}`);
console.log(`Complete rows: ${score2.completedRows}, Complete cols: ${score2.completedCols}`);
console.log(`Expected: LÅ(2p) + ST(2p) = 4p (no bonus since row not complete)`);
console.log('\n=== Tests complete ===');
process.exit(0);
