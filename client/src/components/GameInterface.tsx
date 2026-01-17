import React, { useState, useCallback, useEffect } from 'react';
import { GridCell } from '../types/game';
import { useGame } from '../contexts/GameContext';
import Brick from './Brick';
import DraggableBrick from './DraggableBrick';
import '../styles/board.css';
import '../styles/game.css';
import '../styles/brick.css';
import '../styles/draggable-brick.css';

interface GameBoardProps {
  grid: GridCell[][];
  onCellClick: (x: number, y: number) => void;
  disabled?: boolean;
  highlightedCell?: { x: number; y: number } | null;
  temporaryLetter?: { x: number; y: number; letter: string } | null;
  dragPreviewCell?: { x: number; y: number } | null;
  dragPreviewLetter?: string;
}

const GameBoard: React.FC<GameBoardProps> = ({ 
  grid, 
  onCellClick, 
  disabled = false,
  highlightedCell,
  temporaryLetter,
  dragPreviewCell,
  dragPreviewLetter
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
    
    if (dragPreviewCell && dragPreviewCell.x === x && dragPreviewCell.y === y) {
      className += ' placement-preview';
    }
    
    return className;
  };

  return (
    <div className="game-board" style={{ '--grid-size': grid.length } as React.CSSProperties}>
      {grid.map((row, y) => 
        row.map((cell, x) => {
          const isPreviewCell = dragPreviewCell && dragPreviewCell.x === x && dragPreviewCell.y === y;
          const cellLetter = cell.letter || 
            (temporaryLetter && temporaryLetter.x === x && temporaryLetter.y === y ? temporaryLetter.letter : '') ||
            (isPreviewCell ? dragPreviewLetter : '');
          
          return (
            <Brick
              key={`${x}-${y}`}
              letter={cellLetter || ''}
              variant="board"
              isSelected={highlightedCell?.x === x && highlightedCell?.y === y}
              disabled={disabled}
              onClick={() => handleCellClick(x, y)}
              className={getCellClassName(x, y)}
              data-cell-key={`${x}-${y}`}
              data-preview-letter={isPreviewCell ? dragPreviewLetter : undefined}
            />
          );
        })
      )}
    </div>
  );
};

// Letter selection component
interface LetterSelectorProps {
  availableLetters: string[];
  pendingLetter?: string | null;
  browsingLetter?: string | null;
  onLetterSelect: (letter: string) => void;
  onLetterHover?: (letter: string) => void;
  onLetterBrowseSelect?: (letter: string) => void;
  onDragStart?: (letter: string) => void;
  onDragMove?: (x: number, y: number) => void;
  onDragEnd?: (x: number, y: number) => void;
  onDragCancel?: () => void;
  disabled?: boolean;
  isDragActive?: boolean;
  mode?: 'selection' | 'placement';
}

const LetterSelector: React.FC<LetterSelectorProps> = ({
  availableLetters,
  pendingLetter,
  browsingLetter,
  onLetterSelect,
  onLetterHover,
  onLetterBrowseSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
  disabled = false,
  isDragActive = false,
  mode = 'selection'
}) => {
  return (
    <div className={`letter-selector ${isDragActive ? 'drag-active' : ''}`}>
      <div className="letters-grid">
        {availableLetters.map(letter => {
          const isPending = pendingLetter === letter;
          const isBrowsing = browsingLetter === letter;
          // Show browsing state when browsing, otherwise show pending state
          const shouldShowSelected = isPending && !isBrowsing;
          
          return (
            <DraggableBrick
              key={letter}
              letter={letter}
              variant="button"
              mode={mode}
              isSelected={shouldShowSelected}
              isHovered={isBrowsing}
              onClick={() => onLetterSelect(letter)}
              onLetterHover={onLetterHover}
              onLetterSelect={onLetterBrowseSelect}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
              onDragCancel={onDragCancel}
              disabled={disabled}
              className={`
                ${isBrowsing ? 'browsing' : ''}
                ${shouldShowSelected ? 'pending' : ''}
              `}
            />
          );
        })}
      </div>
      <div className="drag-instructions">
        <small>
          {disabled 
            ? 'Väntar på din tur...' 
            : pendingLetter 
              ? `Vald: ${pendingLetter} - Klicka 'Bekräfta' för att slutföra valet`
              : 'Klicka för att välja, eller håll inne och dra mellan bokstäver för att browsea'
          }
        </small>
      </div>
    </div>
  );
};

