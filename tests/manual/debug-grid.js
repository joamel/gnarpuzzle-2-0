// Test grid logic
const grid = Array(5).fill(null).map((_, y) => Array(5).fill(null).map((_, x) => ({ letter: null, x, y })));
console.log('Empty grid has ' + grid.flat().filter(cell => cell.letter).length + ' letters out of ' + grid.flat().length);

// Add one letter
grid[0][0] = { letter: 'A', x: 0, y: 0 };
console.log('Grid with 1 letter has ' + grid.flat().filter(cell => cell.letter).length + ' letters');

// Test the logic from isGameFinished
const isEmpty = grid.some(row => row.some(cell => !cell.letter));
console.log('isEmpty (should be true for partial grid):', isEmpty);
console.log('!isEmpty (should be false for partial grid):', !isEmpty);

// Test with full grid
const fullGrid = Array(5).fill(null).map((_, y) => Array(5).fill(null).map((_, x) => ({ letter: 'X', x, y })));
const isFullGridEmpty = fullGrid.some(row => row.some(cell => !cell.letter));
console.log('Full grid isEmpty (should be false):', isFullGridEmpty);
console.log('Full grid !isEmpty (should be true):', !isFullGridEmpty);