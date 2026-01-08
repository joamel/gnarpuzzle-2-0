import React, { useState, useEffect } from 'react';
import { ValidWord, GridCell } from '../types/game';
import Brick from './Brick';
import '../styles/board.css';

interface GameResultBoardProps {
  grid: Array<Array<{ letter: string | null }>> | GridCell[] | any;
  boardSize?: number;
  playerId?: number;
  words?: ValidWord[]; // Validated words from server
}

const GameResultBoard: React.FC<GameResultBoardProps> = ({ grid, boardSize = 5, words }) => {
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);
  const [extractedWords, setExtractedWords] = useState<ValidWord[]>([]);
  const [shakingCells, setShakingCells] = useState<Set<string>>(new Set());

  // Function to trigger wave animation on word letters
  const animateWord = (wordIndex: number) => {
    const word = extractedWords[wordIndex];
    if (!word || !word.letters) return;
    
    setSelectedWordIndex(wordIndex);
    
    // Animate each letter with a delay for wave effect
    word.letters.forEach((letter, i) => {
      setTimeout(() => {
        const key = `${letter.x}-${letter.y}`;
        setShakingCells(prev => new Set(prev).add(key));
        
        // Remove shake class after animation completes
        setTimeout(() => {
          setShakingCells(prev => {
            const newSet = new Set(prev);
            newSet.delete(key);
            return newSet;
          });
        }, 1000); // Match animation duration
      }, i * 150); // Stagger delay for wave effect
    });
  };

  // Use words from server if provided, otherwise extract from grid
  useEffect(() => {
    if (words && words.length > 0) {
      // Build letters array for each word from server
      const wordsWithLetters = words.map(word => {
        const letters: Array<{ letter: string; x: number; y: number }> = [];
        for (let i = 0; i < word.word.length; i++) {
          const x = word.direction === 'horizontal' ? word.startX + i : word.startX;
          const y = word.direction === 'horizontal' ? word.startY : word.startY + i;
          letters.push({ letter: word.word[i], x, y });
        }
        return { ...word, letters };
      });
      setExtractedWords(wordsWithLetters);
    } else {
      const validWords = extractWordsFromGrid(grid, boardSize);
      setExtractedWords(validWords);
    }
  }, [grid, boardSize, words]);

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
          <div style={{ position: 'relative', display: 'inline-block', width: '100%', textAlign: 'center' }}>
            <div className="game-board" style={{ '--grid-size': boardSize } as React.CSSProperties}>
              {Array.from({ length: boardSize }).map((_, y) => 
                Array.from({ length: boardSize }).map((_, x) => {
                  const cell = getCell(x, y);
                  const letter = cell?.letter;
                  const cellKey = `${x}-${y}`;
                  
                  // Find which word(s) this cell belongs to
                  const wordIndices = extractedWords
                    .map((word, idx) => 
                      word.letters.some(l => l.x === x && l.y === y) ? idx : -1
                    )
                    .filter(idx => idx !== -1);
                  
                  const isShaking = shakingCells.has(cellKey);
                  
                  const handleCellClick = () => {
                    if (wordIndices.length > 0) {
                      animateWord(wordIndices[0]);
                    }
                  };
                  
                  return (
                    <Brick
                      key={cellKey}
                      letter={letter || ''}
                      variant="board"
                      isSelected={false}
                      onClick={handleCellClick}
                      disabled={false}
                      className={isShaking ? 'word-shake' : ''}
                    />
                  );
                })
              )}
            </div>
          </div>

          {/* Words legend */}
          <div className="words-legend">
            {extractedWords && extractedWords.length > 0 ? (
              extractedWords.map((word, index) => (
                <div 
                  key={`word-${index}`} 
                  className={`word-legend-item ${selectedWordIndex === index ? 'selected' : ''}`}
                  onClick={() => animateWord(index)}
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
