import React from 'react';

interface LobbyMember {
  userId: string;
  username: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

interface PlayersListProps {
  playerList: LobbyMember[];
  readyPlayers: Set<string>;
  authUserId: string | number | undefined;
  isReady: boolean;
  maxPlayers: number;
  onReadyChange: (newReadyStatus: boolean) => void;
}

const PlayersList: React.FC<PlayersListProps> = ({
  playerList,
  readyPlayers,
  authUserId,
  isReady,
  maxPlayers,
  onReadyChange
}) => {
  return (
    <div className="players-section">
      <h3>Spelare ({maxPlayers}/{playerList.length})</h3>
      <div className="players-list">
        {playerList.map((member, index) => {
          const isCurrentUser = member.userId === String(authUserId);
          const isOwner = member.role === 'owner';
          const isPlayerReady = readyPlayers.has(member.userId);

          console.log(`🟧 Rendering player: ${member.username} (userId: ${member.userId}, authId: ${String(authUserId)}, isCurrentUser: ${isCurrentUser})`);

          return (
            <div key={`player-${member.userId || index}-${member.username}`} className="player-item">
              <div className="player-info">
                <span className="player-name">{member.username}</span>
                {isOwner && <span className="owner-badge">👑</span>}
                {isCurrentUser && <span className="you-badge">Du</span>}
              </div>
              <div className="player-actions">
                {!isOwner && (
                  <>
                    {isCurrentUser ? (
                      <label className="ready-checkbox">
                        <input
                          type="checkbox"
                          checked={isReady}
                          onChange={(e) => onReadyChange(e.target.checked)}
                        />
                        <span className="checkbox-label">Redo</span>
                      </label>
                    ) : (
                      <span className={`ready-status ${isPlayerReady ? 'ready' : 'not-ready'}`}>
                        {isPlayerReady ? '✓' : '⏳'}
                      </span>
                    )}
                  </>
                )}
                {isOwner && <div className="player-status online">🟢</div>}
              </div>
            </div>
          );
        })}

        {/* Show empty slots */}
        {Array.from({ length: Math.max(maxPlayers - playerList.length, 0) }, (_, i) => (
          <div key={`empty-slot-${playerList.length + i}`} className="player-item empty">
            <div className="player-info">
              <span className="player-name">Väntar på spelare...</span>
            </div>
            <div className="player-status waiting">Väntar</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlayersList;
