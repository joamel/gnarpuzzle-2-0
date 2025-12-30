import React, { useState, useCallback, useRef } from 'react';
import { GridCell } from '../types/game';

interface BasicGameBoardProps {
  size?: number;
  className?: string;
}

interface LetterInventory {
  letter: string;
  count: number;
  used: number;
}

const BasicGameBoard: React.FC<BasicGameBoardProps> = ({ 
  size = 5, 
  className = '' 
}) => {
  // Initialize empty grid
  const [grid, setGrid] = useState<GridCell[][]>(() => {
    return Array.from({ length: size }, (_, y) =>
      Array.from({ length: size }, (_, x) => ({
        letter: null,
        x,
        y,
      }))
    );
  });

  // Realistic letter inventory - Swedish letter distribution
  const [letterInventory, setLetterInventory] = useState<LetterInventory[]>(() => [
    { letter: 'A', count: 8, used: 0 },
    { letter: 'E', count: 7, used: 0 },
    { letter: 'N', count: 6, used: 0 },
    { letter: 'T', count: 6, used: 0 },
    { letter: 'R', count: 5, used: 0 },
    { letter: 'S', count: 5, used: 0 },
    { letter: 'L', count: 4, used: 0 },
    { letter: 'I', count: 4, used: 0 },
    { letter: 'O', count: 4, used: 0 },
    { letter: 'D', count: 3, used: 0 },
    { letter: 'G', count: 3, used: 0 },
    { letter: 'K', count: 3, used: 0 },
    { letter: 'M', count: 3, used: 0 },
    { letter: 'V', count: 2, used: 0 },
    { letter: 'H', count: 2, used: 0 },
    { letter: 'F', count: 2, used: 0 },
    { letter: 'P', count: 2, used: 0 },
    { letter: 'U', count: 2, used: 0 },
    { letter: 'B', count: 2, used: 0 },
    { letter: 'Y', count: 1, used: 0 },
    { letter: 'C', count: 1, used: 0 },
    { letter: 'Ä', count: 1, used: 0 },
    { letter: 'Ö', count: 1, used: 0 },
    { letter: 'Å', count: 1, used: 0 }
  ]);

  const [draggedLetter, setDraggedLetter] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number } | null>(null);
  const [score, setScore] = useState(0);
  const dragElementRef = useRef<HTMLElement | null>(null);

  const getAvailableCount = (letter: string) => {
    const inventory = letterInventory.find(item => item.letter === letter);
    return inventory ? inventory.count - inventory.used : 0;
  };

  const handleLetterDragStart = useCallback((letter: string, e: React.DragEvent) => {
    if (getAvailableCount(letter) === 0) {
      e.preventDefault();
      return;
    }
    setDraggedLetter(letter);
    e.dataTransfer.setData('text/plain', letter);
    
    // Create custom drag image
    const dragElement = e.currentTarget as HTMLElement;
    dragElementRef.current = dragElement;
    e.dataTransfer.setDragImage(dragElement, 25, 25);
  }, [letterInventory]);

  const handleLetterDragEnd = useCallback(() => {
    setDraggedLetter(null);
    setDragPreview(null);
    dragElementRef.current = null;
  }, []);

  const handleCellDragOver = useCallback((e: React.DragEvent, x: number, y: number) => {
    if (draggedLetter && !grid[y][x].letter) {
      e.preventDefault();
      setDragPreview({ x, y });
    }
  }, [draggedLetter, grid]);

  const handleCellDragLeave = useCallback(() => {
    setDragPreview(null);
  }, []);

  const handleCellDrop = useCallback((e: React.DragEvent, x: number, y: number) => {
    e.preventDefault();
    const letter = e.dataTransfer.getData('text/plain');
    
    if (!letter || grid[y][x].letter || getAvailableCount(letter) === 0) {
      setDragPreview(null);
      return;
    }

    // Place the letter
    const newGrid = [...grid];
    newGrid[y] = [...newGrid[y]];
    newGrid[y][x] = {
      letter: letter,
      x,
      y,
    };

    // Update inventory
    setLetterInventory(prev => 
      prev.map(item => 
        item.letter === letter 
          ? { ...item, used: item.used + 1 }
          : item
      )
    );

    setGrid(newGrid);
    setScore(prev => prev + getLetterPoints(letter));
    setDragPreview(null);
  }, [grid, letterInventory]);

  // Simple letter scoring
  const getLetterPoints = (letter: string): number => {
    const pointMap: { [key: string]: number } = {
      'A': 1, 'E': 1, 'I': 1, 'L': 1, 'N': 1, 'O': 1, 'R': 1, 'S': 1, 'T': 1,
      'D': 2, 'G': 2, 'K': 3, 'M': 3, 'B': 3, 'F': 4, 'H': 4, 'P': 4, 'U': 4, 'V': 4, 'Y': 4,
      'C': 8, 'J': 8, 'Ä': 3, 'Ö': 4, 'Å': 4
    };
    return pointMap[letter] || 1;
  };

  const handleCellClick = useCallback((x: number, y: number) => {
    const cell = grid[y][x];
    if (cell.letter) {
      // Remove letter and return to inventory
      const newGrid = [...grid];
      newGrid[y] = [...newGrid[y]];
      newGrid[y][x] = {
        letter: null,
        x,
        y,
      };

      // Return letter to inventory
      setLetterInventory(prev => 
        prev.map(item => 
          item.letter === cell.letter 
            ? { ...item, used: Math.max(0, item.used - 1) }
            : item
        )
      );

      setGrid(newGrid);
      if (cell.letter) {
        setScore(prev => prev - getLetterPoints(cell.letter!));
      }
    }
  }, [grid]);

  const handleClearBoard = useCallback(() => {
    // Reset grid
    setGrid(Array.from({ length: size }, (_, y) =>
      Array.from({ length: size }, (_, x) => ({
        letter: null,
        x,
        y,
      }))
    ));

    // Reset inventory
    setLetterInventory(prev => 
      prev.map(item => ({ ...item, used: 0 }))
    );

    setScore(0);
  }, [size]);

  const getCellClassName = (cell: GridCell, x: number, y: number) => {
    let className = 'basic-board-cell';
    if (cell.letter) {
      className += ' filled';
    }
    if (dragPreview && dragPreview.x === x && dragPreview.y === y) {
      className += ' drag-preview';
    }
    return className;
  };

  return (
    <div className={`basic-game-board ${className}`}>
      {/* Game Header */}
      <div className="game-header">
        <h2>🧩 Enhanced Game Board</h2>
        <div className="score-display">
          Score: <strong>{score}</strong> poäng
        </div>
      </div>

      {/* Letter Inventory */}
      <div className="letter-inventory">
        <h3>Bokstavsinventarie (Dra & Släpp):</h3>
        <div className="letter-inventory-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))',
          gap: '8px',
          marginBottom: '20px'
        }}>
          {letterInventory.map(item => (
            <div
              key={item.letter}
              className={`letter-inventory-item ${getAvailableCount(item.letter) === 0 ? 'depleted' : ''}`}
              draggable={getAvailableCount(item.letter) > 0}
              onDragStart={(e) => handleLetterDragStart(item.letter, e)}
              onDragEnd={handleLetterDragEnd}
              style={{
                padding: '12px 8px',
                border: '2px solid #333',
                borderRadius: '8px',
                backgroundColor: getAvailableCount(item.letter) > 0 ? '#4CAF50' : '#ccc',
                color: 'white',
                textAlign: 'center',
                cursor: getAvailableCount(item.letter) > 0 ? 'grab' : 'not-allowed',
                fontSize: '16px',
                fontWeight: 'bold',
                opacity: getAvailableCount(item.letter) > 0 ? 1 : 0.5,
                userSelect: 'none',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ fontSize: '18px' }}>{item.letter}</div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>
                {getAvailableCount(item.letter)}/{item.count}
              </div>
              <div style={{ fontSize: '10px', color: '#fff9' }}>
                {getLetterPoints(item.letter)}p
              </div>
            </div>
          ))}
        </div>
        <div className="inventory-instructions">
          <p><strong>💡 Instruktioner:</strong></p>
          <ul>
            <li>🖱️ <strong>Dra</strong> bokstäver från inventariet till spelplanen</li>
            <li>🗑️ <strong>Klicka</strong> på placerade bokstäver för att ta bort dem</li>
            <li>📊 Olika bokstäver ger olika poäng</li>
          </ul>
        </div>
      </div>

      {/* Game Grid */}
      <div 
        className="board-grid"
        style={{ 
          '--grid-size': size,
          display: 'grid',
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          gap: '4px',
          maxWidth: '350px',
          margin: '0 auto',
          padding: '10px',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px'
        } as React.CSSProperties}
      >
        {grid.map((row, y) => 
          row.map((cell, x) => (
            <div
              key={`${x}-${y}`}
              className={getCellClassName(cell, x, y)}
              onClick={() => handleCellClick(x, y)}
              onDragOver={(e) => handleCellDragOver(e, x, y)}
              onDragLeave={handleCellDragLeave}
              onDrop={(e) => handleCellDrop(e, x, y)}
              style={{
                minHeight: '60px',
                border: '2px solid #333',
                borderRadius: '6px',
                backgroundColor: cell.letter ? '#2196F3' : 
                                dragPreview && dragPreview.x === x && dragPreview.y === y ? '#81C784' : 
                                '#fff',
                color: cell.letter ? 'white' : '#333',
                fontSize: '24px',
                fontWeight: 'bold',
                cursor: cell.letter ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                transition: 'all 0.2s ease',
                boxShadow: cell.letter ? '0 2px 4px rgba(0,0,0,0.2)' : 'inset 0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              {cell.letter && (
                <>
                  <span style={{ fontSize: '24px' }}>{cell.letter}</span>
                  <span style={{ 
                    position: 'absolute', 
                    bottom: '2px', 
                    right: '4px', 
                    fontSize: '10px',
                    color: '#fff9'
                  }}>
                    {getLetterPoints(cell.letter)}
                  </span>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* Game Controls */}
      <div className="game-controls" style={{ textAlign: 'center', marginTop: '20px' }}>
        <button 
          onClick={handleClearBoard}
          style={{
            padding: '12px 24px',
            backgroundColor: '#ff6b6b',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 'bold'
          }}
        >
          🗑️ Rensa spelplan
        </button>
      </div>
    </div>
  );
};

export default BasicGameBoard;