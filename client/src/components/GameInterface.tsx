import React, { useState, useCallback } from 'react';
import { GridCell } from '../types/game';
import { useGame } from '../contexts/GameContext';


interface GameBoardProps {
  grid: GridCell[][];
  onCellClick: (x: number, y: number) => void;
  disabled?: boolean;
  highlightedCell?: { x: number; y: number } | null;
  temporaryLetter?: { x: number; y: number; letter: string } | null;
}

const GameBoard: React.FC<GameBoardProps> = ({ 
  grid, 
  onCellClick, 
  disabled = false,
  highlightedCell,
  temporaryLetter
}) => {
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);

  const handleCellClick = useCallback((x: number, y: number) => {
    if (!disabled) {
      onCellClick(x, y);
    }
  }, [disabled, onCellClick]);

  const handleTouchStart = useCallback((e: React.TouchEvent, x: number, y: number) => {
    setTouchStart({ x, y });
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent, x: number, y: number) => {
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
      className += ' temporary-placement';
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
              {cell.letter || (temporaryLetter && temporaryLetter.x === x && temporaryLetter.y === y ? temporaryLetter.letter : '')}
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

  // Removed excessive debug logging for cleaner console

  const [temporaryPlacement, setTemporaryPlacement] = useState<{ x: number; y: number; letter: string } | null>(null);
  const [placingLetter, setPlacingLetter] = useState<boolean>(false);

  const swedishLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'Å', 'Ä', 'Ö'];

  const handleLetterSelect = async (letter: string) => {
    // Check if it's the player's turn
    if (!isMyTurn || gamePhase !== 'letter_selection') {
      console.log('❌ Cannot select letter - not your turn or wrong phase:', {
        isMyTurn,
        gamePhase,
        expectedPhase: 'letter_selection'
      });
      return;
    }

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
      return; // Cell already occupied with permanent letter
    }

    // Set temporary placement - can be moved until confirmed
    setTemporaryPlacement({ x, y, letter: selectedLetter });
  };

  const handleConfirmPlacement = async () => {
    if (!temporaryPlacement) return;

    try {
      setPlacingLetter(true);
      // Actually place the letter on server
      await placeLetter(temporaryPlacement.x, temporaryPlacement.y);
      // Then confirm the placement
      await confirmPlacement();
      setTemporaryPlacement(null);
    } catch (err) {
      console.error('Failed to confirm placement:', err);
    } finally {
      setPlacingLetter(false);
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
          {gamePhase === 'letter_selection' ? (
            isMyTurn ? (
              <span className="my-turn">🎯 Välj en bokstav!</span>
            ) : (
              <span className="other-turn">⏳ Väntar på bokstavsval</span>
            )
          ) : gamePhase === 'letter_placement' ? (
            selectedLetter ? (
              <span className="my-turn">📍 Placera bokstaven: <strong>{selectedLetter}</strong></span>
            ) : (
              <span className="waiting">⌛ Väntar på bokstav...</span>
            )
          ) : (
            <span className="other-turn">Väntar på andra spelare</span>
          )}
        </div>
        
        {/* Enhanced feedback for letter placement phase */}
        {gamePhase === 'letter_placement' && selectedLetter && (
          <div className="letter-placement-info">
            <h3>🎯 Alla spelare placerar: <span className="selected-letter">{selectedLetter}</span></h3>
            <p>Klicka på en tom ruta för att placera bokstaven, sedan tryck "Bekräfta" när du är klar.</p>
          </div>
        )}
      </div>

      {gamePhase === 'letter_selection' && isMyTurn && (
        <LetterSelector
          availableLetters={swedishLetters}
          selectedLetter={selectedLetter || undefined}
          onLetterSelect={handleLetterSelect}
          disabled={!isMyTurn}
        />
      )}

      {gamePhase === 'letter_placement' && selectedLetter && (
        <div className="placement-section">
          <div className="selected-letter-display">
            <h3>Placera bokstav: <strong>{selectedLetter}</strong></h3>
            <p>Klicka på en tom ruta för att placera bokstaven</p>
          </div>

          <GameBoard
            grid={currentPlayer.grid}
            onCellClick={handleCellClick}
            disabled={!selectedLetter || gamePhase !== 'letter_placement'}
            highlightedCell={temporaryPlacement}
            temporaryLetter={temporaryPlacement}
          />

          {temporaryPlacement && selectedLetter && (
            <div className="confirm-section">
              <p>Placera "{selectedLetter}" på position {temporaryPlacement.x}, {temporaryPlacement.y}?</p>
              <p className="placement-hint">💡 Klicka på en annan ruta för att flytta bokstaven</p>
              <div className="confirm-buttons">
                <button 
                  onClick={handleConfirmPlacement}
                  className="confirm-button primary-button"
                  disabled={placingLetter}
                >
                  {placingLetter ? 'Placerar...' : 'Bekräfta placering'}
                </button>
                <button 
                  onClick={() => setTemporaryPlacement(null)}
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