// Main game interface component
const GameInterface: React.FC = () => {

  const { 
    currentPlayer, 
    currentTurnPlayer,
    gamePhase, 
    isMyTurn, 
    selectedLetter,
    selectLetter,
    confirmPlacement,
    gameTimer
  } = useGame();

  // Removed excessive debug logging for cleaner console

  const [temporaryPlacement, setTemporaryPlacement] = useState<{ x: number; y: number; letter: string } | null>(null);
  const [submitInProgress, setSubmitInProgress] = useState<boolean>(false);
  const [pendingLetter, setPendingLetter] = useState<string | null>(null);
  
  // Drag and drop state
  const [isDragActive, setIsDragActive] = useState(false);
  const [dragPreviewCell, setDragPreviewCell] = useState<{ x: number; y: number } | null>(null);
  const [draggedLetter, setDraggedLetter] = useState<string | null>(null);
  
  // Letter browsing state
  const [browsingLetter, setBrowsingLetter] = useState<string | null>(null);
  
  // Clear temporaryPlacement when game phase changes away from letter_placement
  useEffect(() => {
    if (gamePhase !== 'letter_placement' && temporaryPlacement) {
      console.log('🧹 Clearing temporaryPlacement due to phase change:', gamePhase);
      setTemporaryPlacement(null);
    }
  }, [gamePhase, temporaryPlacement]);

  // Clear browsing state when game phase changes away from letter_selection
  useEffect(() => {
    if (gamePhase !== 'letter_selection') {
      setBrowsingLetter(null);
      setPendingLetter(null);
    }
  }, [gamePhase]);

  const swedishLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'Å', 'Ä', 'Ö'];

  // Confirm current placement (letter already placed on server when cell was clicked)
  const confirmCurrentPlacement = async () => {
    if (!temporaryPlacement) {
      console.log('❌ confirmCurrentPlacement called but no temporaryPlacement');
      return;
    }
    
    if (submitInProgress) {
      console.log('❌ confirmCurrentPlacement called but submitInProgress is true');
      return;
    }
    
    console.log('✅ Confirming placement:', {
      temporaryPlacement,
      currentPlayer: currentPlayer?.username,
      gamePhase
    });
    
    try {
      setSubmitInProgress(true);
      // Letter already placed on server, just confirm it
      await confirmPlacement();
      setTemporaryPlacement(null);
      console.log('✅ Placement confirmed successfully');
    } catch (err) {
      console.error('❌ Failed to confirm placement:', err);
      throw err;
    } finally {
      setSubmitInProgress(false);
    }
  };

  // Note: No automatic timeout submission on client side.
  // If the player doesn't place their letter in time, the server handles 
  // auto-placement via handlePlacementTimeout -> autoPlaceLetter
  // Emergency save only when phase changes (server forced move)

  // Note: No client-side auto-placement or emergency save
  // Server handles all timeout scenarios via handlePlacementTimeout -> autoPlaceLetter
  // This prevents timing conflicts and 400 errors from trying to place after phase changes

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
    setBrowsingLetter(null); // Clear browsing when selecting
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

  // Letter browsing handlers
  const handleLetterHover = useCallback((letter: string) => {
    if (!isMyTurn || gamePhase !== 'letter_selection') return;
    console.log(`🔤 Browsing letter: ${letter}`);
    setBrowsingLetter(letter);
  }, [isMyTurn, gamePhase]);

  const handleLetterBrowseSelect = useCallback((letter: string) => {
    if (!isMyTurn || gamePhase !== 'letter_selection') return;
    setPendingLetter(letter);
    setBrowsingLetter(null); // Clear browsing state
  }, [isMyTurn, gamePhase]);

  // Move placement when cell is clicked
  const handleCellClick = (x: number, y: number) => {
    if (!currentPlayer || !selectedLetter || gamePhase !== 'letter_placement') {
      console.log('❌ Cannot click cell:', { selectedLetter, gamePhase, hasCurrentPlayer: !!currentPlayer });
      return;
    }

    // Validate coordinates
    if (!currentPlayer.grid || !currentPlayer.grid[y] || !currentPlayer.grid[y][x]) {
      console.error('❌ Invalid cell coordinates:', { x, y, gridSize: currentPlayer.grid?.length });
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

  // Drag and drop handlers
  const handleDragStart = useCallback((letter: string) => {
    if (!isMyTurn || gamePhase !== 'letter_placement') return;
    
    setIsDragActive(true);
    setDraggedLetter(letter);
    console.log(`🎯 Started dragging letter: ${letter}`);
  }, [isMyTurn, gamePhase]);

  const handleDragMove = useCallback((x: number, y: number) => {
    if (!isDragActive || !currentPlayer) return;

    // Check if cell is valid for placement
    const cell = currentPlayer.grid[y]?.[x];
    if (cell && !cell.letter) {
      setDragPreviewCell({ x, y });
    } else {
      setDragPreviewCell(null);
    }
  }, [isDragActive, currentPlayer]);

  const handleDragEnd = useCallback(async (x: number, y: number) => {
    if (!isDragActive || !draggedLetter || !currentPlayer) return;

    const cell = currentPlayer.grid[y]?.[x];
    if (cell && !cell.letter) {
      // Valid placement
      console.log(`🎯 Drag placement: ${draggedLetter} to (${x}, ${y})`);
      
      // Set the letter selection if not already selected
      if (selectedLetter !== draggedLetter) {
        try {
          await selectLetter(draggedLetter);
        } catch (err) {
          console.error('Failed to select letter during drag:', err);
          handleDragCancel();
          return;
        }
      }

      // Set temporary placement
      setTemporaryPlacement({ x, y, letter: draggedLetter });
    }

    // Clean up drag state
    setIsDragActive(false);
    setDragPreviewCell(null);
    setDraggedLetter(null);
  }, [isDragActive, draggedLetter, currentPlayer, selectedLetter, selectLetter]);

  const handleDragCancel = useCallback(() => {
    setIsDragActive(false);
    setDragPreviewCell(null);
    setDraggedLetter(null);
    console.log('🎯 Drag cancelled');
  }, []);

  const handleConfirmPlacement = async () => {
    await confirmCurrentPlacement();
  };

  if (!currentPlayer) {
    // If game is finished, don't show loading - let parent handle leaderboard
    if (gamePhase === 'finished') {
      return null;
    }
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
              <span className="other-turn">⏳ {currentTurnPlayer?.username || 'Okänd spelare'}s tur</span>
            )
          ) : gamePhase === 'letter_placement' ? (
            selectedLetter ? (
              <span className="waiting">🎯 Placera bokstav: <span className="selected-letter">{selectedLetter}</span></span>
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
          dragPreviewCell={dragPreviewCell}
          dragPreviewLetter={draggedLetter || undefined}
        />
      </div>

      {gamePhase === 'letter_selection' && isMyTurn && (
        <div className="letter-selection-section">
          <LetterSelector
            availableLetters={swedishLetters}
            pendingLetter={pendingLetter}
            browsingLetter={browsingLetter}
            onLetterSelect={handleLetterSelect}
            onLetterHover={handleLetterHover}
            onLetterBrowseSelect={handleLetterBrowseSelect}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
            disabled={!isMyTurn}
            isDragActive={isDragActive}
          />
          <div className="letter-confirm-under">
            <button 
              onClick={handleConfirmLetter}
              className="confirm-button primary-button"
              disabled={!pendingLetter}
            >
              Bekräfta bokstav
            </button>
          </div>
        </div>
      )}

      {gamePhase === 'letter_placement' && selectedLetter && (
        <div className="placement-section">
          <LetterSelector
            availableLetters={[selectedLetter]}
            onLetterSelect={() => {}} // No selection needed in placement phase
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
            disabled={false}
            isDragActive={isDragActive}
            mode="placement"
          />
          
          {temporaryPlacement && selectedLetter && (
            <div className="confirm-section">
              <div className="confirm-buttons">
                <button 
                  onClick={handleConfirmPlacement}
                  className="confirm-button primary-button"
                  disabled={false}
                >
                  Bekräfta placering
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