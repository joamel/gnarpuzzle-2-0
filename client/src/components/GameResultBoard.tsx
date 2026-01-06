import React, { useState, useEffect } from 'react';
import { ValidWord, GridCell } from '../types/game';

interface GameResultBoardProps {
  grid: Array<Array<{ letter: string | null }>> | GridCell[] | any;
  boardSize?: number;
  playerId?: number;
}

const GameResultBoard: React.FC<GameResultBoardProps> = ({ grid, boardSize = 5 }) => {
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);
  const [extractedWords, setExtractedWords] = useState<ValidWord[]>([]);

  // Extract ValidWords from grid on mount
  useEffect(() => {
    const validWords = extractWordsFromGrid(grid, boardSize);
    setExtractedWords(validWords);
  }, [grid, boardSize]);

  // Auto-reset selected word after 2 seconds
  useEffect(() => {
    if (selectedWordIndex === null) return;

    const timer = setTimeout(() => {
      setSelectedWordIndex(null);
    }, 2000);

    return () => clearTimeout(timer);
  }, [selectedWordIndex]);

  // Convert grid to 2D format if needed
  const getCell = (x: number, y: number): GridCell | null => {
    if (!grid || Array.isArray(grid) && grid.length === 0) return null;
    
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

  // Extract ValidWords with letter positions from grid
  const extractWordsFromGrid = (gridData: any, size: number): ValidWord[] => {
    const validWords: ValidWord[] = [];
    
    if (!gridData || (Array.isArray(gridData) && gridData.length === 0)) {
      return validWords;
    }

    // Helper to check if a row is complete
    const isRowComplete = (y: number): boolean => {
      for (let x = 0; x < size; x++) {
        const cell = getCell(x, y);
        if (!cell?.letter) return false;
      }
      return true;
    };

    // Helper to check if a column is complete
    const isColumnComplete = (x: number): boolean => {
      for (let y = 0; y < size; y++) {
        const cell = getCell(x, y);
        if (!cell?.letter) return false;
      }
      return true;
    };

    // Horizontal words
    for (let y = 0; y < size; y++) {
      let currentWord = '';
      let startX = 0;
      const wordLetters: Array<{ letter: string; x: number; y: number }> = [];
      
      for (let x = 0; x < size; x++) {
        const cell = getCell(x, y);
        
        if (cell?.letter) {
          if (currentWord === '') {
            startX = x;
          }
          currentWord += cell.letter;
          wordLetters.push({ letter: cell.letter, x, y });
        } else {
          if (currentWord.length >= 2) {
            const rowComplete = isRowComplete(y);
            const basePoints = currentWord.length;
            const bonusPoints = rowComplete ? 2 : 0;
            
            validWords.push({
              word: currentWord,
              points: basePoints + bonusPoints,
              startX,
              startY: y,
              direction: 'horizontal',
              isComplete: rowComplete,
              letters: [...wordLetters]
            });
          }
          currentWord = '';
          wordLetters.length = 0;
        }
      }
      
      if (currentWord.length >= 2) {
        const rowComplete = isRowComplete(y);
        const basePoints = currentWord.length;
        const bonusPoints = rowComplete ? 2 : 0;
        
        validWords.push({
          word: currentWord,
          points: basePoints + bonusPoints,
          startX,
          startY: y,
          direction: 'horizontal',
          isComplete: rowComplete,
          letters: [...wordLetters]
        });
      }
    }

    // Vertical words
    for (let x = 0; x < size; x++) {
      let currentWord = '';
      let startY = 0;
      const wordLetters: Array<{ letter: string; x: number; y: number }> = [];
      
      for (let y = 0; y < size; y++) {
        const cell = getCell(x, y);
        
        if (cell?.letter) {
          if (currentWord === '') {
            startY = y;
          }
          currentWord += cell.letter;
          wordLetters.push({ letter: cell.letter, x, y });
        } else {
          if (currentWord.length >= 2) {
            const colComplete = isColumnComplete(x);
            const basePoints = currentWord.length;
            const bonusPoints = colComplete ? 2 : 0;
            
            validWords.push({
              word: currentWord,
              points: basePoints + bonusPoints,
              startX: x,
              startY,
              direction: 'vertical',
              isComplete: colComplete,
              letters: [...wordLetters]
            });
          }
          currentWord = '';
          wordLetters.length = 0;
        }
      }
      
      if (currentWord.length >= 2) {
        const colComplete = isColumnComplete(x);
        const basePoints = currentWord.length;
        const bonusPoints = colComplete ? 2 : 0;
        
        validWords.push({
          word: currentWord,
          points: basePoints + bonusPoints,
          startX: x,
          startY,
          direction: 'vertical',
          isComplete: colComplete,
          letters: [...wordLetters]
        });
      }
    }

    return validWords;
  };

  return (
    <div className="game-result-board">
      {(!grid || (Array.isArray(grid) && grid.length === 0)) ? (
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
                    const letter = cell?.letter;
                    
                    // Find which word(s) this cell belongs to
                    const wordIndices = extractedWords
                      .map((word, idx) => 
                        word.letters.some(l => l.x === x && l.y === y) ? idx : -1
                      )
                      .filter(idx => idx !== -1);
                    
                    const isPartOfSelectedWord = selectedWordIndex !== null && 
                      wordIndices.includes(selectedWordIndex);
                    
                    const handleCellClick = () => {
                      if (wordIndices.length > 0) {
                        setSelectedWordIndex(wordIndices[0]);
                      }
                    };
                    
                    return (
                      <div
                        key={`cell-${x}-${y}`}
                        className={`board-cell ${letter ? 'filled' : 'empty'} ${
                          isPartOfSelectedWord ? `highlighted-word` : ''
                        }`}
                        onClick={handleCellClick}
                        style={{ cursor: wordIndices.length > 0 ? 'pointer' : 'default' }}
                        title={wordIndices.length > 0 ? `Ord: ${extractedWords[wordIndices[0]]?.word}` : ''}
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
            {extractedWords && extractedWords.length > 0 ? (
              extractedWords.map((word, index) => (
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
