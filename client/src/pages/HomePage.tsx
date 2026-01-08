import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useGame } from '../contexts/GameContext';
import { apiService } from '../services/apiService';
import { socketService } from '../services/socketService';
import { Room } from '../types/game';
import Logo from '@/assets/Logo';
import '../styles/home.css';

const HomePage: React.FC = () => {
  const { logout, user } = useAuth();
  const { joinRoom, currentRoom, leaveRoom } = useGame();
  const navigate = useNavigate();
  const shouldNavigate = useRef(false);
  
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false); // For modal visibility
  const [creatingRoom, setCreatingRoom] = useState(false); // For actual room creation
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [error, setError] = useState('');
  const [roomName, setRoomName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [boardSize, setBoardSize] = useState(5); // Match server default
  const [letterTimer, setLetterTimer] = useState(20); // Letter selection time
  const [placementTimer, setPlacementTimer] = useState(30); // Letter placement time
  const [requirePassword, setRequirePassword] = useState(false); // Use room code as password
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [pendingRoomCode, setPendingRoomCode] = useState(''); // Room code waiting for password

  // Load available rooms
  const loadRooms = async () => {
    try {
      const rooms = await apiService.getRooms();
      setAvailableRooms(Array.isArray(rooms) ? rooms : []);
    } catch (err) {
      console.error('Failed to load rooms:', err);
      setAvailableRooms([]);
    }
  };

  useEffect(() => {
    loadRooms();
    
    const interval = setInterval(loadRooms, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-leave room when arriving at lobby (HomePage)
  // This ensures clean state when user navigates back from game
  useEffect(() => {
    if (currentRoom) {

      leaveRoom().catch(err => {
        console.error('Failed to auto-leave room:', err);
      });
    }
  }, []); // Only run once on mount

  // Handle navigation to game if already in a room
  useEffect(() => {
    if (currentRoom && shouldNavigate.current) {
      shouldNavigate.current = false;
      // Use setTimeout to avoid navigation during render
      setTimeout(() => {
        navigate('/game');
      }, 0);
    }
  }, [currentRoom, navigate]);

  // Socket.IO event listeners for real-time updates
  useEffect(() => {
    if (!socketService.isConnected()) return;

    const handleRoomCreated = () => {
      loadRooms();
    };

    const handleRoomJoined = () => {
      loadRooms();
    };

    const handleRoomLeft = () => {
      loadRooms();
    };

    const handleRoomUpdated = () => {
      loadRooms();
    };

    // Register socket events
    socketService.on('room:created', handleRoomCreated);
    socketService.on('room:joined', handleRoomJoined);
    socketService.on('room:left', handleRoomLeft);
    socketService.on('room:updated', handleRoomUpdated);

    return () => {
      socketService.off('room:created', handleRoomCreated);
      socketService.off('room:joined', handleRoomJoined);
      socketService.off('room:left', handleRoomLeft);
      socketService.off('room:updated', handleRoomUpdated);
    };
  }, []);

  const joinRoomByCode = async (code: string, password?: string) => {
    if (!code.trim()) return;

    setIsJoiningRoom(true);
    setError('');

    try {
      shouldNavigate.current = true;
      await joinRoom(code.trim(), password);
    } catch (err: any) {
      // Check if password is required
      if (err.message && err.message.includes('Password required')) {
        setPendingRoomCode(code);
        setShowPasswordPrompt(true);
        setPasswordInput('');
      } else if (err.message && err.message.includes('Invalid password')) {
        setError('Felaktig lösenordskod');
        setPendingRoomCode(code);
        setShowPasswordPrompt(true);
        setPasswordInput('');
      } else {
        setError(err.message || 'Kunde inte gå med i rum');
      }
    } finally {
      setIsJoiningRoom(false);
    }
  };

  const handlePasswordSubmit = async () => {
    if (!pendingRoomCode || !passwordInput.trim()) return;

    await joinRoomByCode(pendingRoomCode, passwordInput.trim());
    setShowPasswordPrompt(false);
    setPasswordInput('');
    setPendingRoomCode('');
  };

  return (
    <>
      <div className="home-page">
        {/* Mobile Header */}
        <header className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Logo size="small" showText={true} />
          </div>
          <button 
            onClick={async () => {
              localStorage.clear();
              await logout();
              window.location.reload();
            }}
            className="logout-button"
            aria-label="Logga ut"
          >
            Logga ut
          </button>
        </header>

        <div className="home-content">
          {/* Welcome Section */}
          <div style={{marginBottom: '24px', textAlign: 'center', paddingTop: '8px'}}>
            <h2 style={{fontSize: '20px', fontWeight: '600', margin: '0 0 8px 0', color: '#4c63d2'}}>Välkommen till GnarPuzzle</h2>
            <p style={{fontSize: '14px', margin: 0, opacity: 0.7, color: '#666'}}>Skapa eller gå med i ett rum för att spela</p>
          </div>

          {error && (
            <div className="card mb-4" style={{borderColor: '#f44336', background: 'rgba(244, 67, 54, 0.1)'}}>
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Available Rooms */}
          <div className="card">
            <div className="rooms-header">
              <h2 className="card-title">Tillgängliga rum ({availableRooms.length})</h2>
              {user && (
                <div className="user-info">
                  Inloggad som: <strong>{user.username}</strong>
                </div>
              )}
            </div>
            <div className="card-content">
              {availableRooms.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-4 opacity-50">🎲</div>
                  <p className="text-gray-400 mb-4">Inga rum tillgängliga</p>
                  <button 
                    onClick={() => setIsCreatingRoom(true)}
                    className="btn btn-primary"
                  >
                    Skapa det första rummet
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {availableRooms.map((room) => (
                    <div 
                      key={room.id} 
                      className="card p-4 cursor-pointer"
                      onClick={() => {
                        if ((room.member_count || 0) < (room.max_players || 4) && !isJoiningRoom) {
                          // Check if room requires password BEFORE attempting to join
                          const roomSettings = room.settings as any;
                          if (roomSettings?.require_password === true) {
                            // Show password prompt immediately
                            setPendingRoomCode(room.code);
                            setShowPasswordPrompt(true);
                            setPasswordInput('');
                          } else {
                            // Join directly without password
                            joinRoomByCode(room.code);
                          }
                        }
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-white truncate">{room.name}</h3>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-400">
                            <span>👥 {room.member_count || 0}/{room.max_players || 6}</span>
                            <span>📏 {room.board_size || 5}×{room.board_size || 5}</span>
                          </div>
                        </div>
                        <div className="text-xs font-semibold text-gray-500">
                          {(room.member_count || 0) >= (room.max_players || 4) ? 'Fullt' : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div style={{marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(102, 126, 234, 0.2)'}}>
                    <p style={{fontSize: '10px', margin: '0 0 4px 0', opacity: 0.8, fontWeight: 'bold'}}>Eller skapa ett nytt rum</p>
                    <button
                      onClick={() => setIsCreatingRoom(true)}
                      className="btn btn-primary"
                      disabled={isCreatingRoom}
                      style={{padding: '6px 12px', fontSize: '12px', width: 'auto'}}
                    >
                      {isCreatingRoom ? '...' : '🎮 Nytt rum'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Room Creation Modal - Outside home-page div */}
      {isCreatingRoom && (
        <div className="create-room-modal-overlay">
          <div className="create-room-modal">
            <div className="create-room-modal-header">
              <h2>Skapa nytt rum</h2>
              <button
                onClick={() => {
                  setIsCreatingRoom(false);
                  setRoomName('');
                  setRequirePassword(false);
                  setError('');
                }}
                className="close-button"
                aria-label="Stäng"
              >
                ×
              </button>
            </div>
            
            <div>
              <div className="form-group">
                <label className="form-label">Rumnamn</label>
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="Mitt coola rum"
                  className="form-input"
                  maxLength={50}
                  autoFocus
                />
              </div>
              
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px'}}>
                <div className="form-group">
                  <label className="form-label">Max spelare: {maxPlayers}</label>
                  <input
                    type="range"
                    value={maxPlayers}
                    onChange={(e) => setMaxPlayers(Number(e.target.value))}
                    min={2}
                    max={6}
                    step={1}
                    style={{width: '100%', cursor: 'pointer'}}
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Brädstorlek: {boardSize}×{boardSize}</label>
                  <input
                    type="range"
                    value={boardSize}
                    onChange={(e) => setBoardSize(Number(e.target.value))}
                    min={4}
                    max={6}
                    step={1}
                    style={{width: '100%', cursor: 'pointer'}}
                  />
                </div>
              </div>

              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px'}}>
                <div className="form-group">
                  <label className="form-label">Tid för val: {letterTimer}s</label>
                  <input
                    type="range"
                    value={letterTimer}
                    onChange={(e) => setLetterTimer(Number(e.target.value))}
                    min={5}
                    max={60}
                    step={1}
                    style={{width: '100%', cursor: 'pointer'}}
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Tid för placering: {placementTimer}s</label>
                  <input
                    type="range"
                    value={placementTimer}
                    onChange={(e) => setPlacementTimer(Number(e.target.value))}
                    min={10}
                    max={60}
                    step={1}
                    style={{width: '100%', cursor: 'pointer'}}
                  />
                </div>
              </div>

              <div className="form-group" style={{marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                <input
                  type="checkbox"
                  id="requirePassword"
                  checked={requirePassword}
                  onChange={(e) => setRequirePassword(e.target.checked)}
                  style={{width: '16px', height: '16px', cursor: 'pointer'}}
                />
                <label htmlFor="requirePassword" style={{margin: 0, cursor: 'pointer', fontSize: '14px'}}>
                  Använd lösenord för att logga in (rumskod)
                </label>
              </div>

              {error && (
                <div style={{background: 'rgba(244, 67, 54, 0.1)', border: '1px solid #f44336', color: '#f44336', padding: '10px 12px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px'}}>
                  {error}
                </div>
              )}
              
              <div className="create-room-modal-actions">
                <button
                  type="button"
                  onClick={async () => {
                    if (!roomName.trim()) {
                      setError('Rumnamn får inte vara tomt');
                      return;
                    }
                    
                    if (creatingRoom) {
                      return;
                    }
                    
                    setCreatingRoom(true);
                    setError('');
                    
                    try {
                      console.log(`📝 Creating room with requirePassword=${requirePassword} (type: ${typeof requirePassword})`);
                      const roomData = await apiService.createRoom(roomName.trim(), {
                        max_players: maxPlayers,
                        board_size: boardSize,
                        letter_timer: letterTimer,
                        placement_timer: placementTimer,
                        require_password: requirePassword
                      });

                      // Room creation automatically joins the user as creator on the server
                      // We still need to call joinRoom() to set currentRoom in GameContext
                      if (roomData?.room?.code || roomData?.code) {
                        const roomCode = roomData.room?.code || roomData.code;

                        // Join the room - creator is already a member on server,
                        // so this just sets currentRoom in GameContext and joins socket room
                        shouldNavigate.current = true;
                        await joinRoom(roomCode);
                        
                        setIsCreatingRoom(false);
                        setRoomName('');
                        setRequirePassword(false);
                      } else {
                        throw new Error('Ingen rumskod returnerades från servern');
                      }
                    } catch (err: any) {
                      setError(err.message || 'Kunde inte skapa rum');
                    } finally {
                      setCreatingRoom(false);
                    }
                  }}
                  disabled={!roomName.trim() || creatingRoom}
                  className="btn-primary"
                >
                  {creatingRoom ? 'Skapar rum...' : 'Skapa rum'}
                </button>
                
                <button
                  onClick={() => {
                    setIsCreatingRoom(false);
                    setRoomName('');
                    setError('');
                  }}
                  className="btn-secondary"
                >
                  Avbryt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password Prompt Modal */}
      {showPasswordPrompt && (
        <div className="modal-overlay" onClick={() => {
          setShowPasswordPrompt(false);
          setPendingRoomCode('');
          setPasswordInput('');
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px' }}>Lösenord krävs</h2>
            <p style={{ fontSize: '14px', marginBottom: '16px', opacity: 0.7 }}>
              Det här rummet kräver rumskoden som lösenord för att gå med.
            </p>
            <input
              type="password"
              placeholder="Ange rumskoden"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handlePasswordSubmit();
                }
              }}
              maxLength={6}
              autoFocus
              style={{
                width: '100%',
                padding: '8px 12px',
                marginBottom: '16px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                fontFamily: 'monospace',
                textTransform: 'uppercase'
              }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handlePasswordSubmit}
                disabled={!passwordInput.trim() || isJoiningRoom}
                className="btn-primary"
                style={{ flex: 1 }}
              >
                {isJoiningRoom ? 'Gå med...' : 'Gå med'}
              </button>
              <button
                onClick={() => {
                  setShowPasswordPrompt(false);
                  setPendingRoomCode('');
                  setPasswordInput('');
                  setError('');
                }}
                className="btn-secondary"
                style={{ flex: 1 }}
              >
                Avbryt
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default HomePage;
