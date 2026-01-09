import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import GameResultBoard from '../../components/GameResultBoard';
import { GridCell } from '../../types/game';

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

    const { container } = render(
      <GameResultBoard
        grid={grid}
        boardSize={4}
      />
    );

    // Component uses Brick components, find the game board container
    const gameBoard = container.querySelector('.game-board');
    expect(gameBoard).toBeInTheDocument();

    // Check that we have a 4x4 grid rendered (16 Brick components)
    const bricks = container.querySelectorAll('.brick');
    expect(bricks.length).toBe(16);

    // Check that the word 'HA' is detected in legend
    expect(screen.getByText('HA')).toBeInTheDocument();
  });

  // Test with empty grid
  it('shows empty message for empty grid', () => {
    const emptyGrid: GridCell[][] = [];


    render(
      <GameResultBoard
        grid={emptyGrid}
        
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
        
        boardSize={5}
      />
    );

    expect(screen.getByText('Ingen bräde tillgänglig')).toBeInTheDocument();
  });

  // Test with multiple words
  it('displays multiple words in legend', () => {
    const grid: GridCell[][] = [
      [
        { letter: 'K', x: 0, y: 0 },
        { letter: 'A', x: 1, y: 0 },
        { letter: 'T', x: 2, y: 0 },
        { letter: null, x: 3, y: 0 },
        { letter: null, x: 4, y: 0 }
      ],
      [
        { letter: 'O', x: 0, y: 1 },
        { letter: null, x: 1, y: 1 },
        { letter: 'E', x: 2, y: 1 },
        { letter: null, x: 3, y: 1 },
        { letter: null, x: 4, y: 1 }
      ],
      [
        { letter: null, x: 0, y: 2 },
        { letter: null, x: 1, y: 2 },
        { letter: null, x: 2, y: 2 },
        { letter: null, x: 3, y: 2 },
        { letter: null, x: 4, y: 2 }
      ],
      [
        { letter: null, x: 0, y: 3 },
        { letter: null, x: 1, y: 3 },
        { letter: null, x: 2, y: 3 },
        { letter: null, x: 3, y: 3 },
        { letter: null, x: 4, y: 3 }
      ],
      [
        { letter: null, x: 0, y: 4 },
        { letter: null, x: 1, y: 4 },
        { letter: null, x: 2, y: 4 },
        { letter: null, x: 3, y: 4 },
        { letter: null, x: 4, y: 4 }
      ]
    ];

    const { container } = render(
      <GameResultBoard
        grid={grid}
        boardSize={5}
      />
    );

    // Check that the board was rendered with correct number of bricks (5x5 = 25)
    const bricks = container.querySelectorAll('.brick');
    expect(bricks.length).toBe(25);

    // Check that words are shown in legend
    expect(screen.getByText('KAT')).toBeInTheDocument();
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

    const { container } = render(
      <GameResultBoard
        grid={grid}
        boardSize={5}
      />
    );

    const bricks = container.querySelectorAll('.brick');
    
    // 5x5 = 25 cells
    expect(bricks.length).toBe(25);
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

    const { container } = render(
      <GameResultBoard
        grid={grid}
        boardSize={6}
      />
    );

    const bricks = container.querySelectorAll('.brick');
    
    // 6x6 = 36 cells
    expect(bricks.length).toBe(36);
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

    const { container } = render(
      <GameResultBoard
        grid={grid}
        boardSize={4}
      />
    );

    // Check total number of bricks
    const allBricks = container.querySelectorAll('.brick');
    expect(allBricks.length).toBe(16); // 4x4 grid

    // Check for bricks with letters (Brick component will have the letter as content)
    const filledBricks = Array.from(allBricks).filter(brick => brick.textContent && brick.textContent.trim() !== '');
    expect(filledBricks.length).toBe(5); // K, T, E, O, D
  });
});
