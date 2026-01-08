import React, { useState, useEffect } from 'react';

interface RoomSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: RoomSettingsData) => Promise<void>;
  currentSettings: {
    max_players: number;
    grid_size: number;
    letter_timer: number;
    placement_timer: number;
  };
}

export interface RoomSettingsData {
  max_players: number;
  grid_size: number;
  letter_timer: number;
  placement_timer: number;
}

export const RoomSettingsModal: React.FC<RoomSettingsModalProps> = ({
  isOpen,
  onClose,
  onSave,
  currentSettings
}) => {
  const [maxPlayers, setMaxPlayers] = useState(currentSettings.max_players);
  const [gridSize, setGridSize] = useState(currentSettings.grid_size);
  const [letterTimer, setLetterTimer] = useState(currentSettings.letter_timer);
  const [placementTimer, setPlacementTimer] = useState(currentSettings.placement_timer);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setMaxPlayers(currentSettings.max_players);
      setGridSize(currentSettings.grid_size);
      setLetterTimer(currentSettings.letter_timer);
      setPlacementTimer(currentSettings.placement_timer);
      setError('');
    }
  }, [isOpen, currentSettings]);

  const handleSave = async () => {
    if (isSaving) return;

    setIsSaving(true);
    setError('');

    try {
      await onSave({
        max_players: maxPlayers,
        grid_size: gridSize,
        letter_timer: letterTimer,
        placement_timer: placementTimer
      });
      onClose();
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      setError(err.message || 'Kunde inte spara inställningar');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="create-room-modal-overlay">
      <div className="create-room-modal">
        <div className="create-room-modal-header">
          <h2>Ruminställningar</h2>
          <button
            onClick={onClose}
            className="close-button"
            aria-label="Stäng"
            disabled={isSaving}
          >
            ×
          </button>
        </div>

        <div>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px'}}>
            <div className="form-group">
              <label className="form-label">Max spelare: {maxPlayers}</label>
              <input
                type="range"
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
                min={2}
                max={6}
                step={1}
                disabled={isSaving}
                style={{width: '100%', cursor: 'pointer'}}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Brädstorlek: {gridSize}×{gridSize}</label>
              <input
                type="range"
                value={gridSize}
                onChange={(e) => setGridSize(Number(e.target.value))}
                min={4}
                max={6}
                step={1}
                disabled={isSaving}
                style={{width: '100%', cursor: 'pointer'}}
              />
            </div>
          </div>

          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px'}}>
            <div className="form-group">
              <label className="form-label">Tid för val: {letterTimer}s</label>
              <input
                type="range"
                value={letterTimer}
                onChange={(e) => setLetterTimer(Number(e.target.value))}
                min={5}
                max={60}
                step={1}
                disabled={isSaving}
                style={{width: '100%', cursor: 'pointer'}}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Tid för placering: {placementTimer}s</label>
              <input
                type="range"
                value={placementTimer}
                onChange={(e) => setPlacementTimer(Number(e.target.value))}
                min={10}
                max={60}
                step={1}
                disabled={isSaving}
                style={{width: '100%', cursor: 'pointer'}}
              />
            </div>
          </div>

          {error && (
            <div style={{background: 'rgba(244, 67, 54, 0.1)', border: '1px solid #f44336', color: '#f44336', padding: '10px 12px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px'}}>
              {error}
            </div>
          )}
          
          <div className="create-room-modal-actions">
            <button
              type="button"
              onClick={handleSave}
              className="primary-button"
              disabled={isSaving}
            >
              {isSaving ? 'Sparar...' : 'Spara'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="secondary-button"
              disabled={isSaving}
            >
              Avbryt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
