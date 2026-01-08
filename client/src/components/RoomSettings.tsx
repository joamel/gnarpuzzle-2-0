import React from 'react';

interface RoomSettingsProps {
  gridSize: number;
  maxPlayers: number;
  letterTimer: number;
  placementTimer: number;
  onShowTips: () => void;
}

const RoomSettings: React.FC<RoomSettingsProps> = ({
  gridSize,
  maxPlayers,
  letterTimer,
  placementTimer,
  onShowTips
}) => {
  return (
    <div className="room-settings">
      <div className="settings-header">
        <h3>Spelinställningar</h3>
        <button
          onClick={onShowTips}
          className="tips-button"
          title="Tips och regler"
        >
          ?
        </button>
      </div>
      <div className="settings-grid">
        <div className="setting-item">
          <span className="setting-label">Rutstorlek:</span>
          <span className="setting-value">{gridSize}×{gridSize}</span>
        </div>
        <div className="setting-item">
          <span className="setting-label">Max spelare:</span>
          <span className="setting-value">{maxPlayers}</span>
        </div>
        <div className="setting-item">
          <span className="setting-label">Bokstavstid:</span>
          <span className="setting-value">{letterTimer}s</span>
        </div>
        <div className="setting-item">
          <span className="setting-label">Placeringstid:</span>
          <span className="setting-value">{placementTimer}s</span>
        </div>
      </div>
    </div>
  );
};

export default RoomSettings;
