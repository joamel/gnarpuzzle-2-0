import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useGame } from '../contexts/GameContext';
import { apiService } from '../services/apiService';
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

  // Load available rooms
  useEffect(() => {
    const loadRooms = async () => {
      try {
        const rooms = await apiService.getRooms();
        setAvailableRooms(rooms);
      } catch (err) {
        console.error('Failed to load rooms:', err);
      }
    };

    loadRooms();
    const interval = setInterval(loadRooms, 10000); // Refresh every 10s

    return () => clearInterval(interval);
  }, []);

  const handleCreateRoom = async () => {
    try {
      setIsCreatingRoom(true);
      setError('');
      
      const room = await apiService.createRoom(`${user?.username}'s rum`, {
        grid_size: 4,
        max_players: 4,
        letter_timer: 10,
        placement_timer: 15,
        private: false,
      });
      
      await joinRoom(room.code);
      navigate('/game');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte skapa rum');
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const handleJoinRoom = async (code: string) => {
    try {
      setIsJoiningRoom(true);
      setError('');
      await joinRoom(code);
      navigate('/game');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte gå med i rum');
    } finally {
      setIsJoiningRoom(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim()) return;
    
    await handleJoinRoom(roomCode.trim().toUpperCase());
  };

  if (currentRoom) {
    // Redirect to game page if already in a room
    navigate('/game');
    return <div>Redirecting to game...</div>;
  }

  return (
    <div className="home-page">
      <header className="home-header">
        <div className="header-content">
          <h1>🧩 GnarPuzzle</h1>
          <div className="user-info">
            <span>Hej {user?.username}!</span>
            <button onClick={logout} className="logout-button">
              Logga ut
            </button>
          </div>
        </div>
      </header>

      <main className="home-content">
        <section className="room-actions">
          <h2>Välj rum</h2>
          
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="action-buttons">
            <button 
              onClick={handleCreateRoom}
              disabled={isCreatingRoom}
              className="create-room-button"
            >
              {isCreatingRoom ? 'Skapar rum...' : '+ Skapa nytt rum'}
            </button>

            <form onSubmit={handleJoinByCode} className="join-form">
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="RUMKOD"
                maxLength={6}
                disabled={isJoiningRoom}
              />
              <button 
                type="submit"
                disabled={isJoiningRoom || !roomCode.trim()}
                className="join-button"
              >
                {isJoiningRoom ? 'Går med...' : 'Gå med'}
              </button>
            </form>
          </div>
        </section>

        <section className="available-rooms">
          <h3>Tillgängliga rum</h3>
          
          {availableRooms.length === 0 ? (
            <div className="no-rooms">
              <p>Inga aktiva rum just nu</p>
              <p>Skapa ett nytt rum för att börja!</p>
            </div>
          ) : (
            <div className="rooms-list">
              {availableRooms.map(room => (
                <div key={room.id} className="room-card">
                  <div className="room-info">
                    <h4>{room.name}</h4>
                    <p>Kod: <strong>{room.code}</strong></p>
                    <p>{room.members.length}/{room.settings.max_players} spelare</p>
                    <p>Rutstorlek: {room.settings.grid_size}x{room.settings.grid_size}</p>
                  </div>
                  <button 
                    onClick={() => handleJoinRoom(room.code)}
                    disabled={isJoiningRoom || room.members.length >= room.settings.max_players}
                    className="join-room-button"
                  >
                    {room.members.length >= room.settings.max_players ? 'Fullt' : 'Gå med'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default HomePage;