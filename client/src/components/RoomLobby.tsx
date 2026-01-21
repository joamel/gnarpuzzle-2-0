import React, { useEffect, useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/apiService';
import { socketService } from '../services/socketService';
import { useNavigate } from 'react-router-dom';
import RoomSettings from './RoomSettings';
import PlayersList from './PlayersList';
import TipsModal from './TipsModal';
import { RoomSettingsModal, RoomSettingsData } from './RoomSettingsModal';

interface RoomLobbyProps {
  onStartGame: () => void;
}

interface LobbyMember {
  userId: string;
  username: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

const RoomLobby: React.FC<RoomLobbyProps> = ({ onStartGame }) => {
  const { user: authUser } = useAuth();
  const { currentRoom, startGame, isLoading, error, leaveRoom } = useGame();
  const navigate = useNavigate();
  
  // Initialize player list
  const [playerList, setPlayerList] = useState<LobbyMember[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [readyPlayers, setReadyPlayers] = useState<Set<string>>(new Set());
  const [isReady, setIsReady] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // authUser is direct User object {id, username} - NOT {user: {id, username}}
  const isOwner = currentRoom && authUser && String(currentRoom.createdBy).trim() === String(authUser.id).trim();
  
  // Fallback: check if user has owner role in playerList
  const isOwnerByRole = playerList.some(p => p.userId === String(authUser?.id) && p.role === 'owner');
  const isActualOwner = isOwner || isOwnerByRole;
  
  // Check if this is a standard room (standard public rooms have specific names)
  // Standard rooms should not allow settings changes
  const standardRoomNames = ['Snabbspel 4×4', 'Klassiskt 5×5', 'Utmaning 6×6'];
  const isStandardRoom = currentRoom && standardRoomNames.includes(currentRoom.name);
  
  const hasEnoughPlayers = playerList.length >= 2;
  
  // Check if all non-owner players are ready - using readyPlayers state
  const nonOwnerPlayers = playerList.filter(p => p.role !== 'owner');
  const nonReadyPlayersCount = nonOwnerPlayers.filter(p => !readyPlayers.has(p.userId)).length;
  const totalPlayersCount = playerList.length;
  const allPlayersReady = nonOwnerPlayers.length === 0 || 
    (nonOwnerPlayers.every(p => readyPlayers.has(p.userId)));
  
  // Can start game if we have enough players and all are ready
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
      socketService.joinRoom(currentRoom.code);
      
      // Listen for when WE join the room - get ready status from server
      const handleRoomJoined = (data: any) => {
        if (data.readyPlayers && Array.isArray(data.readyPlayers)) {
          const ready = new Set<string>(data.readyPlayers.map(String));
          setReadyPlayers(ready);
        }
      };
      
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
      
      socketService.on('room:joined', handleRoomJoined);
      socketService.on('player:ready_changed', handlePlayerReadyChanged);
      
      return () => {
        // Don't leave the socket room on unmount - let cleanup happen naturally
        socketService.off('room:joined', handleRoomJoined);
        socketService.off('player:ready_changed', handlePlayerReadyChanged);
      };
    }
  }, [currentRoom?.code]);

  useEffect(() => {
    // Since Room doesn't have players property, always add user if room exists
    if (currentRoom && authUser) {
      // Add the current user to player list
      setPlayerList([{
        userId: String(authUser.id),
        username: authUser.username,
        role: String(currentRoom.createdBy).trim() === String(authUser.id).trim() ? 'owner' : 'member',
        joinedAt: new Date().toISOString()
      }]);
      
      // Force refresh to get latest member data from server
      if (currentRoom.code) {
        apiService.getRoomByCode(currentRoom.code).then(freshData => {
          if (freshData?.room?.members && freshData.room.members.length > 0) {
            // Map server data to include role information
            const mappedMembers = freshData.room.members.map((member: any) => ({
              userId: String(member.id || member.userId), // Handle both formats
              username: member.username,
              role: String(member.id || member.userId) === String(freshData.room.createdBy) ? 'owner' : 'member',
              joinedAt: new Date().toISOString()
            }));
            setPlayerList(mappedMembers);
          } else {
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
      try {
        // If readyPlayers was sent in the event, use it directly
        if (data.readyPlayers && Array.isArray(data.readyPlayers)) {
          const ready = new Set<string>(data.readyPlayers.map(String));
          setReadyPlayers(ready);
        }
        
         // Update playerList directly from socket event (instant)
         if (data.room?.members && data.room.members.length > 0) {
           const mappedMembers = data.room.members.map((member: any) => ({
             userId: String(member.id || member.userId), // Handle both formats
             username: member.username,
             role: member.role || (String(member.id || member.userId) === String(data.room.createdBy) ? 'owner' : 'member'),
             joinedAt: new Date().toISOString()
           }));
           setPlayerList(mappedMembers);
         }
      } catch (error) {
        console.error('❌ Error handling member joined event:', error, data);
      }
    };

    const handleMemberLeft = () => {
      try {
        // Refresh room data when someone leaves
        if (currentRoom.code) {
          apiService.getRoomByCode(currentRoom.code).then(freshData => {
            if (freshData?.room?.members) {
              const mappedMembers = freshData.room.members.map((member: any) => ({
                userId: String(member.id || member.userId), // Handle both formats
                username: member.username,
                role: String(member.id || member.userId) === String(freshData.room.createdBy) ? 'owner' : 'member',
                joinedAt: new Date().toISOString()
              }));
              setPlayerList(mappedMembers);
            }
          }).catch(err => {
            console.error('Failed to refresh after member left:', err);
          });
        }
      } catch (error) {
        console.error('❌ Error handling member left event:', error);
      }
    };

    socketService.on('room:member_joined', handleMemberJoined);
    socketService.on('room:member_left', handleMemberLeft);

    return () => {
      socketService.off('room:member_joined', handleMemberJoined);
      socketService.off('room:member_left', handleMemberLeft);
    };
  }, [currentRoom?.code]);

  const handleStartGame = async () => {
    if (!currentRoom || !canActuallyStartGame) {
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

  const handleLeaveRoom = async () => {
    if (!currentRoom?.code) {
      navigate('/');
      return;
    }

    try {
      await leaveRoom(true);
    } finally {
      navigate('/');
    }
  };

  const handleSaveSettings = async (settings: RoomSettingsData) => {
    if (!currentRoom) return;
    
    try {
      await apiService.updateRoomSettings(currentRoom.id, settings);
      // Close modal and let socket event handle room update
      setShowSettings(false);
    } catch (err) {
      console.error('Failed to save settings:', err);
      throw err;
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

  const handleShareRoom = async () => {
    if (!currentRoom) return;
    
    const password = (currentRoom.settings as any)?.require_password ? (currentRoom.settings as any)?.password : '';
    let shareUrl = `${window.location.origin}/game?room=${currentRoom.code}`;
    
    if (password) {
      shareUrl += `&password=${encodeURIComponent(password)}`;
    }
    
    try {
      if (navigator.share) {
        // Use Web Share API if available (mobile)
        await navigator.share({
          title: `GnarPuzzle - ${currentRoom.name}`,
          text: `Gå med i mitt GnarPuzzle rum: ${currentRoom.name}`,
          url: shareUrl,
        });
      } else {
        // Fallback to clipboard
        await navigator.clipboard.writeText(shareUrl);
        alert('Länk kopierad till urklipp!');
      }
    } catch (err) {
      // Fallback if clipboard fails
      setShowShareModal(true);
    }
  };

  if (!currentRoom) {
    return <div>Loading room...</div>;
  }

  return (
    <div className="room-lobby">
      <div className="lobby-content-scrollable">
        <div className="lobby-header">
          <div className="lobby-title-row">
            <h2>{currentRoom.name}</h2>
            <button
              type="button"
              onClick={handleLeaveRoom}
              className="leave-room-button"
              aria-label="Lämna rummet"
            >
              🚪 Lämna
            </button>
          </div>
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
            <button
              onClick={handleShareRoom}
              className="share-room-button"
              title="Dela rum-länk"
            >
              🔗
            </button>
          </div>
        </div>

        <RoomSettings 
          gridSize={currentRoom.settings?.grid_size || 5}
          maxPlayers={currentRoom.settings?.max_players || 6}
          letterTimer={currentRoom.settings?.letter_timer || 20}
          placementTimer={currentRoom.settings?.placement_timer || 30}
          onShowTips={() => setShowTips(true)}
          isOwner={isActualOwner && !isStandardRoom}
          onShowSettings={() => setShowSettings(true)}
        />

        <PlayersList 
          playerList={playerList}
          readyPlayers={readyPlayers}
          authUserId={authUser?.id}
          isReady={isReady}
          maxPlayers={currentRoom.settings?.max_players || 6}
          onReadyChange={handleReadyChange}
        />

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
      </div>

      <div className="lobby-actions">
        {isActualOwner && (
          <>
            <button
              onClick={handleStartGame}
              disabled={!canActuallyStartGame || isStarting || isLoading}
              className="start-game-button primary-button"
              title={!hasEnoughPlayers ? 'Minst 2 spelare krävs för att starta' : !allPlayersReady ? 'Alla spelare måste vara redo' : 'Starta spelet'}
            >
              {isStarting ? 'Startar spel...' : !canActuallyStartGame ? `Väntar på spelare (${nonReadyPlayersCount}/${totalPlayersCount})` : 'Starta spel'}
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

        {isActualOwner && !canActuallyStartGame && (
          <div className="waiting-message">
            {!hasEnoughPlayers ? (
              <p>Väntar på fler spelare för att starta (minst 2 behövs)</p>
            ) : !allPlayersReady ? (
              <p>⏳ Väntar på att alla spelare ska bli redo ({readyPlayers.size}/{nonOwnerPlayers.length} redo)</p>
            ) : null}
          </div>
        )}

        {!isActualOwner && (
          <div className="waiting-message">
            {!hasEnoughPlayers ? (
              <p>Väntar på fler spelare för att starta ({nonReadyPlayersCount}/{totalPlayersCount})</p>
            ) : !isReady ? (
              <p>👉 Du måste trycka redo för att starta</p>
            ) : (
              <p>✓ Redo! Väntar på att spelledaren startar spelet.</p>
            )}
          </div>
        )}
      </div>
      
      <TipsModal 
        isOpen={showTips}
        onClose={() => setShowTips(false)}
        gridSize={currentRoom.settings?.grid_size || 5}
        letterTimer={currentRoom.settings?.letter_timer || 20}
        placementTimer={currentRoom.settings?.placement_timer || 30}
      />
      
      <RoomSettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSave={handleSaveSettings}
        currentSettings={{
          max_players: currentRoom.settings?.max_players || 4,
          grid_size: currentRoom.settings?.grid_size || 5,
          letter_timer: currentRoom.settings?.letter_timer || 20,
          placement_timer: currentRoom.settings?.placement_timer || 30
        }}
      />
      
      {/* Share Modal */}
      {showShareModal && (
        <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
          <div className="modal-content share-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Dela rum</h3>
              <button onClick={() => setShowShareModal(false)} className="close-button">×</button>
            </div>
            <div className="modal-body">
              <p>Kopiera denna länk och dela den med dina vänner:</p>
              <div className="share-url-container">
                <input 
                  type="text" 
                  value={`${window.location.origin}/game?room=${currentRoom.code}${(currentRoom.settings as any)?.require_password ? `&password=${encodeURIComponent((currentRoom.settings as any)?.password || '')}` : ''}`}
                  readOnly 
                  className="share-url-input"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button 
                  onClick={() => {
                    const input = document.querySelector('.share-url-input') as HTMLInputElement;
                    input.select();
                    document.execCommand('copy');
                    alert('Länk kopierad!');
                    setShowShareModal(false);
                  }}
                  className="copy-url-button"
                >
                  Kopiera
                </button>
              </div>
              {(currentRoom.settings as any)?.require_password && (
                <p className="password-warning">
                  ⚠️ Denna länk inkluderar lösenordet för rummet
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomLobby;