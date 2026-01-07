import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useGame } from '../contexts/GameContext';
import { apiService } from '../services/apiService';
import { socketService } from '../services/socketService';
import { Room } from '../types/game';
import Logo from '../assets/Logo'; // Logo component with TypeScript support
import '../styles/home.css';

const HomePage: React.FC = () => {
  const { logout } = useAuth();
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
      console.log('📤 User arrived at lobby while in room, auto-leaving:', currentRoom.code);
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

    const handleRoomCreated = (data: any) => {
      console.log('Room created via Socket.IO:', data);
      loadRooms();
    };

    const handleRoomJoined = (data: any) => {
      console.log('Room joined via Socket.IO:', data);
      loadRooms();
    };

    const handleRoomLeft = (data: any) => {
      console.log('Room left via Socket.IO:', data);
      loadRooms();
    };

    const handleRoomUpdated = (data: any) => {
      console.log('Room updated via Socket.IO:', data);
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

  const joinRoomByCode = async (code: string) => {
    if (!code.trim()) return;

    console.log('🚀 joinRoomByCode called with code:', code);
    setIsJoiningRoom(true);
    setError('');

    try {
      shouldNavigate.current = true;
      const roomResult = await joinRoom(code.trim());
      console.log('✅ joinRoom result:', roomResult);
    } catch (err: any) {
      console.error('❌ Failed to join room:', err);
      setError(err.message || 'Kunde inte gå med i rum');
    } finally {
      setIsJoiningRoom(false);
    }
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
            className="header-btn"
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
            <div className="card-header">
              <h2 className="card-title flex-1">Tillgängliga rum ({availableRooms.length})</h2>
              <button
                onClick={loadRooms}
                className="refresh-btn"
                aria-label="Uppdatera rumslista"
              >
                🔄
              </button>
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
                          joinRoomByCode(room.code);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-white truncate">{room.name}</h3>
                            <span className="text-xs bg-green-600 text-white px-2 py-1 rounded-full font-medium">
                              {room.code}
                            </span>
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
                  <label className="form-label">Max spelare</label>
                  <select 
                    value={maxPlayers} 
                    onChange={(e) => setMaxPlayers(Number(e.target.value))}
                    className="form-input"
                  >
                    <option value={2}>2 spelare</option>
                    <option value={3}>3 spelare</option>
                    <option value={4}>4 spelare</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Rutstorlek</label>
                  <select 
                    value={boardSize} 
                    onChange={(e) => setBoardSize(Number(e.target.value))}
                    className="form-input"
                  >
                    <option value={4}>4×4</option>
                    <option value={5}>5×5</option>
                    <option value={6}>6×6</option>
                  </select>
                </div>
              </div>

              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px'}}>
                <div className="form-group">
                  <label className="form-label">Bokstavstid (sek)</label>
                  <input
                    type="number"
                    value={letterTimer}
                    onChange={(e) => setLetterTimer(Math.max(5, Math.min(60, Number(e.target.value))))}
                    className="form-input"
                    min={5}
                    max={60}
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Placeringstid (sek)</label>
                  <input
                    type="number"
                    value={placementTimer}
                    onChange={(e) => setPlacementTimer(Math.max(10, Math.min(60, Number(e.target.value))))}
                    className="form-input"
                    min={10}
                    max={60}
                  />
                </div>
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
                      const roomData = await apiService.createRoom(roomName.trim(), {
                        max_players: maxPlayers,
                        board_size: boardSize,
                        letter_timer: letterTimer,
                        placement_timer: placementTimer
                      });
                      
                      console.log('✅ Room created successfully:', roomData);
                      
                      // Room creation automatically joins the user, so just navigate
                      if (roomData?.room?.code || roomData?.code) {
                        const roomCode = roomData.room?.code || roomData.code;
                        console.log(`🎯 Navigating directly to room ${roomCode}`);
                        
                        // Join the room using its code
                        await joinRoom(roomCode);
                        
                        setIsCreatingRoom(false);
                        setRoomName('');
                        shouldNavigate.current = true;
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
    </>
  );
};

export default HomePage;