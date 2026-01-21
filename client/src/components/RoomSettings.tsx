import React from 'react';

interface RoomSettingsProps {
  gridSize: number;
  maxPlayers: number;
  letterTimer: number;
  placementTimer: number;
  onShowTips: () => void;
  isOwner?: boolean;
  onShowSettings?: () => void;
}

const RoomSettings: React.FC<RoomSettingsProps> = ({
  gridSize,
  maxPlayers,
  letterTimer,
  placementTimer,
  onShowTips,
  isOwner,
  onShowSettings
}) => {
  return (
    <div className="room-settings">
      <div className="settings-header">
        <h3>Spelinställningar</h3>
        <div style={{display: 'flex', gap: '8px'}}>
          {isOwner && onShowSettings && (
            <button
              onClick={onShowSettings}
              className="settings-edit-button"
              title="Ändra inställningar"
              style={{
                background: 'rgba(102, 126, 234, 0.1)',
                border: '1px solid #667eea',
                borderRadius: '6px',
                padding: '4px 10px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '600',
                color: '#667eea'
              }}
            >
              ⚙️
            </button>
          )}
          <button
            onClick={onShowTips}
            className="tips-button"
            title="Tips och regler"
          >
            ?
          </button>
        </div>
      </div>
      <div className="settings-grid">
        <div className="setting-item">
          <span className="setting-label">Brädstorlek:</span>
          <span className="setting-value">{gridSize}×{gridSize}</span>
        </div>
        <div className="setting-item">
          <span className="setting-label">Max spelare:</span>
          <span className="setting-value">{maxPlayers}</span>
        </div>
        <div className="setting-item">
          <span className="setting-label">Tid för val:</span>
          <span className="setting-value">{letterTimer} s</span>
        </div>
        <div className="setting-item">
          <span className="setting-label">Tid för placering:</span>
          <span className="setting-value">{placementTimer} s</span>
        </div>
      </div>
    </div>
  );
};

export default RoomSettings;
