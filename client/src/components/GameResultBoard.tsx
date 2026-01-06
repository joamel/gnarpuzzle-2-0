import React, { useState, useEffect } from 'react';
import { ValidWord, GridCell } from '../types/game';

interface GameResultBoardProps {
  grid: Array<Array<{ letter: string | null }>> | GridCell[] | any;
  words: ValidWord[];
  boardSize?: number;
  playerId?: number;
}

const GameResultBoard: React.FC<GameResultBoardProps> = ({ grid, words, boardSize = 5 }) => {
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);

  // Auto-reset selected word after 2 seconds
  useEffect(() => {
    if (selectedWordIndex === null) return;

    const timer = setTimeout(() => {
      setSelectedWordIndex(null);
    }, 2000);

    return () => clearTimeout(timer);
  }, [selectedWordIndex]);

  console.log('📋 GameResultBoard received:', { 
    grid, 
    gridLength: Array.isArray(grid) ? grid.length : 'not array',
    words, 
    boardSize 
  });

  // Check if grid is empty
  const isGridEmpty = !grid || (Array.isArray(grid) && grid.length === 0);

  // Convert grid to 2D format if needed
  const getCell = (x: number, y: number): GridCell | null => {
    if (!grid || isGridEmpty) return null;
    
    // Check if grid is 2D array
    if (Array.isArray(grid[y]) && grid[y][x]) {
      return (grid[y] as GridCell[])[x];
    }
    
    // Check if grid is flat array with GridCell objects
    if (Array.isArray(grid)) {
      const cell = grid.find(c => c?.x === x && c?.y === y);
      return cell || null;
    }
    
    return null;
  };

  const isValidWordCell = (x: number, y: number): ValidWord | null => {
    if (!words || !Array.isArray(words)) return null;
    return words.find(word => 
      word.letters && word.letters.some(letter => letter.x === x && letter.y === y)
    ) || null;
  };

  return (
    <div className="game-result-board">
      {isGridEmpty ? (
        <div className="empty-board-message">
          <p>Ingen bräde tillgänglig</p>
        </div>
      ) : (
        <>
          <div className="board-grid-container" style={{ position: 'relative', display: 'inline-block' }}>
            <div className="board-grid" style={{ gridTemplateColumns: `repeat(${boardSize}, 1fr)` }}>
              {Array.from({ length: boardSize }).map((_, y) => (
                <div key={`row-${y}`} className="board-row">
                  {Array.from({ length: boardSize }).map((_, x) => {
                    const cell = getCell(x, y);
                    const validWord = isValidWordCell(x, y);
                    const letter = cell?.letter;
                    const wordIndex = validWord ? words.indexOf(validWord) : -1;
                    const isPartOfSelectedWord = selectedWordIndex !== null && wordIndex === selectedWordIndex;
                    
                    const handleCellClick = () => {
                      if (validWord) {
                        setSelectedWordIndex(wordIndex);
                      }
                    };
                    
                    return (
                      <div
                        key={`cell-${x}-${y}`}
                        className={`board-cell ${letter ? 'filled' : 'empty'} ${
                          isPartOfSelectedWord ? `highlighted-word` : ''
                        }`}
                        onClick={handleCellClick}
                        style={{ cursor: validWord ? 'pointer' : 'default' }}
                        title={validWord ? `Ord: ${validWord.word}` : ''}
                      >
                        {letter || ''}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Words legend */}
          <div className="words-legend">
            {words && words.length > 0 ? (
              words.map((word, index) => (
                <div 
                  key={`word-${index}`} 
                  className={`word-legend-item ${selectedWordIndex === index ? 'selected' : ''}`}
                  onClick={() => setSelectedWordIndex(index)}
                  style={{ cursor: 'pointer' }}
                >
                  <span className="word-text">{word.word}</span>
                  <span className="word-points">{word.points}p</span>
                </div>
              ))
            ) : (
              <p>Inga ord funna</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default GameResultBoard;
