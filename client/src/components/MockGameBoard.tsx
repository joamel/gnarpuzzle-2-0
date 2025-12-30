import React, { useState, useEffect } from 'react';
import { GridCell } from '../types/game';

interface GameTimerProps {
  endTime: number;
  phase: 'letter_selection' | 'letter_placement';
}

// Cirkulär timer-komponent
const GameTimer: React.FC<GameTimerProps> = ({ endTime, phase }) => {
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const maxTime = phase === 'letter_selection' ? 10 : 15;

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
        <circle
          cx="50" cy="50" r="45"
          stroke="currentColor" strokeWidth="6" fill="transparent"
          className="text-gray-300"
        />
        <circle
          cx="50" cy="50" r="45"
          stroke="currentColor" strokeWidth="6" fill="transparent"
          strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
          className={`transition-all duration-300 ${isWarning ? 'text-red-500' : 'text-blue-500'}`}
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

// Svenska bokstäver
const SWEDISH_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ'.split('');

interface MockGameBoardProps {
  gridSize?: number;
}

const MockGameBoard: React.FC<MockGameBoardProps> = ({ gridSize = 4 }) => {
  // Mock game state för demo
  const [phase, setPhase] = useState<'letter_selection' | 'letter_placement' | 'demo'>('demo');
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [localGrid, setLocalGrid] = useState<GridCell[][]>([]);
  const [pendingPlacement, setPendingPlacement] = useState<{x: number, y: number} | null>(null);
  const [timerEnd, setTimerEnd] = useState<number>(0);
  const [showTimer, setShowTimer] = useState<boolean>(false);

  // Initialisera grid
  useEffect(() => {
    const newGrid: GridCell[][] = [];
    for (let y = 0; y < gridSize; y++) {
      const row: GridCell[] = [];
      for (let x = 0; x < gridSize; x++) {
        row.push({ x, y, letter: null });
      }
      newGrid.push(row);
    }
    setLocalGrid(newGrid);
  }, [gridSize]);

  // Demo funktioner
  const startLetterSelection = () => {
    setPhase('letter_selection');
    setTimerEnd(Date.now() + 10000); // 10 sekunder
    setSelectedLetter(null);
    setPendingPlacement(null);
    setShowTimer(true);
  };

  const startLetterPlacement = (letter: string) => {
    setPhase('letter_placement');
    setSelectedLetter(letter);
    setTimerEnd(Date.now() + 15000); // 15 sekunder
    setShowTimer(true);
  };

  const handleLetterSelect = (letter: string) => {
    startLetterPlacement(letter);
  };

  const handleCellClick = (x: number, y: number) => {
    if (phase !== 'letter_placement' || !selectedLetter || localGrid[y]?.[x]?.letter) return;

    // Ta bort tidigare placering av samma bokstav
    const newGrid = localGrid.map(row => 
      row.map(cell => 
        cell.letter === selectedLetter && pendingPlacement ? { ...cell, letter: null } : cell
      )
    );
    
    // Placera på ny position
    newGrid[y][x] = { x, y, letter: selectedLetter };
    setLocalGrid(newGrid);
    setPendingPlacement({ x, y });
  };

  // Automatisk placering när tiden runnit ut - kontinuerlig kontroll
  useEffect(() => {
    if (phase !== 'letter_placement' || timerEnd <= 0) return;

    const checkTimeout = () => {
      const now = Date.now();
      
      // Om tiden har gått ut och ingen placering gjorts
      if (now > timerEnd && selectedLetter && !pendingPlacement) {
        console.log('⏰ Tid ute! Automatisk placering...');
        // Hitta alla tomma rutor
        setLocalGrid(currentGrid => {
          const emptyPositions: {x: number, y: number}[] = [];
          for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
              if (!currentGrid[y][x].letter) {
                emptyPositions.push({x, y});
              }
            }
          }
          
          if (emptyPositions.length > 0) {
            // Välj en slumpmässig tom position
            const randomIndex = Math.floor(Math.random() * emptyPositions.length);
            const randomPos = emptyPositions[randomIndex];
            
            const newGrid = [...currentGrid];
            newGrid[randomPos.y][randomPos.x] = { x: randomPos.x, y: randomPos.y, letter: selectedLetter };
            setPendingPlacement(randomPos);
            console.log('⏰ Automatisk placering på slumpmässig position:', randomPos);
            return newGrid;
          }
          return currentGrid;
        });
      }
      
      // Om tiden har gått ut och placering finns men inte bekräftad
      if (now > timerEnd && pendingPlacement) {
        console.log('⏰ Tid ute! Automatisk bekräftelse...');
        setShowTimer(false);
        setTimeout(() => {
          setPendingPlacement(null);
          setPhase('demo');
          setSelectedLetter(null);
          setTimerEnd(0);
          console.log('✅ Automatisk bekräftelse slutförd');
        }, 500);
      }
    };

    const interval = setInterval(checkTimeout, 100); // Kolla varje 100ms
    return () => clearInterval(interval);
  }, [phase, timerEnd, selectedLetter, pendingPlacement, gridSize]); // Tog bort localGrid från dependencies!

  const clearBoard = () => {
    const newGrid: GridCell[][] = [];
    for (let y = 0; y < gridSize; y++) {
      const row: GridCell[] = [];
      for (let x = 0; x < gridSize; x++) {
        row.push({ x, y, letter: null });
      }
      newGrid.push(row);
    }
    setLocalGrid(newGrid);
    setPhase('demo');
    setSelectedLetter(null);
    setPendingPlacement(null);
    setTimerEnd(0);
    setShowTimer(false);
  };

  return (
    <div className="w-full min-h-screen bg-slate-900 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        {/* Demo Controls */}
        <div className="text-center mb-6 p-4 sm:p-6 bg-white border-2 border-gray-200 rounded-xl shadow-lg">
          <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-gray-800">🧪 Demo Mode - Testa Spelreglerna</h2>
          <div className="flex justify-center gap-2 sm:gap-3 flex-wrap">
            <button
              onClick={startLetterSelection}
              className="px-4 sm:px-6 py-2 sm:py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 shadow-md transition-colors text-sm sm:text-base"
            >
              Starta Bokstavsval (10s)
            </button>
            <button
              onClick={clearBoard}
              className="px-4 sm:px-6 py-2 sm:py-3 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 shadow-md transition-colors text-sm sm:text-base"
            >
              Rensa Brett
            </button>
          </div>
        </div>

      {/* Timer */}
      {phase !== 'demo' && showTimer && (
        <GameTimer endTime={timerEnd} phase={phase} />
      )}

      {/* Fas-information */}
      <div className="text-center mb-6 p-4 bg-white rounded-lg border border-gray-200">
        {phase === 'letter_selection' && (
          <div>
            <h3 className="text-xl font-bold mb-2 text-blue-700">
              Fas 1: Bokstavsval (Turnbaserat)
            </h3>
            <p className="text-green-700 font-semibold text-lg">Välj en bokstav!</p>
          </div>
        )}

        {phase === 'letter_placement' && (
          <div>
            <h3 className="text-xl font-bold mb-2 text-purple-700">
              Fas 2: Bokstavsplacering (Simultant)
            </h3>
            <p className="text-blue-700 font-semibold text-lg">
              Placera: <span className="bg-blue-200 px-3 py-1 rounded-md border border-blue-300">{selectedLetter}</span>
            </p>
          </div>
        )}

        {phase === 'demo' && (
          <div>
            <h3 className="text-xl font-bold mb-2 text-gray-700">
              Demo Mode
            </h3>
            <p className="text-gray-600 text-lg">Tryck "Starta Bokstavsval" för att testa spelreglerna</p>
          </div>
        )}
      </div>

      {/* Bokstavsval */}
      {phase === 'letter_selection' && (
          <div className="mb-6 p-3 sm:p-4 bg-white rounded-lg border border-gray-200">
            <h4 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-800 text-center">Alla svenska bokstäver tillgängliga:</h4>
            <div className="grid grid-cols-6 gap-2 sm:gap-3 max-w-xs sm:max-w-md mx-auto">
              {SWEDISH_LETTERS.map((letter) => (
                <button
                  key={letter}
                  onClick={() => handleLetterSelect(letter)}
                  className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-base sm:text-lg rounded-lg transition-colors shadow-md"
                >
                  {letter}
                </button>
            ))}
          </div>
        </div>
      )}

      {/* Spelplan */}
      <div className="mb-6">
          <h4 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-center text-gray-800">
            Spelplan ({gridSize}×{gridSize})
          </h4>
          <div 
            className="grid gap-1 mx-auto bg-slate-800 p-2 sm:p-4 rounded-xl shadow-xl border-2 border-slate-600 overflow-hidden"
            style={{ 
              gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
              maxWidth: `min(95vw, ${gridSize * 48 + 16}px)`
            }}
          >
            {localGrid.map((row, y) => 
              row.map((cell, x) => {
                const isPending = pendingPlacement?.x === x && pendingPlacement?.y === y;
                const canPlace = phase === 'letter_placement' && selectedLetter && !cell.letter;
                
                return (
                  <button
                    key={`${x}-${y}`}
                    onClick={() => handleCellClick(x, y)}
                    disabled={!canPlace}
                    className={`
                      w-10 h-10 sm:w-12 sm:h-12 border-2 font-bold text-base sm:text-lg transition-all rounded-lg shadow-md
                      ${
                        cell.letter 
                          ? 'bg-white border-slate-400 text-slate-900 shadow-lg' 
                          : canPlace 
                            ? 'bg-slate-200 border-slate-600 hover:bg-blue-200 active:bg-blue-300 hover:border-blue-600 cursor-pointer' 
                            : 'bg-slate-300 border-slate-500 cursor-not-allowed text-slate-600'
                      }
                      ${isPending ? 'ring-2 ring-blue-500 ring-opacity-80' : ''}
                    `}
                  >
                    {cell.letter}
                  </button>
              );
            })
          )}
        </div>
      </div>

      {/* Bekräftelse */}
      {phase === 'letter_placement' && pendingPlacement && (
        <div className="text-center">
          <button
            onClick={() => {
              setPendingPlacement(null);
              setPhase('demo');
              setSelectedLetter(null);
              setTimerEnd(0);
              setShowTimer(false);
            }}
            className="bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold py-3 sm:py-4 px-6 sm:px-8 rounded-xl transition-colors shadow-lg text-base sm:text-lg"
          >
            ✓ Bekräfta placering
          </button>
        </div>
      )}
      </div>
    </div>
  );
};

export default MockGameBoard;