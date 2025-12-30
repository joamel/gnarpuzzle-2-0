import React, { useState, useEffect } from 'react';
import { useGame } from '../contexts/GameContext';
import { GridCell, GamePhase } from '../types/game';

interface GameTimerProps {
  endTime: number;
  phase: GamePhase;
}

// Cirkulär timer-komponent enligt spelreglerna
const GameTimer: React.FC<GameTimerProps> = ({ endTime, phase }) => {
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const maxTime = phase === 'letter_selection' ? 10 : 15; // Enligt spelreglerna

  // Visa inte timer för finished phase
  if (phase === 'finished') return null;

  useEffect(() => {
    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      setRemainingSeconds(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);

    return () => clearInterval(interval);
  }, [endTime]);

  const progress = (remainingSeconds / maxTime) * 100;
  const isWarning = remainingSeconds <= 3;
  
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative w-20 h-20 mx-auto mb-4">
      <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 100 100">
        {/* Background circle */}
        <circle
          cx="50"
          cy="50"
          r="45"
          stroke="currentColor"
          strokeWidth="6"
          fill="transparent"
          className="text-gray-300"
        />
        {/* Progress circle */}
        <circle
          cx="50"
          cy="50"
          r="45"
          stroke="currentColor"
          strokeWidth="6"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={`transition-all duration-300 ${
            isWarning ? 'text-red-500' : 'text-blue-500'
          }`}
          strokeLinecap="round"
        />
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center text-lg font-bold ${
        isWarning ? 'text-red-500' : 'text-gray-700'
      }`}>
        {remainingSeconds}
      </div>
    </div>
  );
};

// Svenska bokstäver enligt spelreglerna  
const SWEDISH_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ'.split('');

interface LetterSelectorProps {
  onLetterSelect: (letter: string) => void;
  disabled: boolean;
}

// Bokstavsval-komponent för letter_selection fas
const LetterSelector: React.FC<LetterSelectorProps> = ({ onLetterSelect, disabled }) => {
  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold mb-3">Välj bokstav (alla svenska bokstäver tillgängliga):</h3>
      <div className="grid grid-cols-6 gap-2 max-w-md mx-auto">
        {SWEDISH_LETTERS.map((letter) => (
          <button
            key={letter}
            onClick={() => onLetterSelect(letter)}
            disabled={disabled}
            className="w-12 h-12 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-bold rounded transition-colors"
          >
            {letter}
          </button>
        ))}
      </div>
    </div>
  );
};

interface GameBoardProps {
  gridSize?: number;
}

// Huvudkomponent som följer etablerade spelregler
const GameBoard: React.FC<GameBoardProps> = ({ gridSize = 4 }) => {
  const {
    gamePhase,
    gameTimer,
    selectedLetter,
    isMyTurn,
    currentGame,
    selectLetter,
    placeLetter,
    confirmPlacement,
    error
  } = useGame();

  const [localGrid, setLocalGrid] = useState<GridCell[][]>([]);
  const [pendingPlacement, setPendingPlacement] = useState<{x: number, y: number} | null>(null);

  // Initialisera grid enligt spelreglerna
  useEffect(() => {
    const initGrid = () => {
      const newGrid: GridCell[][] = [];
      for (let y = 0; y < gridSize; y++) {
        const row: GridCell[] = [];
        for (let x = 0; x < gridSize; x++) {
          row.push({ x, y, letter: null });
        }
        newGrid.push(row);
      }
      setLocalGrid(newGrid);
    };

    initGrid();
  }, [gridSize]);

  // Hantera bokstavsval (turnbaserat enligt spelreglerna)
  const handleLetterSelect = async (letter: string) => {
    if (!isMyTurn || gamePhase !== 'letter_selection') return;
    
    try {
      await selectLetter(letter);
    } catch (err) {
      console.error('Failed to select letter:', err);
    }
  };

  // Hantera bokstavsplacering (simultant enligt spelreglerna)  
  const handleCellClick = async (x: number, y: number) => {
    if (gamePhase !== 'letter_placement' || !selectedLetter) return;
    if (localGrid[y]?.[x]?.letter) return; // Cell already occupied

    // Uppdatera lokalt grid
    const newGrid = [...localGrid];
    newGrid[y][x] = { x, y, letter: selectedLetter };
    setLocalGrid(newGrid);
    
    setPendingPlacement({ x, y });
    
    try {
      await placeLetter(x, y);
    } catch (err) {
      console.error('Failed to place letter:', err);
      // Revert local change on error
      newGrid[y][x] = { x, y, letter: null };
      setLocalGrid(newGrid);
      setPendingPlacement(null);
    }
  };

  // Hantera bekräftelse enligt spelreglerna
  const handleConfirmPlacement = async () => {
    if (!pendingPlacement) return;
    
    try {
      await confirmPlacement();
      setPendingPlacement(null);
    } catch (err) {
      console.error('Failed to confirm placement:', err);
    }
  };

  if (!gamePhase) {
    return (
      <div className="text-center p-8">
        <p>Väntar på att spelet ska starta...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Timer enligt spelreglerna (10s val, 15s placering) */}
      {gameTimer && (
        <GameTimer 
          endTime={gameTimer.endTime} 
          phase={gamePhase}
        />
      )}

      {/* Fas-information enligt spelreglerna */}
      <div className="text-center mb-6">
        {gamePhase === 'letter_selection' && (
          <div>
            <h2 className="text-xl font-bold mb-2">
              Fas 1: Bokstavsval (Turnbaserat)
            </h2>
            {isMyTurn ? (
              <p className="text-green-600 font-semibold">Din tur - välj bokstav!</p>
            ) : (
              <p className="text-gray-600">Väntar på andra spelares val...</p>
            )}
          </div>
        )}

        {gamePhase === 'letter_placement' && (
          <div>
            <h2 className="text-xl font-bold mb-2">
              Fas 2: Bokstavsplacering (Simultant)
            </h2>
            <p className="text-blue-600 font-semibold">
              Placera din bokstav: <span className="bg-blue-100 px-2 py-1 rounded">{selectedLetter}</span>
            </p>
          </div>
        )}
      </div>

      {/* Bokstavsval för letter_selection fas */}
      {gamePhase === 'letter_selection' && (
        <LetterSelector 
          onLetterSelect={handleLetterSelect}
          disabled={!isMyTurn}
        />
      )}

      {/* Spelplan enligt regelspecifikationen */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3 text-center">
          Spelplan ({gridSize}×{gridSize})
        </h3>
        <div 
          className="grid gap-1 mx-auto bg-gray-300 p-2 rounded"
          style={{ 
            gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
            maxWidth: `${gridSize * 60 + 8}px`
          }}
        >
          {localGrid.map((row, y) => 
            row.map((cell, x) => {
              const isPending = pendingPlacement?.x === x && pendingPlacement?.y === y;
              const canPlace = gamePhase === 'letter_placement' && selectedLetter && !cell.letter;
              
              return (
                <button
                  key={`${x}-${y}`}
                  onClick={() => handleCellClick(x, y)}
                  disabled={!canPlace}
                  className={`
                    w-14 h-14 border-2 font-bold text-lg transition-all
                    ${cell.letter 
                      ? 'bg-white border-gray-400 text-gray-800' 
                      : canPlace 
                        ? 'bg-gray-100 border-gray-400 hover:bg-blue-100 hover:border-blue-400 cursor-pointer' 
                        : 'bg-gray-200 border-gray-300 cursor-not-allowed'
                    }
                    ${isPending ? 'ring-2 ring-blue-500' : ''}
                  `}
                >
                  {cell.letter}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Bekräftelse-knapp för letter_placement fas */}
      {gamePhase === 'letter_placement' && pendingPlacement && (
        <div className="text-center">
          <button
            onClick={handleConfirmPlacement}
            className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg transition-colors"
          >
            Bekräfta placering
          </button>
        </div>
      )}

      {/* Utvecklings-info */}
      <div className="mt-8 p-4 bg-gray-100 rounded text-sm">
        <h4 className="font-semibold mb-2">🎯 Spelregler implementerade:</h4>
        <ul className="text-gray-700 space-y-1">
          <li>✅ Fas 1: Turnbaserat bokstavsval (10s timer)</li>
          <li>✅ Fas 2: Simultant bokstavsplacering (15s timer)</li>
          <li>✅ Alla svenska bokstäver (A-Ö) alltid tillgängliga</li>
          <li>✅ Timer-system enligt specifikation</li>
          <li>⏳ WordValidation integration (1p/bokstav + 2p bonus)</li>
          <li>⏳ Multiplayer state synchronization</li>
        </ul>
      </div>
    </div>
  );
};

export default GameBoard;