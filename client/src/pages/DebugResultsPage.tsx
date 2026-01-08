import React, { useState } from 'react';
import GameResultBoard from '../components/GameResultBoard';
import { GridCell, ValidWord } from '../types/game';

/**
 * Debug page to quickly test GameResultBoard with mock data
 * Visit: /debug/results
 */
const DebugResultsPage: React.FC = () => {
  const [boardSize, setBoardSize] = useState(4);
  const [showBoard, setShowBoard] = useState(true);

  // Generate mock grid with specific letters
  const generateMockGrid = (size: number): GridCell[][] => {
    // Grid to test partitioning:
    // R I B E  <- "BE" at x=2
    // E S E D  <- Column 2: "BECK" with "ED" at y=2
    // D Ä C K  <- "DÄCK" complete
    // O R K I
    const letters4x4 = [
      ['R', 'I', 'B', 'E'],
      ['E', 'S', 'E', 'D'],
      ['D', 'Ä', 'C', 'K'],
      ['O', 'R', 'K', 'I']
    ];

    // For other sizes
    if (size !== 4) {
      return Array(size)
        .fill(null)
        .map((_, y) =>
          Array(size)
            .fill(null)
            .map((_, x) => ({
              letter: 'A',
              x,
              y
            }))
        );
    }

    // Return 4x4 grid
    return letters4x4.map((row, y) =>
      row.map((letter, x) => ({
        letter,
        x,
        y
      }))
    );
  };

  // Calculate word score based on letter values
  const calculateWordScore = (word: string): number => {
    const letterValues: { [key: string]: number } = {
      A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8,
      K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1,
      U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10
    };
    return word.split('').reduce((sum, letter) => sum + (letterValues[letter] || 0), 0);
  };

  // Mock words - testing partitioning with correct positions
  const mockWords: ValidWord[] = [
    // Row 0: "RIBE" -> "BE" at position (2,0)
    {
      word: 'BE',
      points: 2,
      startX: 2,
      startY: 0,
      direction: 'horizontal',
      isComplete: false,
      letters: [
        { x: 2, y: 0, letter: 'B' },
        { x: 3, y: 0, letter: 'E' }
      ]
    },
    // Row 2: "DÄCK" - complete row
    {
      word: 'DÄCK',
      points: 6,
      startX: 0,
      startY: 2,
      direction: 'horizontal',
      isComplete: true,
      letters: [
        { x: 0, y: 2, letter: 'D' },
        { x: 1, y: 2, letter: 'Ä' },
        { x: 2, y: 2, letter: 'C' },
        { x: 3, y: 2, letter: 'K' }
      ]
    },
    // Column 0: "REDO" - complete column
    {
      word: 'REDO',
      points: 6,
      startX: 0,
      startY: 0,
      direction: 'vertical',
      isComplete: true,
      letters: [
        { x: 0, y: 0, letter: 'R' },
        { x: 0, y: 1, letter: 'E' },
        { x: 0, y: 2, letter: 'D' },
        { x: 0, y: 3, letter: 'O' }
      ]
    }
  ];

  const mockGrid = generateMockGrid(boardSize);
  const emptyGrid: GridCell[][] = [];

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>🧪 Debug Results Page</h1>
      
      <div style={{ marginBottom: '20px', padding: '10px', background: '#f0f0f0', borderRadius: '8px' }}>
        <label>
          Board Size:
          <select value={boardSize} onChange={e => setBoardSize(Number(e.target.value))}>
            <option value={4}>4x4</option>
            <option value={5}>5x5</option>
            <option value={6}>6x6</option>
          </select>
        </label>

        <label style={{ marginLeft: '20px' }}>
          <input
            type="checkbox"
            checked={showBoard}
            onChange={e => setShowBoard(e.target.checked)}
          />
          Show Board (uncheck to see empty state)
        </label>
      </div>

      <div style={{ 
        background: 'white', 
        padding: '20px', 
        borderRadius: '8px', 
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)' 
      }}>
        <h2>Current Player Board</h2>
        <GameResultBoard
          grid={showBoard ? mockGrid : emptyGrid}
          boardSize={boardSize}
          words={showBoard ? mockWords : []}
        />
      </div>

      <div style={{ 
        marginTop: '30px',
        background: '#e8f5e9', 
        padding: '15px', 
        borderRadius: '8px',
        fontSize: '12px'
      }}>
        <h3>📋 Test Data:</h3>
        <pre style={{ overflow: 'auto', maxHeight: '200px' }}>
{JSON.stringify({
  boardSize,
  gridLength: showBoard ? mockGrid.length : 0,
  wordsCount: showBoard ? mockWords.length : 0,
  words: showBoard ? mockWords.map(w => ({ word: w.word, points: w.points })) : []
}, null, 2)}
        </pre>
      </div>

      <div style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
        <p>✨ Use this page to quickly test GameResultBoard rendering without playing a full game.</p>
        <p>Open DevTools Console to see logging from GameResultBoard component.</p>
      </div>
    </div>
  );
};

export default DebugResultsPage;
