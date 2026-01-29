import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/apiService';
import { socketService } from '../services/socketService';
import { showToast } from '../utils/toast';
import { useNavigate } from 'react-router-dom';
import { normalizeRoomCode } from '../utils/roomCode';
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

  const roomCode = normalizeRoomCode(currentRoom?.code);
  
  // Initialize player list
  const [playerList, setPlayerList] = useState<LobbyMember[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [readyPlayers, setReadyPlayers] = useState<Set<string>>(new Set());
  const [isReady, setIsReady] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Deduplicate join toasts (server may emit multiple join events)
  const lastJoinToastRef = useRef<{ key: string; at: number } | null>(null);
  const membershipResyncTimersRef = useRef<number[]>([]);
  const hasInitializedMembersRef = useRef(false);
  const knownMembersRef = useRef<Map<string, string>>(new Map());

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

  const canKickPlayers = Boolean(isActualOwner && currentRoom?.status === 'waiting');
  
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
    if (roomCode) {
      socketService.setPlayerReady(roomCode, newReadyStatus);
    }
  };

  // Join the Socket.IO room when entering the lobby
  useEffect(() => {
    if (roomCode) {
      socketService.joinRoom(roomCode);
      
      // Listen for when WE join the room - get ready status from server
      const handleRoomJoined = (data: any) => {
        if (data.readyPlayers && Array.isArray(data.readyPlayers)) {
          const ready = new Set<string>(data.readyPlayers.map(String));
          setReadyPlayers(ready);

          if (authUser?.id != null) {
            setIsReady(ready.has(String(authUser.id)));
          }
        }
      };
      
      // Listen for ready status changes
      const handlePlayerReadyChanged = (data: {
        userId: string;
        username: string;
        isReady: boolean;
        roomCode: string;
        readyPlayers?: string[];
      }) => {
        if (normalizeRoomCode(data.roomCode) === roomCode) {
          if (data.readyPlayers && Array.isArray(data.readyPlayers)) {
            const ready = new Set<string>(data.readyPlayers.map(String));
            setReadyPlayers(ready);
            if (authUser?.id != null) {
              setIsReady(ready.has(String(authUser.id)));
            }
            return;
          }

          setReadyPlayers(prev => {
            const newSet = new Set(prev);
            if (data.isReady) {
              newSet.add(String(data.userId));
            } else {
              newSet.delete(String(data.userId));
            }
            return newSet;
          });

          if (authUser?.id != null && String(data.userId) === String(authUser.id)) {
            setIsReady(data.isReady);
          }
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
  }, [currentRoom?.code, authUser?.id]);

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
      if (roomCode) {
        apiService.getRoomByCode(roomCode).then(freshData => {
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
    if (!roomCode) return;

    const currentCreatedBy = (currentRoom as any)?.createdBy ?? (currentRoom as any)?.created_by;

    let isDisposed = false;
    let isSyncInFlight = false;
    let hasPendingSync = false;

    const applyMembers = (mappedMembers: LobbyMember[]) => {
      if (isDisposed) return;

      const prev = knownMembersRef.current;
      const next = new Map<string, string>();
      for (const m of mappedMembers) {
        next.set(String(m.userId), String(m.username));
      }

      // Detect joins based on membership delta (robust even if socket events are missed)
      if (hasInitializedMembersRef.current) {
        for (const [userId, username] of Array.from(next.entries())) {
          if (!prev.has(userId)) {
            // Don't toast for ourselves
            if (authUser?.id != null && String(authUser.id) === String(userId)) continue;

            const key = `${roomCode}:${userId}`;
            const now = Date.now();
            const last = lastJoinToastRef.current;
            if (!last || last.key !== key || now - last.at > 2000) {
              lastJoinToastRef.current = { key, at: now };
              showToast(`${username} gick med i rummet.`, 'info');
            }
          }
        }
      }

      knownMembersRef.current = next;
      hasInitializedMembersRef.current = true;
      setPlayerList(mappedMembers);
    };

    const syncMembers = async () => {
      try {
        if (isDisposed || isSyncInFlight) {
          if (isSyncInFlight) {
            hasPendingSync = true;
          }
          return;
        }
        isSyncInFlight = true;

        const freshData = await apiService.getRoomByCode(roomCode);

        if (freshData?.room?.members) {
          const mappedMembers = freshData.room.members.map((member: any) => ({
            userId: String(member.id || member.userId),
            username: member.username,
            role: String(member.id || member.userId) === String(freshData.room.createdBy) ? 'owner' : 'member',
            joinedAt: new Date().toISOString(),
          }));
          if (isDisposed) return;

          // Never show an empty lobby list if we have local user/room context.
          // This prevents brief API races from wiping the UI.
          if (mappedMembers.length > 0) {
            applyMembers(mappedMembers);
          } else if (authUser) {
            applyMembers([
              {
                userId: String(authUser.id),
                username: authUser.username,
                role:
                  currentCreatedBy != null && String(currentCreatedBy).trim() === String(authUser.id).trim()
                    ? 'owner'
                    : 'member',
                joinedAt: new Date().toISOString(),
              },
            ]);
          }
        }
      } catch (err) {
        console.error('Failed to refresh after membership change:', err);
      } finally {
        isSyncInFlight = false;

        // If multiple sync triggers fired while a request was in-flight, run one
        // trailing sync to converge to the latest state.
        if (!isDisposed && hasPendingSync) {
          hasPendingSync = false;
          window.setTimeout(() => {
            void syncMembers();
          }, 0);
        }
      }
    };

    // Socket events can be missed (mobile background/reconnect) and GETs can race.
    // To make kick -> rejoin reliably visible, do a short burst of refetches.
    const scheduleMembershipResync = () => {
      // Clear any pending resync timers
      membershipResyncTimersRef.current.forEach(id => window.clearTimeout(id));
      membershipResyncTimersRef.current = [];

      // Keep this light; snapshots should do most of the work now.
      const delaysMs = [0, 1000, 2500];
      for (const delay of delaysMs) {
        const timerId = window.setTimeout(() => {
          syncMembers();
        }, delay);
        membershipResyncTimersRef.current.push(timerId);
      }
    };

    const handleMemberJoined = (data: any) => {
      try {
        const joinedUserId = data?.user?.id != null ? String(data.user.id) : null;
        const joinedUsername = data?.user?.username != null ? String(data.user.username) : null;

        // If server provided a room snapshot, apply it immediately (then still resync).
        // This reduces reliance on API timing/caching when a join happens right after a kick.
        const eventMembers = data?.room?.members;
        const eventCreatedBy = data?.room?.createdBy ?? data?.room?.created_by;
        if (Array.isArray(eventMembers)) {
          const mappedMembers = eventMembers.map((member: any) => {
            const id = member.id ?? member.userId ?? member.user_id;
            const username = member.username ?? member.user?.username;
            const role: LobbyMember['role'] =
              String(id) === String(eventCreatedBy ?? currentCreatedBy) ? 'owner' : 'member';
            return {
              userId: String(id),
              username: String(username ?? id),
              role,
              joinedAt: new Date().toISOString(),
            };
          });
          applyMembers(mappedMembers);
        }

        // If readyPlayers was sent in the event, use it directly
        if (data.readyPlayers && Array.isArray(data.readyPlayers)) {
          const ready = new Set<string>(data.readyPlayers.map(String));
          setReadyPlayers(ready);

          if (authUser?.id != null) {
            setIsReady(ready.has(String(authUser.id)));
          }
        }
        
        // Always sync from API to avoid payload-shape drift and missed updates
        scheduleMembershipResync();
        
        // Toasts are handled via applyMembers() diffs to avoid duplicates
        void joinedUserId;
        void joinedUsername;
      } catch (error) {
        console.error('❌ Error handling member joined event:', error, data);
      }
    };

    const handleMemberLeft = () => {
      try {
        scheduleMembershipResync();
      } catch (error) {
        console.error('❌ Error handling member left event:', error);
      }
    };

    socketService.on('room:member_joined', handleMemberJoined);
    socketService.on('room:member_left', handleMemberLeft);

    const handleMembersUpdated = (data: any) => {
      try {
        if (!data || normalizeRoomCode(data.roomCode) !== roomCode) return;

        // If payload includes full members snapshot, apply immediately.
        if (Array.isArray(data.members)) {
          const createdBy = data.createdBy ?? currentCreatedBy;
          const mappedMembers: LobbyMember[] = data.members.map((m: any) => {
            const id = m.id ?? m.userId ?? m.user_id;
            const username = m.username ?? m.user?.username;
            const role: LobbyMember['role'] = String(id) === String(createdBy) ? 'owner' : 'member';
            return {
              userId: String(id),
              username: String(username ?? id),
              role,
              joinedAt: new Date().toISOString(),
            };
          });
          applyMembers(mappedMembers);
        }

        // Always resync from API shortly after, to keep everything consistent.
        scheduleMembershipResync();
      } catch (e) {
        console.error('❌ Error handling room:members_updated', e, data);
      }
    };

    socketService.on('room:members_updated', handleMembersUpdated);

    // Conditional fallback polling: only run briefly around transitions where
    // socket events/timers might be missed (reconnect, background/foreground).
    let pollIntervalId: number | null = null;
    let pollStopTimeoutId: number | null = null;

    const stopPolling = () => {
      if (pollIntervalId != null) {
        window.clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
      if (pollStopTimeoutId != null) {
        window.clearTimeout(pollStopTimeoutId);
        pollStopTimeoutId = null;
      }
    };

    const startPolling = (opts?: { intervalMs?: number; durationMs?: number }) => {
      const intervalMs = opts?.intervalMs ?? 4000;
      const durationMs = opts?.durationMs ?? 20000;

      // Keep the interval if already running; just extend the stop timer.
      if (pollIntervalId == null) {
        pollIntervalId = window.setInterval(() => {
          syncMembers();
        }, intervalMs);
      }

      if (pollStopTimeoutId != null) {
        window.clearTimeout(pollStopTimeoutId);
      }
      pollStopTimeoutId = window.setTimeout(() => {
        stopPolling();
      }, durationMs);
    };

    const handleSocketConnect = () => {
      // After reconnect, run a short period of polling to converge quickly.
      startPolling({ intervalMs: 3000, durationMs: 15000 });
      void syncMembers();
    };

    const handleSocketDisconnect = () => {
      // No point polling while disconnected.
      stopPolling();
    };

    socketService.on('connect', handleSocketConnect);
    socketService.on('disconnect', handleSocketDisconnect);

    // Also sync once immediately on mount of this effect
    syncMembers();

    // When the tab regains focus/visibility, intervals/timeouts may have been throttled.
    // Force an immediate resync so the lobby updates as soon as the user returns.
    const handleVisibilityOrFocus = (event?: Event) => {
      try {
        // Only ignore the "hidden" transition. For focus/pageshow we always resync,
        // because some browsers fire focus before visibilityState updates.
        if (event?.type === 'visibilitychange' && document.visibilityState !== 'visible') {
          return;
        }

        socketService.joinRoom(roomCode);

        // Timers/websockets can be throttled in background tabs; a single sync is enough.
        void syncMembers();

        // Run short-lived polling after returning to the tab.
        startPolling({ intervalMs: 4000, durationMs: 20000 });
      } catch {
        // ignore
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('pageshow', handleVisibilityOrFocus);

    return () => {
      socketService.off('room:member_joined', handleMemberJoined);
      socketService.off('room:member_left', handleMemberLeft);
      socketService.off('room:members_updated', handleMembersUpdated);

      socketService.off('connect', handleSocketConnect);
      socketService.off('disconnect', handleSocketDisconnect);

      isDisposed = true;
      stopPolling();

      membershipResyncTimersRef.current.forEach(id => window.clearTimeout(id));
      membershipResyncTimersRef.current = [];

      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('pageshow', handleVisibilityOrFocus);
    };
  }, [currentRoom?.code, authUser?.id]);

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

  const handleKickPlayer = async (userId: string, username: string, skipConfirm = false) => {
    if (!currentRoom?.code) return;
    if (!canKickPlayers) return;

    if (!skipConfirm) {
      const ok = window.confirm(`Kicka ${username} från rummet?`);
      if (!ok) return;
    }

    try {
      await apiService.kickMember(currentRoom.code, Number(userId));
    } catch (err) {
      console.error('Failed to kick player:', err);
      alert(`Kunde inte kicka spelaren: ${err instanceof Error ? err.message : 'Okänt fel'}`);
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
            <div className="lobby-title-spacer" aria-hidden="true" />
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
          canKick={canKickPlayers}
          onKick={handleKickPlayer}
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
        currentName={currentRoom.name}
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