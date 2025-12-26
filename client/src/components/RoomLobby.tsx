import React, { useEffect, useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { socketService } from '../services/socketService';

interface RoomLobbyProps {
  onStartGame: () => void;
}

const RoomLobby: React.FC<RoomLobbyProps> = ({ onStartGame }) => {
  const { user } = useAuth();
  const { currentRoom, startGame, leaveRoom, isLoading, error } = useGame();
  const [playerList, setPlayerList] = useState(currentRoom?.members || []);
  const [isStarting, setIsStarting] = useState(false);

  const isOwner = currentRoom && user && currentRoom.createdBy === user.id;
  const canStartGame = playerList.length >= 2 && playerList.length <= currentRoom?.settings.max_players!;

  useEffect(() => {
    if (currentRoom) {
      setPlayerList(currentRoom.members);
    }
  }, [currentRoom]);

  useEffect(() => {
    const handleRoomJoined = (data: any) => {
      setPlayerList(prev => {
        const exists = prev.some(member => member.userId === data.user.id);
        if (!exists) {
          return [...prev, {
            userId: data.user.id,
            username: data.user.username,
            role: 'member' as const,
            joinedAt: new Date().toISOString()
          }];
        }
        return prev;
      });
    };

    const handleRoomLeft = (data: any) => {
      setPlayerList(prev => prev.filter(member => member.userId !== data.user.id));
    };

    const handleRoomUpdated = (data: any) => {
      setPlayerList(data.room.members);
    };

    socketService.on('room:joined', handleRoomJoined);
    socketService.on('room:left', handleRoomLeft);
    socketService.on('room:updated', handleRoomUpdated);

    return () => {
      socketService.off('room:joined', handleRoomJoined);
      socketService.off('room:left', handleRoomLeft);
      socketService.off('room:updated', handleRoomUpdated);
    };
  }, []);

  const handleStartGame = async () => {
    if (!currentRoom || !canStartGame) return;
    
    try {
      setIsStarting(true);
      await startGame(currentRoom.id);
      onStartGame();
    } catch (err) {
      console.error('Failed to start game:', err);
    } finally {
      setIsStarting(false);
    }
  };

  const handleLeaveRoom = async () => {
    try {
      await leaveRoom();
    } catch (err) {
      console.error('Failed to leave room:', err);
    }
  };

  if (!currentRoom) {
    return <div>Loading room...</div>;
  }

  return (
    <div className="room-lobby">
      <div className="lobby-header">
        <h2>{currentRoom.name}</h2>
        <div className="room-code">
          <span>Kod: <strong>{currentRoom.code}</strong></span>
          <button
            onClick={() => navigator.clipboard.writeText(currentRoom.code)}
            className="copy-code-button"
          >
            📋
          </button>
        </div>
      </div>

      <div className="room-settings">
        <h3>Spelinställningar</h3>
        <div className="settings-grid">
          <div className="setting-item">
            <span className="setting-label">Rutstorlek:</span>
            <span className="setting-value">{currentRoom.settings.grid_size}×{currentRoom.settings.grid_size}</span>
          </div>
          <div className="setting-item">
            <span className="setting-label">Max spelare:</span>
            <span className="setting-value">{currentRoom.settings.max_players}</span>
          </div>
          <div className="setting-item">
            <span className="setting-label">Bokstavstid:</span>
            <span className="setting-value">{currentRoom.settings.letter_timer}s</span>
          </div>
          <div className="setting-item">
            <span className="setting-label">Placeringstid:</span>
            <span className="setting-value">{currentRoom.settings.placement_timer}s</span>
          </div>
        </div>
      </div>

      <div className="players-section">
        <h3>Spelare ({playerList.length}/{currentRoom.settings.max_players})</h3>
        <div className="players-list">
          {playerList.map(member => (
            <div key={member.userId} className="player-item">
              <div className="player-info">
                <span className="player-name">{member.username}</span>
                {member.role === 'owner' && <span className="owner-badge">👑</span>}
                {member.userId === user?.id && <span className="you-badge">Du</span>}
              </div>
              <div className="player-status online">Online</div>
            </div>
          ))}
          
          {/* Show empty slots */}
          {Array.from({ length: currentRoom.settings.max_players - playerList.length }, (_, i) => (
            <div key={`empty-${i}`} className="player-item empty">
              <div className="player-info">
                <span className="player-name">Väntar på spelare...</span>
              </div>
              <div className="player-status waiting">Väntar</div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="lobby-actions">
        {isOwner && (
          <button
            onClick={handleStartGame}
            disabled={!canStartGame || isStarting || isLoading}
            className="start-game-button primary-button"
          >
            {isStarting ? 'Startar spel...' : 'Starta spel'}
          </button>
        )}

        {!isOwner && (
          <div className="waiting-message">
            <p>Väntar på att {currentRoom.members.find(m => m.role === 'owner')?.username || 'spelägaren'} startar spelet</p>
            {!canStartGame && (
              <p className="requirement-message">
                Minst 2 spelare krävs för att starta
              </p>
            )}
          </div>
        )}

        <button
          onClick={handleLeaveRoom}
          disabled={isLoading}
          className="leave-room-button secondary-button"
        >
          Lämna rum
        </button>
      </div>

      <div className="lobby-tips">
        <h4>💡 Tips</h4>
        <ul>
          <li>Dela rumkoden med vänner för att de ska kunna gå med</li>
          <li>Minst 2 spelare krävs för att starta</li>
          <li>Spelet startar automatiskt när ägaren trycker "Starta spel"</li>
        </ul>
      </div>
    </div>
  );
};

export default RoomLobby;