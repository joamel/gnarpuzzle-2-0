import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GridCell } from '../types/game';
import { useGame } from '../contexts/GameContext';
import Brick from './Brick';
import '../styles/board.css';
import '../styles/game.css';
import '../styles/brick.css';

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
  const handleCellClick = useCallback((x: number, y: number) => {
    if (!disabled) {
      onCellClick(x, y);
    }
  }, [disabled, onCellClick]);

  const getCellClassName = (x: number, y: number) => {
    let className = '';
    
    if (disabled) {
      className += 'disabled';
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
          <Brick
            key={`${x}-${y}`}
            letter={cell.letter || (temporaryLetter && temporaryLetter.x === x && temporaryLetter.y === y ? temporaryLetter.letter : '')}
            variant="board"
            isSelected={highlightedCell?.x === x && highlightedCell?.y === y}
            disabled={disabled}
            onClick={() => handleCellClick(x, y)}
            className={getCellClassName(x, y)}
          />
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
      <div className="letters-grid">
        {availableLetters.map(letter => (
          <Brick
            key={letter}
            letter={letter}
            variant="button"
            isSelected={selectedLetter === letter}
            onClick={() => onLetterSelect(letter)}
            disabled={disabled}
          />
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
  const [submitInProgress, setSubmitInProgress] = useState<boolean>(false);
  const [pendingLetter, setPendingLetter] = useState<string | null>(null);

  const swedishLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'Å', 'Ä', 'Ö'];

  // Single function to submit current placement - used by both OK button and timeout
  const submitPlacement = async () => {
    if (!temporaryPlacement) {
      return;
    }
    
    if (submitInProgress) {
      return;
    }
    
    try {
      setSubmitInProgress(true);
      setPlacingLetter(true);
      await placeLetter(temporaryPlacement.x, temporaryPlacement.y);
      await confirmPlacement();
      setTemporaryPlacement(null);
    } catch (err) {
      console.error('❌ Failed to submit placement:', err);
      // Still reset the flags even on error
      setSubmitInProgress(false);
      setPlacingLetter(false);
      throw err;
    } finally {
      setPlacingLetter(false);
      setSubmitInProgress(false);
    }
  };

  // Auto-submit when timeout is imminent - only if player has actively chosen a position
  // This saves the player's choice if they clicked a cell but didn't press "Bekräfta" in time
  useEffect(() => {
    if (gamePhase === 'letter_placement' && gameTimer && gameTimer.remainingSeconds <= 1 && temporaryPlacement) {
      console.log('⏰ 1 second left - auto-submitting player choice:', temporaryPlacement);
      submitPlacement();
    }
  }, [gameTimer?.remainingSeconds, gamePhase, temporaryPlacement]);

  // Emergency save when phase changes away from letter_placement
  const previousGamePhaseRef = useRef(gamePhase);
  useEffect(() => {
    // Only trigger if we're leaving letter_placement phase (not entering it)
    if (previousGamePhaseRef.current === 'letter_placement' && gamePhase !== 'letter_placement' && temporaryPlacement) {
      console.log('⏰ Phase changed away from letter_placement - emergency saving:', temporaryPlacement);
      submitPlacement();
    }
    previousGamePhaseRef.current = gamePhase;
  }, [gamePhase, temporaryPlacement]);

  // Note: No automatic random placement is created on client side.
  // If the player doesn't place their letter in time, the server handles 
  // auto-placement via handlePlacementTimeout -> autoPlaceLetter

  const handleLetterSelect = (letter: string) => {
    // Local confirm step: choose letter, then confirm explicitly
    if (!isMyTurn || gamePhase !== 'letter_selection') {
      console.log('❌ Cannot select letter - not your turn or wrong phase:', { isMyTurn, gamePhase });
      return;
    }
    setPendingLetter(letter);
  };

  const handleConfirmLetter = async () => {
    if (!pendingLetter) return;
    try {
      await selectLetter(pendingLetter);
      setPendingLetter(null);
    } catch (err) {
      console.error('Failed to confirm letter:', err);
    }
  };

  // Move placement when cell is clicked
  const handleCellClick = async (x: number, y: number) => {
    if (!currentPlayer || !selectedLetter || gamePhase !== 'letter_placement') {
      console.log('❌ Cannot click cell:', { selectedLetter, gamePhase, hasCurrentPlayer: !!currentPlayer });
      return;
    }

    const cell = currentPlayer.grid[y][x];
    if (cell.letter) {
      console.log(`❌ Cell (${x}, ${y}) already occupied with letter: ${cell.letter}`);
      return; // Cell already occupied with permanent letter
    }
    
    const prevPlacement = temporaryPlacement;
    // Move temporary placement to clicked cell
    setTemporaryPlacement({ x, y, letter: selectedLetter });
    console.log(`📍 User moved placement from (${prevPlacement?.x}, ${prevPlacement?.y}) to (${x}, ${y}) for letter ${selectedLetter}`);
  };

  const handleConfirmPlacement = async () => {
    await submitPlacement();
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
              <span className="my-turn">🎯 Din tur!</span>
            ) : (
              <span className="other-turn">⏳ {currentPlayer?.username}s tur</span>
            )
          ) : gamePhase === 'letter_placement' ? (
            currentPlayer?.placementConfirmed ? (
              <span className="waiting">🎯 Alla spelare placerar: <span className="selected-letter">{selectedLetter}</span></span>
            ) : (
              <span className="waiting">⌛ Väntar på bokstav...</span>
            )
          ) : (
            <span className="other-turn">Väntar på andra spelare</span>
          )}
        </div>
      </div>

      {/* Game board - always at top */}
      <div className="board-section">
        <GameBoard
          grid={currentPlayer.grid}
          onCellClick={gamePhase === 'letter_placement' ? handleCellClick : () => {}}
          disabled={gamePhase !== 'letter_placement' || !selectedLetter}
          highlightedCell={gamePhase === 'letter_placement' ? temporaryPlacement : null}
          temporaryLetter={gamePhase === 'letter_placement' ? temporaryPlacement : null}
        />
      </div>

      {gamePhase === 'letter_selection' && isMyTurn && (
        <div className="letter-selection-section">
          <LetterSelector
            availableLetters={swedishLetters}
            selectedLetter={pendingLetter || selectedLetter || undefined}
            onLetterSelect={handleLetterSelect}
            disabled={!isMyTurn}
          />
          <div className="letter-confirm-under">
            <button 
              onClick={handleConfirmLetter}
              className="confirm-button primary-button"
              disabled={!pendingLetter || placingLetter}
            >
              Bekräfta bokstav
            </button>
          </div>
        </div>
      )}

      {gamePhase === 'letter_placement' && selectedLetter && (
        <div className="placement-section">
          {temporaryPlacement && selectedLetter && (
            <div className="confirm-section">
              <div className="confirm-buttons">
                <button 
                  onClick={handleConfirmPlacement}
                  className="confirm-button primary-button"
                  disabled={placingLetter}
                >
                  {placingLetter ? 'Placerar...' : 'Bekräfta placering'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {gamePhase === 'letter_selection' && !isMyTurn && (
        <div className="waiting-section">
          <p>Väntar på att nuvarande spelare väljer bokstav...</p>
        </div>
      )}
    </div>
  );
};

export { GameBoard, LetterSelector, GameInterface };