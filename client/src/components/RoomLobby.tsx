import React, { useEffect, useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/apiService';
import { socketService } from '../services/socketService';
import RoomSettings from './RoomSettings';
import PlayersList from './PlayersList';
import TipsModal from './TipsModal';

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
  
  const hasEnoughPlayers = playerList.length >= 2;
  
  // Check if all non-owner players are ready - using readyPlayers state
  const nonOwnerPlayers = playerList.filter(p => p.role !== 'owner');
  const nonReadyPlayersCount = nonOwnerPlayers.filter(p => !readyPlayers.has(p.userId)).length;
  const totalPlayersCount = playerList.length;
  const allPlayersReady = nonOwnerPlayers.length === 0 || 
    (nonOwnerPlayers.every(p => readyPlayers.has(p.userId)));
  
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
        socketService.leaveRoom(currentRoom.code);
        socketService.off('room:joined', handleRoomJoined);
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
      // If readyPlayers was sent in the event, use it directly
      if (data.readyPlayers && Array.isArray(data.readyPlayers)) {
        const ready = new Set<string>(data.readyPlayers.map(String));
        setReadyPlayers(ready);
      }
      
       // Update playerList directly from socket event (instant)
       if (data.room?.members && data.room.members.length > 0) {
         const mappedMembers = data.room.members.map((member: any) => ({
           userId: String(member.userId),
           username: member.username,
           role: member.role,
           joinedAt: new Date().toISOString()
         }));
         setPlayerList(mappedMembers);
       }
    };

    const handleMemberLeft = () => {
      // Refresh room data when someone leaves
      if (currentRoom.code) {
        apiService.getRoomByCode(currentRoom.code).then(freshData => {
          if (freshData?.room?.members) {
            const mappedMembers = freshData.room.members.map((member: any) => ({
              userId: String(member.id),
              username: member.username,
              role: String(member.id) === String(freshData.room.createdBy) ? 'owner' : 'member',
              joinedAt: new Date().toISOString()
            }));
            setPlayerList(mappedMembers);
          }
        }).catch(err => {
          console.error('Failed to refresh after member left:', err);
        });
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

      <RoomSettings 
        gridSize={currentRoom.settings?.grid_size || 5}
        maxPlayers={currentRoom.settings?.max_players || 6}
        letterTimer={currentRoom.settings?.letter_timer || 20}
        placementTimer={currentRoom.settings?.placement_timer || 30}
        onShowTips={() => setShowTips(true)}
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
    </div>
  );
};

export default RoomLobby;