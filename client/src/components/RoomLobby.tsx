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
  const { currentRoom, startGame, leaveRoom, isLoading, error } = useGame();
  
  // Initialize player list
  const [playerList, setPlayerList] = useState<LobbyMember[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // authUser is direct User object {id, username} - NOT {user: {id, username}}
  const isOwner = currentRoom && authUser && String(currentRoom.createdBy).trim() === String(authUser.id).trim();
  
  // Fallback: check if user has owner role in playerList
  const isOwnerByRole = playerList.some(p => p.userId === String(authUser?.id) && p.role === 'owner');
  const isActualOwner = isOwner || isOwnerByRole;
  
  const canStartGame = playerList.length >= 2; // Minst 2 spelare krävs
  const hasEnoughPlayers = playerList.length >= 2;

  // Debug logging for start game button state
  console.log('🔍 Start game button state:', {
    isOwner,
    isOwnerByRole,
    isActualOwner,
    playerListLength: playerList.length,
    canStartGame,
    isStarting,
    isLoading,
    buttonDisabled: !canStartGame || isStarting || isLoading,
    playerList: playerList.map(p => ({ userId: p.userId, username: p.username, role: p.role }))
  });

  // Debug ownership specifically
  console.log('👑 Ownership debug:', {
    currentRoom_createdBy: currentRoom?.createdBy,
    currentRoom_createdBy_type: typeof currentRoom?.createdBy,
    authUser_full: authUser,
    authUser_id: authUser?.id, 
    authUser_id_type: typeof authUser?.id,
    authUser_keys: authUser ? Object.keys(authUser) : 'no authUser',
    createdBy_string: String(currentRoom?.createdBy || '').trim(),
    userId_string: String(authUser?.id || '').trim(),
    strings_match: String(currentRoom?.createdBy || '').trim() === String(authUser?.id || '').trim()
  });

  // Join the Socket.IO room when entering the lobby
  useEffect(() => {
    if (currentRoom?.code) {
      console.log('🚪 Joining Socket.IO room from RoomLobby:', currentRoom.code);
      socketService.joinRoom(currentRoom.code);
      
      return () => {
        console.log('🚪 Leaving Socket.IO room from RoomLobby:', currentRoom.code);
        socketService.leaveRoom(currentRoom.code);
      };
    }
  }, [currentRoom?.code]);

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
          console.log('🆕 Room created by:', freshData?.room?.createdBy);
          if (freshData?.room?.members && freshData.room.members.length > 0) {
            console.log('✅ Updating playerList with fresh data:', freshData.room.members);
            // Map server data to include role information
            const mappedMembers = freshData.room.members.map((member: any) => ({
              userId: String(member.id),
              username: member.username,
              role: String(member.id) === String(freshData.room.createdBy) ? 'owner' : 'member',
              joinedAt: new Date().toISOString()
            }));
            setPlayerList(mappedMembers);
          } else {
            console.log('⚠️ Fresh data has empty members array, keeping current user in list');
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
      console.log('🆕 Member joined room:', data);
      // Refresh room data when someone joins
      if (currentRoom.code) {
        apiService.getRoomByCode(currentRoom.code).then(freshData => {
          if (freshData?.room?.members && freshData.room.members.length > 0) {
            const mappedMembers = freshData.room.members.map((member: any) => ({
              userId: String(member.id),
              username: member.username,
              role: String(member.id) === String(freshData.room.createdBy) ? 'owner' : 'member',
              joinedAt: new Date().toISOString()
            }));
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
            // Backend returns { room: { members: [...] } }
            const members = freshData?.room?.members || freshData?.members;
            if (members && members.length > 0) {
              const mappedMembers = members.map((m: any) => ({
                userId: String(m.id || m.userId),
                username: m.username,
                role: (m.id || m.userId) === freshData?.room?.createdBy ? 'owner' : 'member',
                joinedAt: new Date().toISOString()
              }));
              setPlayerList(mappedMembers);
            }
          }).catch(err => console.error('❌ Failed to fetch after join:', err));
        }
      }
    };

    const handleRoomLeft = (data: any) => {
      console.log('📤 Room left event:', data);
      if (data?.user?.id) {
        setPlayerList(prev => prev.filter(member => member.userId !== String(data.user.id)));
      }
    };

    const handleRoomUpdated = (data: any) => {
      console.log('🔄 Room updated event:', data);
      if (data.room?.members && Array.isArray(data.room.members)) {
        console.log('🔄 Updating member list from room update:', data.room.members);
        setPlayerList(data.room.members);
      }
    };

    // Listen for our own join confirmation with full member list
    const handleRoomJoined = (data: any) => {
      console.log('✅ Room joined confirmation:', data);
      if (data.room?.members && Array.isArray(data.room.members) && data.room.members.length > 0) {
        console.log('✅ Setting member list from join confirmation:', data.room.members);
        setPlayerList(data.room.members);
      }
    };

    socketService.on('room:member_joined', handleMemberJoined);
    socketService.on('room:left', handleRoomLeft);
    socketService.on('room:updated', handleRoomUpdated);
    socketService.on('room:joined', handleRoomJoined);

    // Periodic sync to ensure member list stays up to date
    let syncInterval: NodeJS.Timeout;
    if (currentRoom?.code) {
      syncInterval = setInterval(() => {
        console.log('🔄 Periodic member sync...');
        apiService.getRoomByCode(currentRoom.code).then(freshData => {
          // Backend returns { room: { members: [...] } }
          const members = freshData?.room?.members || freshData?.members;
          if (members && members.length > 0) {
            const mappedMembers = members.map((m: any) => ({
              userId: String(m.id || m.userId),
              username: m.username,
              role: (m.id || m.userId) === freshData?.room?.createdBy ? 'owner' : 'member',
              joinedAt: new Date().toISOString()
            }));
            
            setPlayerList(prev => {
              // Only update if member list actually changed
              const currentIds = prev.map(p => p.userId).sort();
              const freshIds = mappedMembers.map((m: any) => m.userId).sort();
              
              if (JSON.stringify(currentIds) !== JSON.stringify(freshIds)) {
                console.log('👥 Periodic sync: Member list changed, updating...', mappedMembers);
                return mappedMembers;
              }
              return prev;
            });
          }
        }).catch(err => console.error('❌ Periodic sync failed:', err));
      }, 3000); // Sync every 3 seconds for faster updates
    }

    return () => {
      socketService.off('room:member_joined', handleMemberJoined);
      socketService.off('room:left', handleRoomLeft);
      socketService.off('room:updated', handleRoomUpdated);
      socketService.off('room:joined', handleRoomJoined);
      if (syncInterval) clearInterval(syncInterval);
    };
  }, [currentRoom]);

  const handleStartGame = async () => {
    console.log('🎯 handleStartGame called!', {
      currentRoom: !!currentRoom,
      canStartGame,
      playerListLength: playerList.length,
      isOwner,
      isStarting,
      isLoading
    });
    
    if (!currentRoom || !canStartGame) {
      console.log('❌ Start game blocked:', {
        hasRoom: !!currentRoom,
        canStart: canStartGame,
        reason: !currentRoom ? 'No room' : 'Not enough players'
      });
      return;
    }
    
    try {
      console.log('✅ Starting game for room:', currentRoom.id);
      console.log('🏠 Room status before start:', currentRoom.status);
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
      console.log('🔄 Resetting room to waiting status...');
      console.log('🏠 Room code:', currentRoom.code);
      console.log('🔑 Auth token exists:', !!localStorage.getItem('token'));
      setIsResetting(true);
      
      const url = `/api/rooms/${currentRoom.code}/reset`;
      console.log('📍 Reset URL:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('📊 Reset response status:', response.status);
      
      if (response.ok) {
        console.log('✅ Room reset successful');
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
                // Backend returns { room: { members: [...] } }
                const members = freshRoomData?.room?.members || freshRoomData?.members;
                if (members && members.length > 0) {
                  const mappedMembers = members.map((m: any) => ({
                    userId: String(m.id || m.userId),
                    username: m.username,
                    role: (m.id || m.userId) === freshRoomData?.room?.createdBy ? 'owner' : 'member',
                    joinedAt: new Date().toISOString()
                  }));
                  console.log('Setting player list to:', mappedMembers);
                  setPlayerList(mappedMembers);
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
        
        {/* Backend debug button */}
        <button 
          onClick={async () => {
            if (currentRoom?.code) {
              console.log('🔍 Fetching backend debug data...');
              try {
                const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
                const token = localStorage.getItem('auth_token');
                const response = await fetch(`${serverUrl}/api/rooms/${currentRoom.code}/debug`, {
                  headers: {
                    'Authorization': `Bearer ${token}`
                  }
                });
                const debugData = await response.json();
                console.log('🔍 BACKEND DEBUG DATA:', debugData);
                alert('Check console for backend debug data!\n\nRaw members in DB: ' + debugData.rawMembers?.length + '\nMembers: ' + debugData.memberCount);
              } catch (err) {
                console.error('Failed to get debug data:', err);
              }
            }
          }}
          style={{background: 'purple', color: 'white', padding: '5px', marginBottom: '10px', fontSize: '12px', marginLeft: '5px'}}
        >
          🔍 Backend Debug
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
        {isActualOwner && (
          <>
            <button
              onClick={handleStartGame}
              disabled={!canStartGame || isStarting || isLoading}
              className="start-game-button primary-button"
              title={!canStartGame ? 'Minst 2 spelare krävs för att starta' : 'Starta spelet'}
            >
              {isStarting ? 'Startar spel...' : !canStartGame ? `Starta spel (${playerList.length}/2 spelare)` : 'Starta spel'}
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