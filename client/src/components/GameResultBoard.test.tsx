import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import GameResultBoard from './GameResultBoard';
import { GridCell, ValidWord } from '../types/game';

describe('GameResultBoard', () => {
  // Test with a 4x4 board
  it('renders a 4x4 board correctly', () => {
    const grid: GridCell[][] = [
      [
        { letter: 'H', x: 0, y: 0 },
        { letter: 'A', x: 1, y: 0 },
        { letter: null, x: 2, y: 0 },
        { letter: null, x: 3, y: 0 }
      ],
      [
        { letter: 'E', x: 0, y: 1 },
        { letter: null, x: 1, y: 1 },
        { letter: null, x: 2, y: 1 },
        { letter: null, x: 3, y: 1 }
      ],
      [
        { letter: null, x: 0, y: 2 },
        { letter: null, x: 1, y: 2 },
        { letter: null, x: 2, y: 2 },
        { letter: null, x: 3, y: 2 }
      ],
      [
        { letter: null, x: 0, y: 3 },
        { letter: null, x: 1, y: 3 },
        { letter: null, x: 2, y: 3 },
        { letter: null, x: 3, y: 3 }
      ]
    ];

    const words: ValidWord[] = [
      {
        word: 'HA',
        points: 5,
        startX: 0,
        startY: 0,
        direction: 'horizontal',
        isComplete: true,
        letters: [
          { x: 0, y: 0, letter: 'H' },
          { x: 1, y: 0, letter: 'A' }
        ]
      }
    ];

    render(
      <GameResultBoard
        grid={grid}
        words={words}
        boardSize={4}
      />
    );

    // Should render the board grid
    const cells = screen.queryAllByRole('generic', { hidden: true })
      .filter(el => el.className?.includes('board-cell'));
    
    // 4x4 = 16 cells
    expect(cells).toHaveLength(16);

    // Should render word cells with correct titles
    const hCell = cells.find(el => el.getAttribute('title')?.includes('Ord: HA'));
    expect(hCell).toBeInTheDocument();
  });

  // Test with empty grid
  it('shows empty message for empty grid', () => {
    const emptyGrid: GridCell[][] = [];
    const words: ValidWord[] = [];

    render(
      <GameResultBoard
        grid={emptyGrid}
        words={words}
        boardSize={5}
      />
    );

    expect(screen.getByText('Ingen bräde tillgänglig')).toBeInTheDocument();
  });

  // Test with null grid
  it('handles null grid gracefully', () => {
    render(
      <GameResultBoard
        grid={null as any}
        words={[]}
        boardSize={5}
      />
    );

    expect(screen.getByText('Ingen bräde tillgänglig')).toBeInTheDocument();
  });

  // Test with multiple words
  it('displays multiple words in legend', () => {
    const grid: GridCell[][] = Array(5).fill(null).map((_, y) =>
      Array(5).fill(null).map((_, x) => ({
        letter: x < 2 && y < 2 ? String.fromCharCode(65 + x + y) : null,
        x,
        y
      }))
    );

    const words: ValidWord[] = [
      {
        word: 'TEST',
        points: 10,
        startX: 0,
        startY: 0,
        direction: 'horizontal',
        isComplete: true,
        letters: [
          { x: 0, y: 0, letter: 'T' },
          { x: 1, y: 0, letter: 'E' },
          { x: 2, y: 0, letter: 'S' },
          { x: 3, y: 0, letter: 'T' }
        ]
      },
      {
        word: 'ORD',
        points: 8,
        startX: 1,
        startY: 1,
        direction: 'vertical',
        isComplete: true,
        letters: [
          { x: 1, y: 1, letter: 'O' },
          { x: 1, y: 2, letter: 'R' },
          { x: 1, y: 3, letter: 'D' }
        ]
      }
    ];

    render(
      <GameResultBoard
        grid={grid}
        words={words}
        boardSize={5}
      />
    );

    // Check that the board was rendered with correct number of cells (5x5 = 25)
    const cells = screen.queryAllByRole('generic', { hidden: true })
      .filter(el => el.className?.includes('board-cell'));
    expect(cells).toHaveLength(25);

    // Check that word cells have correct titles
    const testCells = cells.filter(el => el.getAttribute('title')?.includes('Ord: TEST'));
    expect(testCells.length).toBeGreaterThan(0);

    const ordCells = cells.filter(el => el.getAttribute('title')?.includes('Ord: ORD'));
    expect(ordCells.length).toBeGreaterThan(0);
  });

  // Test with 5x5 board
  it('renders a 5x5 board correctly', () => {
    const grid: GridCell[][] = Array(5).fill(null).map((_, y) =>
      Array(5).fill(null).map((_, x) => ({
        letter: null,
        x,
        y
      }))
    );

    render(
      <GameResultBoard
        grid={grid}
        words={[]}
        boardSize={5}
      />
    );

    const cells = screen.queryAllByRole('generic', { hidden: true })
      .filter(el => el.className?.includes('board-cell'));
    
    // 5x5 = 25 cells
    expect(cells).toHaveLength(25);
  });

  // Test with 6x6 board
  it('renders a 6x6 board correctly', () => {
    const grid: GridCell[][] = Array(6).fill(null).map((_, y) =>
      Array(6).fill(null).map((_, x) => ({
        letter: null,
        x,
        y
      }))
    );

    render(
      <GameResultBoard
        grid={grid}
        words={[]}
        boardSize={6}
      />
    );

    const cells = screen.queryAllByRole('generic', { hidden: true })
      .filter(el => el.className?.includes('board-cell'));
    
    // 6x6 = 36 cells
    expect(cells).toHaveLength(36);
  });

  // Test with complex board state (mixed filled and empty)
  it('displays correct filled and empty cells', () => {
    const grid: GridCell[][] = [
      [
        { letter: 'K', x: 0, y: 0 },
        { letter: null, x: 1, y: 0 },
        { letter: 'T', x: 2, y: 0 },
        { letter: null, x: 3, y: 0 }
      ],
      [
        { letter: null, x: 0, y: 1 },
        { letter: 'E', x: 1, y: 1 },
        { letter: null, x: 2, y: 1 },
        { letter: null, x: 3, y: 1 }
      ],
      [
        { letter: 'O', x: 0, y: 2 },
        { letter: null, x: 1, y: 2 },
        { letter: null, x: 2, y: 2 },
        { letter: 'D', x: 3, y: 2 }
      ],
      [
        { letter: null, x: 0, y: 3 },
        { letter: null, x: 1, y: 3 },
        { letter: null, x: 2, y: 3 },
        { letter: null, x: 3, y: 3 }
      ]
    ];

    const words: ValidWord[] = [];

    const { container } = render(
      <GameResultBoard
        grid={grid}
        words={words}
        boardSize={4}
      />
    );

    // Check for filled cells
    const filledCells = container.querySelectorAll('.board-cell.filled');
    const emptyCells = container.querySelectorAll('.board-cell.empty');

    expect(filledCells.length).toBe(5); // K, T, E, O, D
    expect(emptyCells.length).toBe(11); // rest are empty
  });
});
