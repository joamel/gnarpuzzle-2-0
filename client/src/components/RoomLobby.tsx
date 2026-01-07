import React, { useEffect, useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/apiService';

interface RoomLobbyProps {
  onStartGame: () => void;
}

// Extended Player type for lobby display
import { socketService } from '../services/socketService';

interface LobbyMember {
  userId: string;
  username: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

const RoomLobby: React.FC<RoomLobbyProps> = ({ onStartGame }) => {
  const { user: authUser } = useAuth();
  const { currentRoom, startGame, isLoading, error } = useGame();
  
  // Initialize player list
  const [playerList, setPlayerList] = useState<LobbyMember[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const [readyPlayers, setReadyPlayers] = useState<Set<string>>(new Set());
  const [isReady, setIsReady] = useState(false);

  // authUser is direct User object {id, username} - NOT {user: {id, username}}
  const isOwner = currentRoom && authUser && String(currentRoom.createdBy).trim() === String(authUser.id).trim();
  
  // Fallback: check if user has owner role in playerList
  const isOwnerByRole = playerList.some(p => p.userId === String(authUser?.id) && p.role === 'owner');
  const isActualOwner = isOwner || isOwnerByRole;
  
  const canStartGame = playerList.length >= 2; // Minst 2 spelare krävs
  const hasEnoughPlayers = playerList.length >= 2;
  
  // Check if all non-owner players are ready
  const nonOwnerPlayers = playerList.filter(p => p.role !== 'owner');
  const allPlayersReady = nonOwnerPlayers.length === 0 || 
    (nonOwnerPlayers.every(p => p.userId === String(authUser?.id) ? isReady : readyPlayers.has(p.userId)));
  
  const canActuallyStartGame = hasEnoughPlayers && allPlayersReady;

  // Handle ready status change
  const handleReadyChange = (newReadyStatus: boolean) => {
    setIsReady(newReadyStatus);
    if (currentRoom?.code) {
      socketService.setPlayerReady(currentRoom.code, newReadyStatus);
    }
  };

  // Join the Socket.IO room when entering the lobby
  useEffect(() => {
    if (currentRoom?.code) {
      console.log('🟢 RoomLobby: currentRoom changed, code:', currentRoom.code);
      console.log('🟢 RoomLobby: socketService.isConnected():', socketService.isConnected());
      socketService.joinRoom(currentRoom.code);
      
      // Listen for ready status changes
      const handlePlayerReadyChanged = (data: {
        userId: string;
        username: string;
        isReady: boolean;
        roomCode: string;
      }) => {
        if (data.roomCode === currentRoom.code) {
          setReadyPlayers(prev => {
            const newSet = new Set(prev);
            if (data.isReady) {
              newSet.add(data.userId);
            } else {
              newSet.delete(data.userId);
            }
            return newSet;
          });
        }
      };
      
      socketService.on('player:ready_changed', handlePlayerReadyChanged);
      
      return () => {
        socketService.leaveRoom(currentRoom.code);
        socketService.off('player:ready_changed', handlePlayerReadyChanged);
      };
    }
  }, [currentRoom?.code]);

  useEffect(() => {
    // console.log('🏠 RoomLobby - currentRoom updated:', currentRoom);
    // console.log('👤 Raw authUser:', authUser);
    // console.log('🆔 User ID:', authUser?.id);
    // console.log('📝 Username:', authUser?.username);
    // console.log('👑 isOwner check:', {
    //   createdBy: currentRoom?.createdBy,
    //   userId: authUser?.id,
    //   createdByString: String(currentRoom?.createdBy).trim(),
    //   userIdString: String(authUser?.id).trim(),
    //   isOwner: currentRoom && authUser && String(currentRoom.createdBy).trim() === String(authUser.id).trim()
    // });
    
    // Since Room doesn't have players property, always add user if room exists
    if (currentRoom && authUser) {
      // Add the current user to player list
      // console.log('⚠️ RoomLobby - adding self to player list. User data:', authUser);
      // console.log('🏠 Room createdBy:', currentRoom.createdBy, 'User ID:', authUser.id);
      setPlayerList([{
        userId: String(authUser.id),
        username: authUser.username,
        role: String(currentRoom.createdBy).trim() === String(authUser.id).trim() ? 'owner' : 'member',
        joinedAt: new Date().toISOString()
      }]);
      
      // Force refresh to get latest member data from server
      // console.log('🔄 Attempting to fetch fresh member data...');
      if (currentRoom.code) {
        apiService.getRoomByCode(currentRoom.code).then(freshData => {
          // console.log('🆕 Fresh room data received:', freshData);
          // console.log('🆕 Fresh members array:', freshData?.room?.members);
          // console.log('🆕 Room created by:', freshData?.room?.createdBy);
          if (freshData?.room?.members && freshData.room.members.length > 0) {
            // console.log('✅ Updating playerList with fresh data:', freshData.room.members);
            // Map server data to include role information
            const mappedMembers = freshData.room.members.map((member: any) => ({
              userId: String(member.id),
              username: member.username,
              role: String(member.id) === String(freshData.room.createdBy) ? 'owner' : 'member',
              joinedAt: new Date().toISOString()
            }));
            setPlayerList(mappedMembers);
          } else {
            // console.log('⚠️ Fresh data has empty members array, keeping current user in list');
            // If server doesn't return members, keep at least current user
            setPlayerList([{
              userId: String(authUser.id),
              username: authUser.username,
              role: String(currentRoom.createdBy).trim() === String(authUser.id).trim() ? 'owner' : 'member',
              joinedAt: new Date().toISOString()
            }]);
          }
        }).catch(err => {
          console.error('❌ Failed to fetch fresh room data:', err);
        });
      }
    }
  }, [currentRoom, authUser]);

  // Listen for new members joining
  useEffect(() => {
    if (!currentRoom?.code) return;

    const handleMemberJoined = (data: any) => {
      console.log('🟦 room:member_joined event:', data);
      // Refresh room data when someone joins
      if (currentRoom.code) {
        apiService.getRoomByCode(currentRoom.code).then(freshData => {
          console.log('🟨 Fresh room data after member join:', freshData?.room?.members);
          if (freshData?.room?.members && freshData.room.members.length > 0) {
            const mappedMembers = freshData.room.members.map((member: any) => ({
              userId: String(member.id),
              username: member.username,
              role: String(member.id) === String(freshData.room.createdBy) ? 'owner' : 'member',
              joinedAt: new Date().toISOString()
            }));
            console.log('🟩 Setting playerList:', mappedMembers);
            setPlayerList(mappedMembers);
          }
        }).catch(err => {
          console.error('Failed to refresh after member joined:', err);
        });
      }
    };

    socketService.on('room:member_joined', handleMemberJoined);

    return () => {
      socketService.off('room:member_joined', handleMemberJoined);
    };
  }, [currentRoom?.code]);

  const handleStartGame = async () => {
    if (!currentRoom || !canStartGame) {
      return;
    }
    
    try {
      setIsStarting(true);
      await startGame(currentRoom.id);
      onStartGame();
    } catch (err) {
      console.error('Failed to start game:', err);
      console.error('Current room status:', currentRoom?.status);
      
      // Show user-friendly error message
      if (err instanceof Error && err.message.includes('Invalid room state')) {
        alert(`Cannot start game. Room status is "${currentRoom?.status}". Room must be in "waiting" status to start a game.`);
      }
    } finally {
      setIsStarting(false);
    }
  };

  const handleResetRoom = async () => {
    if (!currentRoom) return;
    
    try {
      setIsResetting(true);
      
      const url = `/api/rooms/${currentRoom.code}/reset`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        alert('Room has been reset to waiting status!');
        // Refresh room data
        window.location.reload();
      } else {
        const error = await response.json();
        console.error('❌ Reset failed:', error);
        console.error('📄 Full response:', {
          status: response.status,
          statusText: response.statusText,
          error
        });
        alert(`Failed to reset room: ${error.message || error.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Reset room error:', err);
      alert(`Failed to reset room: ${err instanceof Error ? err.message : 'Network error'}`);
    } finally {
      setIsResetting(false);
    }
  };

  if (!currentRoom) {
    return <div>Loading room...</div>;
  }

  return (
    <div className="room-lobby">
      <div className="lobby-header">
        <h2>{currentRoom.name}</h2>
        <div className="room-code-section">
          <div className="room-code">
            <span>Kod: <strong>{currentRoom.code}</strong></span>
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(currentRoom.code)}
            className="copy-code-button"
            title="Kopiera rumkod"
          >
            📋
          </button>
        </div>
      </div>

      <div className="room-settings">
        <div className="settings-header">
          <h3>Spelinställningar</h3>
          <button
            onClick={() => setShowTips(!showTips)}
            className="tips-button"
            title="Tips och regler"
          >
            ?
          </button>
        </div>
        <div className="settings-grid">
          <div className="setting-item">
            <span className="setting-label">Rutstorlek:</span>
            <span className="setting-value">{currentRoom.settings?.grid_size || 5}×{currentRoom.settings?.grid_size || 5}</span>
          </div>
          <div className="setting-item">
            <span className="setting-label">Max spelare:</span>
            <span className="setting-value">{currentRoom.settings?.max_players || 6}</span>
          </div>
          <div className="setting-item">
            <span className="setting-label">Bokstavstid:</span>
            <span className="setting-value">{currentRoom.settings?.letter_timer || 20}s</span>
          </div>
          <div className="setting-item">
            <span className="setting-label">Placeringstid:</span>
            <span className="setting-value">{currentRoom.settings?.placement_timer || 30}s</span>
          </div>
        </div>
      </div>

      <div className="players-section">
        <h3>Spelare ({playerList.length}/{currentRoom.settings?.max_players || 6})</h3>        
        <div className="players-list">
          {playerList.map((member, index) => {
            const isCurrentUser = member.userId === String(authUser?.id);
            const isOwner = member.role === 'owner';
            const isPlayerReady = readyPlayers.has(member.userId);
            
            console.log(`🟧 Rendering player: ${member.username} (userId: ${member.userId}, authId: ${String(authUser?.id)}, isCurrentUser: ${isCurrentUser})`);
            
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
                            onChange={(e) => handleReadyChange(e.target.checked)}
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
          {Array.from({ length: (currentRoom.settings?.max_players || 6) - playerList.length }, (_, i) => (
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
        {isActualOwner && (
          <>
            <button
              onClick={handleStartGame}
              disabled={!canActuallyStartGame || isStarting || isLoading}
              className="start-game-button primary-button"
              title={!hasEnoughPlayers ? 'Minst 2 spelare krävs för att starta' : !allPlayersReady ? 'Alla spelare måste vara redo' : 'Starta spelet'}
            >
              {isStarting ? 'Startar spel...' : !canActuallyStartGame ? `Väntar på spelare (${playerList.length}/2)` : 'Starta spel'}
            </button>
            
            {/* Reset room button - only show if room status is not waiting */}
            {currentRoom?.status !== 'waiting' && (
              <button
                onClick={handleResetRoom}
                disabled={isResetting}
                className="reset-room-button secondary-button"
                style={{marginLeft: '10px'}}
              >
                {isResetting ? 'Återställer...' : 'Återställ rum'}
              </button>
            )}
          </>
        )}

        {!isOwner && (
          <div className="waiting-message">
            {!hasEnoughPlayers ? (
              <p>Väntar på fler spelare för att starta ({playerList.length}/2)</p>
            ) : !isReady ? (
              <p>👉 Du måste trycka redo för att starta</p>
            ) : (
              <p>Väntar på att spelledaren startar spelet.</p>
            )}
          </div>
        )}
      </div>
      
      {/* Tips Modal */}
      {showTips && (
        <>
          <div className="modal-backdrop" onClick={() => setShowTips(false)} />
          <div className="tips-modal">
            <div className="modal-header">
              <h4>💡 Tips & Regler</h4>
              <button 
                onClick={() => setShowTips(false)}
                className="modal-close-button"
                title="Stäng"
              >
                ✕
              </button>
            </div>
            <div className="modal-content">
              <ul>
                <li><strong>Så här går det till:</strong> Välj bokstav → Placera på brädet → Få poäng för ord</li>
                <li><strong>Spelare:</strong> Minst 2 spelare krävs för att starta</li>
                <li><strong>Bjud in:</strong> Dela rumkoden med vänner</li>
                <li><strong>Poäng:</strong> 1 poäng per bokstav + 2 extra för helrader/kolumner</li>
                <li><strong>Tidsgränser:</strong> {currentRoom.settings?.letter_timer || 20}s för bokstavsval, {currentRoom.settings?.placement_timer || 30}s för placering</li>
                <li><strong>Strategi:</strong> Försök bilda längre ord för mer poäng</li>
                <li><strong>Bonus:</strong> Fyll en hel rad eller kolumn för extra poäng</li>
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default RoomLobby;