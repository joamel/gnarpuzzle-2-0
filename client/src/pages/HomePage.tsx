import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useGame } from '../contexts/GameContext';
import { apiService } from '../services/apiService';
import { socketService } from '../services/socketService';
import { Room } from '../types/game';

const HomePage: React.FC = () => {
  const { user, logout } = useAuth();
  const { joinRoom, currentRoom } = useGame();
  const navigate = useNavigate();
  
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [roomCode, setRoomCode] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [error, setError] = useState('');
  const [roomName, setRoomName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [boardSize, setBoardSize] = useState(4);

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

  const createRoom = async () => {
    if (!roomName.trim()) return;
    
    setIsCreatingRoom(true);
    setError('');

    try {
      const roomData = await apiService.createRoom(roomName.trim(), {
        max_players: maxPlayers,
        board_size: boardSize
      });

      if (roomData?.code) {
        await joinRoomByCode(roomData.code);
      } else {
        throw new Error('Ingen rumskod returnerades');
      }
    } catch (err: any) {
      console.error('Failed to create room:', err);
      setError(err.message || 'Kunde inte skapa rum');
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const joinRoomByCode = async (code: string) => {
    if (!code.trim()) return;

    setIsJoiningRoom(true);
    setError('');

    try {
      await joinRoom(code.trim());
      navigate('/game');
    } catch (err: any) {
      console.error('Failed to join room:', err);
      setError(err.message || 'Kunde inte gå med i rum');
    } finally {
      setIsJoiningRoom(false);
      setRoomCode('');
    }
  };

  // Redirect if already in a room
  if (currentRoom) {
    navigate('/game');
    return <div>Redirecting to game...</div>;
  }

  return (
    <div className="content-wrapper">
      {/* Mobile Header */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">🧩 GnarPuzzle</h1>
          <p className="text-sm text-gray-300">Hej, {user?.username}!</p>
        </div>
        <button 
          onClick={async () => {
            localStorage.clear();
            await logout();
            window.location.reload();
          }}
          className="btn btn-ghost btn-sm"
          aria-label="Logga ut"
        >
          Logga ut
        </button>
      </header>

      {error && (
        <div className="card mb-4" style={{borderColor: '#f44336', background: 'rgba(244, 67, 54, 0.1)'}}>
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 gap-4 mb-6">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Snabbstart</h2>
          </div>
          <div className="card-content">
            <div className="flex flex-col gap-3">
              <button
                onClick={() => setIsCreatingRoom(true)}
                className="btn btn-primary btn-full"
                disabled={isCreatingRoom}
              >
                {isCreatingRoom ? '...' : '🎮 Skapa nytt rum'}
              </button>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="Rumskod (t.ex. ABC123)"
                  className="form-input flex-1"
                  maxLength={6}
                  style={{textTransform: 'uppercase'}}
                />
                <button
                  onClick={() => joinRoomByCode(roomCode)}
                  disabled={!roomCode.trim() || isJoiningRoom}
                  className="btn btn-secondary px-4"
                >
                  {isJoiningRoom ? '...' : 'Gå med'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Available Rooms */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center justify-between">
            <h2 className="card-title">Tillgängliga rum ({availableRooms.length})</h2>
            <button
              onClick={loadRooms}
              className="btn btn-ghost btn-sm"
              aria-label="Uppdatera rumslista"
            >
              🔄
            </button>
          </div>
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
                  className="card p-4"
                  style={{background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)'}}
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
                        <span>👥 {room.member_count || 0}/{room.max_players || 4}</span>
                        <span>📏 {room.board_size || 4}×{room.board_size || 4}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => joinRoomByCode(room.code)}
                      disabled={isJoiningRoom || (room.member_count || 0) >= (room.max_players || 4)}
                      className={`btn btn-sm ${
                        (room.member_count || 0) >= (room.max_players || 4) 
                          ? 'btn-secondary opacity-50' 
                          : 'btn-primary'
                      }`}
                    >
                      {(room.member_count || 0) >= (room.max_players || 4) ? 'Fullt' : 'Gå med'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Room Creation Modal */}
      {isCreatingRoom && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-end justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl w-full max-w-md p-6 transform transition-transform">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Skapa nytt rum</h2>
              <button
                onClick={() => {
                  setIsCreatingRoom(false);
                  setRoomName('');
                }}
                className="btn btn-ghost btn-sm"
                aria-label="Stäng"
              >
                ✖️
              </button>
            </div>
            
            <div className="space-y-4">
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
              
              <div className="grid grid-cols-2 gap-4">
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
              
              <button
                onClick={createRoom}
                disabled={!roomName.trim() || isCreatingRoom}
                className="btn btn-primary btn-full btn-lg"
              >
                {isCreatingRoom ? 'Skapar rum...' : 'Skapa rum'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomePage;