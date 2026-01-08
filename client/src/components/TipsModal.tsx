import React from 'react';

interface TipsModalProps {
  isOpen: boolean;
  onClose: () => void;
  gridSize: number;
  letterTimer: number;
  placementTimer: number;
}

const TipsModal: React.FC<TipsModalProps> = ({
  isOpen,
  onClose,
  gridSize,
  letterTimer,
  placementTimer
}) => {
  if (!isOpen) return null;

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="tips-modal">
        <div className="modal-header purple-header">
          <h4>📖 Spelregler</h4>
          <button 
            onClick={onClose}
            className="modal-close-button"
            title="Stäng"
          >
            ✕
          </button>
        </div>
        <div className="modal-content">
          <h3>Så här spelar du GnarPuzzle</h3>
          
          <div className="rule-section">
            <h4>🎯 Målet</h4>
            <p>Bygg ord på ditt rutnät och få flest poäng! Spelet pågår i omgångar där alla spelare får samma bokstäver.</p>
          </div>

          <div className="rule-section">
            <h4>🎮 Spelgång</h4>
            <ol>
              <li><strong>Vänta på din tur</strong> - Spelarna turas om att välja bokstäver</li>
              <li><strong>Välj bokstav</strong> - När det är din tur, välj en av de tillgängliga bokstäverna</li>
              <li><strong>Placera bokstaven</strong> - Klicka på en tom ruta på ditt {gridSize}×{gridSize} rutnät</li>
              <li><strong>Bekräfta placeringen</strong> - Tryck på "Bekräfta placering" när du är nöjd</li>
              <li><strong>Nästa spelare</strong> - Nu får nästa spelare välja från kvarvarande bokstäver</li>
            </ol>
          </div>

          <div className="rule-section">
            <h4>💰 Poängsystem</h4>
            <ul>
              <li><strong>Baspoäng:</strong> 1 poäng per bokstav i varje giltigt svenskt ord</li>
              <li><strong>Bonuspoäng:</strong> +2 extra poäng för varje hel rad eller kolumn som bildar ETT ord</li>
              <li><strong>Endast svenska ord:</strong> Alla ord valideras mot svensk ordlista</li>
              <li><strong>Minst 2 bokstäver:</strong> Ord måste vara minst 2 bokstäver långa</li>
            </ul>
          </div>

          <div className="rule-section">
            <h4>⏱️ Tidsgränser</h4>
            <p>Du har <strong>{letterTimer} sekunder</strong> på dig att välja bokstav, och <strong>{placementTimer} sekunder</strong> att placera den på brädet.</p>
          </div>

          <div className="rule-section">
            <h4>💡 Tips för att vinna</h4>
            <ul>
              <li>Planera för längre ord - de ger mer poäng!</li>
              <li>Sikta på kompletta rader/kolumner för bonuspoäng</li>
              <li>Tänk på bokstavsordningen när du väljer placering</li>
              <li>Håll koll på vilka bokstäver som redan valts</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
};

export default TipsModal;
