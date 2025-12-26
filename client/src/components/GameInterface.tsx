import React, { useState, useCallback } from 'react';
import { GridCell } from '../types/game';
import { useGame } from '../contexts/GameContext';


interface GameBoardProps {
  grid: GridCell[][];
  onCellClick: (x: number, y: number) => void;
  disabled?: boolean;
  highlightedCell?: { x: number; y: number } | null;
}

const GameBoard: React.FC<GameBoardProps> = ({ 
  grid, 
  onCellClick, 
  disabled = false,
  highlightedCell 
}) => {
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);

  const handleCellClick = useCallback((x: number, y: number) => {
    if (!disabled) {
      onCellClick(x, y);
    }
  }, [disabled, onCellClick]);

  const handleTouchStart = useCallback((e: React.TouchEvent, x: number, y: number) => {
    e.preventDefault();
    setTouchStart({ x, y });
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent, x: number, y: number) => {
    e.preventDefault();
    if (touchStart && touchStart.x === x && touchStart.y === y) {
      handleCellClick(x, y);
    }
    setTouchStart(null);
  }, [touchStart, handleCellClick]);

  const getCellClassName = (cell: GridCell, x: number, y: number) => {
    let className = 'grid-cell';
    
    if (cell.letter) {
      className += ' filled';
    }
    
    if (disabled) {
      className += ' disabled';
    }
    
    if (highlightedCell && highlightedCell.x === x && highlightedCell.y === y) {
      className += ' highlighted';
    }
    
    return className;
  };

  return (
    <div className="game-board" style={{ '--grid-size': grid.length } as React.CSSProperties}>
      {grid.map((row, y) => 
        row.map((cell, x) => (
          <div
            key={`${x}-${y}`}
            className={getCellClassName(cell, x, y)}
            onClick={() => handleCellClick(x, y)}
            onTouchStart={(e) => handleTouchStart(e, x, y)}
            onTouchEnd={(e) => handleTouchEnd(e, x, y)}
            data-x={x}
            data-y={y}
          >
            <span className="cell-letter">
              {cell.letter || ''}
            </span>
            <div className="cell-coords">{x},{y}</div>
          </div>
        ))
      )}
    </div>
  );
};

// Letter selection component
interface LetterSelectorProps {
  availableLetters: string[];
  selectedLetter?: string;
  onLetterSelect: (letter: string) => void;
  disabled?: boolean;
}

const LetterSelector: React.FC<LetterSelectorProps> = ({
  availableLetters,
  selectedLetter,
  onLetterSelect,
  disabled = false
}) => {
  return (
    <div className="letter-selector">
      <h3>Välj bokstav</h3>
      <div className="letters-grid">
        {availableLetters.map(letter => (
          <button
            key={letter}
            className={`letter-button ${selectedLetter === letter ? 'selected' : ''}`}
            onClick={() => onLetterSelect(letter)}
            disabled={disabled}
          >
            {letter}
          </button>
        ))}
      </div>
    </div>
  );
};

// Main game interface component
const GameInterface: React.FC = () => {

  const { 
    currentPlayer, 
    gamePhase, 
    isMyTurn, 
    selectedLetter,
    selectLetter, 
    placeLetter, 
    confirmPlacement,
    gameTimer
  } = useGame();

  const [highlightedCell, setHighlightedCell] = useState<{ x: number; y: number } | null>(null);

  const swedishLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'Å', 'Ä', 'Ö'];

  const handleLetterSelect = async (letter: string) => {
    try {
      await selectLetter(letter);
    } catch (err) {
      console.error('Failed to select letter:', err);
    }
  };

  const handleCellClick = async (x: number, y: number) => {
    if (!currentPlayer || !selectedLetter || gamePhase !== 'letter_placement') {
      return;
    }

    const cell = currentPlayer.grid[y][x];
    if (cell.letter) {
      return; // Cell already occupied
    }

    try {
      setHighlightedCell({ x, y });
      await placeLetter(x, y);
    } catch (err) {
      console.error('Failed to place letter:', err);
      setHighlightedCell(null);
    }
  };

  const handleConfirmPlacement = async () => {
    try {
      await confirmPlacement();
      setHighlightedCell(null);
    } catch (err) {
      console.error('Failed to confirm placement:', err);
    }
  };

  if (!currentPlayer) {
    return <div>Loading game...</div>;
  }

  return (
    <div className="game-interface">
      <div className="game-status">
        <div className="phase-indicator">
          <span className="phase-text">
            {gamePhase === 'letter_selection' && 'Bokstavsval'}
            {gamePhase === 'letter_placement' && 'Placering'}
            {gamePhase === 'finished' && 'Spelet slutat'}
          </span>
          
          {gameTimer && (
            <span className={`timer ${gameTimer.isWarning ? 'warning' : ''}`}>
              {gameTimer.remainingSeconds}s
            </span>
          )}
        </div>

        <div className="turn-indicator">
          {isMyTurn ? (
            <span className="my-turn">Din tur!</span>
          ) : (
            <span className="other-turn">Väntar på andra spelare</span>
          )}
        </div>
      </div>

      {gamePhase === 'letter_selection' && isMyTurn && (
        <LetterSelector
          availableLetters={swedishLetters}
          selectedLetter={selectedLetter || undefined}
          onLetterSelect={handleLetterSelect}
          disabled={!isMyTurn}
        />
      )}

      {gamePhase === 'letter_placement' && (
        <div className="placement-section">
          <div className="selected-letter-display">
            <h3>Placera bokstav: <strong>{selectedLetter}</strong></h3>
            <p>Klicka på en tom ruta för att placera bokstaven</p>
          </div>

          <GameBoard
            grid={currentPlayer.grid}
            onCellClick={handleCellClick}
            disabled={!selectedLetter || gamePhase !== 'letter_placement'}
            highlightedCell={highlightedCell}
          />

          {highlightedCell && selectedLetter && (
            <div className="confirm-section">
              <p>Placera "{selectedLetter}" på position {highlightedCell.x}, {highlightedCell.y}?</p>
              <div className="confirm-buttons">
                <button 
                  onClick={handleConfirmPlacement}
                  className="confirm-button primary-button"
                >
                  Bekräfta placering
                </button>
                <button 
                  onClick={() => setHighlightedCell(null)}
                  className="cancel-button secondary-button"
                >
                  Ångra
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {gamePhase === 'letter_selection' && !isMyTurn && (
        <div className="waiting-section">
          <p>Väntar på att nuvarande spelare väljer bokstav...</p>
          <GameBoard
            grid={currentPlayer.grid}
            onCellClick={() => {}}
            disabled={true}
          />
        </div>
      )}
    </div>
  );
};

export { GameBoard, LetterSelector, GameInterface };