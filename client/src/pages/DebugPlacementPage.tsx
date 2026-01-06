import React, { useState } from 'react';
import '../styles/gamepage.css';

interface Cell {
  letter: string | null;
  x: number;
  y: number;
}

const DebugPlacementPage: React.FC = () => {
  const [boardSize, setBoardSize] = useState(2);
  const [phase, setPhase] = useState<'letter_selection' | 'letter_placement'>('letter_selection');
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [temporaryPlacement, setTemporaryPlacement] = useState<{ x: number; y: number } | null>(null);
  const [grid, setGrid] = useState<Cell[][]>(
    Array(2).fill(null).map((_, y) =>
      Array(2).fill(null).map((_, x) => ({
        letter: null,
        x,
        y
      }))
    )
  );
  const [placingLetter, setPlacingLetter] = useState(false);
  const [message, setMessage] = useState('');

  const handleBoardSizeChange = (size: 2 | 3 | 4) => {
    setBoardSize(size);
    setGrid(
      Array(size).fill(null).map((_, y) =>
        Array(size).fill(null).map((_, x) => ({
          letter: null,
          x,
          y
        }))
      )
    );
    setSelectedLetter(null);
    setTemporaryPlacement(null);
    setPhase('letter_selection');
    setMessage('');
  };

  const handleLetterSelect = (letter: string) => {
    if (phase !== 'letter_selection') {
      setMessage('❌ Du är inte i bokstavsval-fasen!');
      return;
    }
    setSelectedLetter(letter);
    setPhase('letter_placement');
    setMessage(`✅ Du valde "${letter}" - placera den på brädet`);
    console.log(`📝 Selected letter: ${letter}`);
  };

  const handleCellClick = (x: number, y: number) => {
    if (phase !== 'letter_placement') {
      setMessage('❌ Du är inte i placerings-fasen!');
      return;
    }
    if (!selectedLetter) {
      setMessage('❌ Du måste välja en bokstav först!');
      return;
    }
    setTemporaryPlacement({ x, y });
    setMessage(`📍 Valt cell (${x}, ${y}) - klicka "Bekräfta placering"`);
    console.log(`📍 Clicked cell (${x}, ${y})`);
  };

  const handleConfirmPlacement = async () => {
    if (!temporaryPlacement || !selectedLetter) {
      setMessage('❌ Ingen placering att bekräfta!');
      return;
    }

    try {
      setPlacingLetter(true);

      setMessage('⏳ Bekräftar placering...');
      
      console.log('📤 Confirming placement...');
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('✅ Placement confirmed!');
      
      // Update grid
      const newGrid = grid.map(row => [...row]);
      newGrid[temporaryPlacement.y][temporaryPlacement.x] = {
        letter: selectedLetter,
        x: temporaryPlacement.x,
        y: temporaryPlacement.y
      };
      setGrid(newGrid);
      
      setTemporaryPlacement(null);
      setSelectedLetter(null);
      setPhase('letter_selection');
      setMessage('✅ Bokstaven placerad! Välj nästa');
    } catch (err) {
      console.error('❌ Error:', err);
      setMessage('❌ Fel vid placering!');
    } finally {
      setPlacingLetter(false);

    }
  };

  const reset = () => {
    handleBoardSizeChange(boardSize as 2 | 3 | 4);
  };

  return (
    <div style={{ 
      padding: '20px', 
      maxWidth: '600px', 
      margin: '0 auto',
      minHeight: '100vh',
      overflow: 'auto'
    }}>
      <h1>🧪 Debug Placement</h1>
      
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f0f0f0', borderRadius: '8px' }}>
        <h3>⚙️ Inställningar</h3>
        <div style={{ marginBottom: '15px' }}>
          <label><strong>Brädestorleken:</strong> </label>
          {[2, 3, 4].map((size) => (
            <button 
              key={size}
              onClick={() => handleBoardSizeChange(size as 2 | 3 | 4)}
              style={{
                marginRight: '10px',
                padding: '8px 16px',
                fontWeight: boardSize === size ? 'bold' : 'normal',
                backgroundColor: boardSize === size ? '#2196F3' : '#ddd',
                color: boardSize === size ? 'white' : 'black',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {size}x{size}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '15px', padding: '12px', backgroundColor: '#e8f5e9', borderRadius: '8px' }}>
        <h3 style={{ margin: '0 0 8px 0' }}>📊 Status</h3>
        <p style={{ margin: '4px 0' }}><strong>Fas:</strong> {phase === 'letter_selection' ? '🔤 Bokstavsval' : '📍 Placering'}</p>
        <p style={{ margin: '4px 0' }}><strong>Bokstav:</strong> {selectedLetter || '-'}</p>
        <p style={{ margin: '4px 0' }}><strong>Cell:</strong> {temporaryPlacement ? `(${temporaryPlacement.x}, ${temporaryPlacement.y})` : '-'}</p>
        <p style={{ 
          padding: '8px', 
          backgroundColor: 'white', 
          borderRadius: '4px',
          margin: '8px 0 0 0',
          minHeight: '16px',
          fontSize: '12px'
        }}>
          {message}
        </p>
      </div>

      {phase === 'letter_selection' && (
        <div style={{ marginBottom: '15px', padding: '12px', backgroundColor: '#fff3e0', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 10px 0' }}>🔤 Välj bokstav</h3>
          <div>
            {['A', 'B', 'C', 'D', 'E', 'F'].map(letter => (
              <button
                key={letter}
                onClick={() => handleLetterSelect(letter)}
                style={{
                  marginRight: '8px',
                  marginBottom: '8px',
                  padding: '8px 12px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  backgroundColor: '#FFC107',
                  color: 'black',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                {letter}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === 'letter_placement' && (
        <div style={{ marginBottom: '15px', padding: '12px', backgroundColor: '#e3f2fd', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 5px 0' }}>📍 Placera på brädet</h3>
          <p style={{ margin: '0' }}>Klicka på en cell</p>
        </div>
      )}

      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
        <h3>🎮 Bräde ({boardSize}x{boardSize})</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${boardSize}, 60px)`,
            gap: '4px',
            marginBottom: '15px'
          }}
        >
          {grid.map((row, y) =>
            row.map((cell, x) => (
              <div
                key={`${x}-${y}`}
                onClick={() => handleCellClick(x, y)}
                style={{
                  width: '60px',
                  height: '60px',
                  border: temporaryPlacement?.x === x && temporaryPlacement?.y === y ? '3px solid #4CAF50' : '2px solid #ccc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: phase === 'letter_placement' ? 'pointer' : 'default',
                  backgroundColor: temporaryPlacement?.x === x && temporaryPlacement?.y === y ? '#c8e6c9' : cell.letter ? '#e8f5e9' : 'white',
                  fontSize: '24px',
                  fontWeight: 'bold',
                  borderRadius: '4px',
                  transition: 'all 0.2s',
                  opacity: phase === 'letter_placement' ? 1 : 0.6
                }}
              >
                {cell.letter || ''}
              </div>
            ))
          )}
        </div>
      </div>

      {temporaryPlacement && selectedLetter && phase === 'letter_placement' && (
        <div style={{ marginBottom: '15px', padding: '12px', backgroundColor: '#f3e5f5', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 10px 0' }}>✅ Bekräfta</h3>
          <p style={{ margin: '0 0 10px 0' }}>
            Placera <strong>"{selectedLetter}"</strong> på <strong>({temporaryPlacement.x}, {temporaryPlacement.y})</strong>
          </p>
          <button
            onClick={handleConfirmPlacement}
            disabled={placingLetter}
            style={{
              padding: '10px 16px',
              fontSize: '14px',
              fontWeight: 'bold',
              backgroundColor: placingLetter ? '#ccc' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: placingLetter ? 'not-allowed' : 'pointer',
              marginRight: '8px'
            }}
          >
            {placingLetter ? '⏳ Bekräftar...' : '✅ Bekräfta'}
          </button>
          <button
            onClick={() => {
              setTemporaryPlacement(null);
              setMessage('Avbruten');
            }}
            disabled={placingLetter}
            style={{
              padding: '10px 16px',
              fontSize: '14px',
              backgroundColor: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: placingLetter ? 'not-allowed' : 'pointer'
            }}
          >
            ❌ Ångra
          </button>
        </div>
      )}

      <div>
        <button
          onClick={reset}
          style={{
            padding: '10px 20px',
            backgroundColor: '#ff9800',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          🔄 Rensa och börja om
        </button>
      </div>

      <div style={{ 
        marginTop: '30px',
        padding: '15px', 
        backgroundColor: '#e0f2f1', 
        borderRadius: '8px'
      }}>
        <h3>📝 Instruktioner</h3>
        <ol>
          <li>Välj en bokstav (A-F)</li>
          <li>Klicka på en cell för att placera bokstaven</li>
          <li>Klicka "Bekräfta placering" för att spara</li>
          <li>Upprepa för att testa flera gånger</li>
          <li>Öppna DevTools (F12) för att se console-loggar</li>
        </ol>
        <p><strong>Test:</strong> Fyll griden helt och se om confirm-knappen fungerar på sista cellen!</p>
      </div>
    </div>
  );
};

export default DebugPlacementPage;
