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
  
  // Säkerställ att användaren är inkluderad från början
  const initialPlayers = currentRoom?.members || (user ? [{
    userId: user.id,
    username: user.username,
    role: 'owner',
    joinedAt: new Date().toISOString()
  }] : []);
  
  const [playerList, setPlayerList] = useState(initialPlayers);
  const [isStarting, setIsStarting] = useState(false);

  const isOwner = currentRoom && user && currentRoom.createdBy === user.id;
  const canStartGame = playerList.length >= 2; // Minst 2 spelare krävs
  const hasEnoughPlayers = playerList.length >= 2;

  useEffect(() => {
    console.log('RoomLobby - currentRoom updated:', currentRoom);
    if (currentRoom?.members) {
      console.log('RoomLobby - setting playerList from currentRoom.members:', currentRoom.members);
      setPlayerList(currentRoom.members);
    } else if (currentRoom && user) {
      // Om members är tom, lägg till användaren själv
      console.log('RoomLobby - members empty, adding self:', user);
      setPlayerList([{
        userId: user.id,
        username: user.username,
        role: 'owner',
        joinedAt: new Date().toISOString()
      }]);
    }
  }, [currentRoom, user]);

  useEffect(() => {
    const handleRoomJoined = (data: any) => {
      console.log('Room joined event:', data);
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
      console.log('Room left event:', data);
      setPlayerList(prev => prev.filter(member => member.userId !== data.user.id));
    };

    const handleRoomUpdated = (data: any) => {
      console.log('Room updated event:', data);
      if (data.room?.members) {
        setPlayerList(data.room.members);
      }
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
            <span className="setting-value">{currentRoom.settings?.grid_size || 4}×{currentRoom.settings?.grid_size || 4}</span>
          </div>
          <div className="setting-item">
            <span className="setting-label">Max spelare:</span>
            <span className="setting-value">{currentRoom.settings?.max_players || 4}</span>
          </div>
          <div className="setting-item">
            <span className="setting-label">Bokstavstid:</span>
            <span className="setting-value">{currentRoom.settings?.letter_timer || 30}s</span>
          </div>
          <div className="setting-item">
            <span className="setting-label">Placeringstid:</span>
            <span className="setting-value">{currentRoom.settings?.placement_timer || 30}s</span>
          </div>
        </div>
      </div>

      <div className="players-section">
        <h3>Spelare ({playerList.length}/{currentRoom.settings?.max_players || 4})</h3>
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
          {Array.from({ length: (currentRoom.settings?.max_players || 4) - playerList.length }, (_, i) => (
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
          <>
            <button
              onClick={handleStartGame}
              disabled={!canStartGame || isStarting || isLoading}
              className="start-game-button primary-button"
            >
              {isStarting ? 'Startar spel...' : 'Starta spel'}
            </button>
            {!hasEnoughPlayers && (
              <p className="requirement-message">
                Minst 2 spelare krävs för att starta ({playerList.length}/2)
              </p>
            )}
            {hasEnoughPlayers && (
              <p className="ready-message">
                ✅ Redo att starta spelet!
              </p>
            )}
          </>
        )}

        {!isOwner && (
          <div className="waiting-message">
            <p>Väntar på att {currentRoom?.members?.find(m => m.role === 'owner')?.username || 'spelägaren'} startar spelet</p>
            {!hasEnoughPlayers && (
              <p className="requirement-message">
                Minst 2 spelare krävs för att starta ({playerList.length}/2)
              </p>
            )}
            {hasEnoughPlayers && (
              <p className="ready-message">
                ✅ Redo att starta spelet!
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