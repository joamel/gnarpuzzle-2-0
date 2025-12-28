import React, { useEffect, useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { socketService } from '../services/socketService';
import { apiService } from '../services/apiService';

interface RoomLobbyProps {
  onStartGame: () => void;
}

// Extended Player type for lobby display
interface LobbyMember {
  userId: string;
  username: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

const RoomLobby: React.FC<RoomLobbyProps> = ({ onStartGame }) => {
  const { user: authUser } = useAuth();
  const { currentRoom, startGame, leaveRoom, isLoading, error } = useGame();
  
  // Initialize player list
  const [playerList, setPlayerList] = useState<LobbyMember[]>([]);
  const [isStarting, setIsStarting] = useState(false);

  const isOwner = currentRoom && authUser && String(currentRoom.createdBy).trim() === String(authUser.id).trim();
  const canStartGame = playerList.length >= 2; // Minst 2 spelare krävs
  const hasEnoughPlayers = playerList.length >= 2;

  useEffect(() => {
    console.log('🏠 RoomLobby - currentRoom updated:', currentRoom);
    console.log('👤 Raw authUser:', authUser);
    console.log('🆔 User ID:', authUser?.id);
    console.log('📝 Username:', authUser?.username);
    console.log('👑 isOwner check:', {
      createdBy: currentRoom?.createdBy,
      userId: authUser?.id,
      createdByString: String(currentRoom?.createdBy).trim(),
      userIdString: String(authUser?.id).trim(),
      isOwner: currentRoom && authUser && String(currentRoom.createdBy).trim() === String(authUser.id).trim()
    });
    
    // Since Room doesn't have players property, always add user if room exists
    if (currentRoom && authUser) {
      // Add the current user to player list
      console.log('⚠️ RoomLobby - adding self to player list. User data:', authUser);
      console.log('🏠 Room createdBy:', currentRoom.createdBy, 'User ID:', authUser.id);
      setPlayerList([{
        userId: String(authUser.id),
        username: authUser.username,
        role: String(currentRoom.createdBy).trim() === String(authUser.id).trim() ? 'owner' : 'member',
        joinedAt: new Date().toISOString()
      }]);
      
      // Force refresh to get latest member data from server
      console.log('🔄 Attempting to fetch fresh member data...');
      if (currentRoom.code) {
        apiService.getRoomByCode(currentRoom.code).then(freshData => {
          console.log('🆕 Fresh room data received:', freshData);
          console.log('🆕 Fresh members array:', freshData?.room?.members);
          if (freshData?.room?.members && freshData.room.members.length > 0) {
            console.log('✅ Updating playerList with fresh data:', freshData.room.members);
            setPlayerList(freshData.room.members);
          } else {
            console.log('⚠️ Fresh data still has empty members array');
          }
        }).catch(err => {
          console.error('❌ Failed to fetch fresh room data:', err);
        });
      }
    }
  }, [currentRoom, authUser]);

  useEffect(() => {
    const handleMemberJoined = (data: any) => {
      console.log('📥 Member joined event:', data);
      
      // If backend provides proper member list, use it
      if (data.room?.members && Array.isArray(data.room.members) && data.room.members.length > 0) {
        console.log('🎯 Using backend member list from join event:', data.room.members);
        setPlayerList(data.room.members);
      } else if (data.user) {
        // Otherwise, manually add the user
        console.log('📝 Manually adding user to member list');
        setPlayerList(prev => {
          const exists = prev.some(member => member.userId === String(data.user.id));
          if (!exists) {
            const newList = [...prev, {
              userId: String(data.user.id),
              username: data.user.username,
              role: 'member' as const,
              joinedAt: new Date().toISOString()
            }];
            console.log('👥 Updated player list:', newList);
            return newList;
          }
          return prev;
        });
        
        // Also trigger a refresh to get latest data from server
        if (currentRoom?.code) {
          console.log('🔄 Fetching fresh data after member join...');
          apiService.getRoomByCode(currentRoom.code).then(freshData => {
            console.log('🆕 Fresh data after join:', freshData);
            if (freshData?.members && freshData.members.length > 0) {
              setPlayerList(freshData.members);
            }
          }).catch(err => console.error('❌ Failed to fetch after join:', err));
        }
      }
    };

    const handleRoomLeft = (data: any) => {
      console.log('📤 Room left event:', data);
      setPlayerList(prev => prev.filter(member => member.userId !== String(data.user.id)));
    };

    const handleRoomUpdated = (data: any) => {
      console.log('🔄 Room updated event:', data);
      if (data.room?.members && Array.isArray(data.room.members)) {
        console.log('🔄 Updating member list from room update:', data.room.members);
        setPlayerList(data.room.members);
      }
    };

    socketService.on('room:member_joined', handleMemberJoined);
    socketService.on('room:left', handleRoomLeft);
    socketService.on('room:updated', handleRoomUpdated);

    // Periodic sync to ensure member list stays up to date
    let syncInterval: NodeJS.Timeout;
    if (currentRoom?.code) {
      syncInterval = setInterval(() => {
        console.log('🔄 Periodic member sync...');
        apiService.getRoomByCode(currentRoom.code).then(freshData => {
          if (freshData?.members && freshData.members.length > 0) {
            setPlayerList(prev => {
              // Only update if member list actually changed
              const currentIds = prev.map(p => p.userId).sort();
              const freshIds = freshData.members.map((m: any) => m.userId).sort();
              
              if (JSON.stringify(currentIds) !== JSON.stringify(freshIds)) {
                console.log('👥 Periodic sync: Member list changed, updating...');
                return freshData.members;
              }
              return prev;
            });
          }
        }).catch(err => console.error('❌ Periodic sync failed:', err));
      }, 10000); // Sync every 10 seconds
    }

    return () => {
      socketService.off('room:member_joined', handleMemberJoined);
      socketService.off('room:left', handleRoomLeft);
      socketService.off('room:updated', handleRoomUpdated);
      if (syncInterval) clearInterval(syncInterval);
    };
  }, [currentRoom]);

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
        
        {/* Force refresh button for debugging */}
        <button 
          onClick={async () => {
            if (currentRoom?.code) {
              console.log('🔄 Force refreshing room data...');
              try {
                const freshRoomData = await apiService.getRoomByCode(currentRoom.code);
                console.log('Fresh room data:', freshRoomData);
                if (freshRoomData?.members) {
                  setPlayerList(freshRoomData.members);
                }
              } catch (err) {
                console.error('Failed to refresh room data:', err);
              }
            }
          }}
          style={{background: 'blue', color: 'white', padding: '5px', marginBottom: '10px', fontSize: '12px'}}
        >
          🔄 Force Refresh Members
        </button>
        
        {/* Debug info */}
        <details style={{marginBottom: '10px', fontSize: '12px', color: '#666'}}>
          <summary>Debug Info</summary>
          <pre style={{background: '#f5f5f5', padding: '10px', fontSize: '11px'}}>
            playerList: {JSON.stringify(playerList, null, 2)}
            user: {JSON.stringify(authUser, null, 2)}
          </pre>
        </details>
        <div className="players-list">
          {playerList.map((member, index) => (
            <div key={`player-${member.userId || index}-${member.username}`} className="player-item">
              <div className="player-info">
                <span className="player-name">{member.username}</span>
                {member.role === 'owner' && <span className="owner-badge">👑</span>}
                {member.userId === String(authUser?.id) && <span className="you-badge">Du</span>}
              </div>
              <div className="player-status online">Online</div>
            </div>
          ))}
          
          {/* Show empty slots */}
          {Array.from({ length: (currentRoom.settings?.max_players || 4) - playerList.length }, (_, i) => (
            <div key={`empty-slot-${playerList.length + i}`} className="player-item empty">
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
            <p>Väntar på att {playerList?.find((m: LobbyMember) => m.role === 'owner')?.username || 'spelägaren'} startar spelet</p>
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
        
        <button
          onClick={() => window.location.href = '/'}
          className="back-to-home-button secondary-button"
          style={{marginLeft: '10px'}}
        >
          Tillbaka till startsidan
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