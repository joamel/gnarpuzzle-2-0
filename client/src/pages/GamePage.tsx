import React, { useState, useEffect, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import RoomLobby from '../components/RoomLobby';
import GameResultBoard from '../components/GameResultBoard';

// Lazy load GameInterface for better performance
const GameInterface = React.lazy(() => import('../components/GameInterface').then(module => ({ 
  default: module.GameInterface 
})));

const GamePage: React.FC = () => {
  const { user } = useAuth();
  const { currentRoom, currentGame, gamePhase, leaderboard, leaveRoom, gameEndReason, boardSize } = useGame();
  const navigate = useNavigate();
  const [gameStarted, setGameStarted] = useState(false);
  const [selectedPlayerBoard, setSelectedPlayerBoard] = useState<number | null>(null);

  useEffect(() => {
    console.log('🎮 GamePage useEffect triggered:', {
      currentGame: !!currentGame,
      gamePhase,
      currentGameStarted: gameStarted,
      roomStatus: currentRoom?.status,
      shouldStartGame: currentGame && (gamePhase === 'letter_selection' || gamePhase === 'letter_placement')
    });
    
    if (currentGame && (gamePhase === 'letter_selection' || gamePhase === 'letter_placement')) {
      console.log('🎮 Setting gameStarted to true!');
      setGameStarted(true);
    }
    
    // If room status is "playing", show game interface even without currentGame
    if (currentRoom?.status === 'playing') {
      console.log('🎮 Room status is playing - setting gameStarted to true!');
      setGameStarted(true);
    }
  }, [currentGame, gamePhase, currentRoom?.status]);

  const handleStartGame = () => {
    setGameStarted(true);
  };

  // Leave room and go back to home
  const handleLeaveRoom = async () => {
    try {
      await leaveRoom();
      navigate('/');
    } catch (error) {
      console.error('Failed to leave room:', error);
      navigate('/');
    }
  };


  if (!currentRoom) {
    return (
      <div className="no-room">
        <p>Du är inte i något rum just nu.</p>
        <button onClick={() => navigate('/')}>
          Tillbaka till startsidan
        </button>
      </div>
    );
  }

  // Show leaderboard if game is finished
  if (gamePhase === 'finished' && leaderboard) {
    const currentPlayer = leaderboard.find(p => p.userId === user?.id);
    const selectedPlayer = selectedPlayerBoard ? leaderboard.find(p => p.userId === selectedPlayerBoard) : null;

    console.log('🏆 Leaderboard data:', { leaderboard, currentPlayer, selectedPlayer });

    return (
      <div className="game-finished">
        <div className="game-finished-content">
          <h2>🏆 Spelet avslutat!</h2>
          
          {gameEndReason === 'player_left' && (
            <p className="game-end-reason">En spelare lämnade spelet</p>
          )}
          
          <div className="leaderboard">
            <h3>Resultat</h3>
            {leaderboard.map((player, index) => (
              <div 
                key={player.userId} 
                className={`leaderboard-item ${player.userId === user?.id ? 'current-player' : ''} ${(selectedPlayerBoard === null && player.userId === user?.id) || selectedPlayer?.userId === player.userId ? 'selected' : ''}`}
                onClick={() => setSelectedPlayerBoard(player.userId === user?.id ? null : player.userId)}
                style={{ cursor: 'pointer' }}
              >
                <div className="rank">#{index + 1}</div>
                <div className="player-info">
                  <span className="username">{player.username}</span>
                  {player.userId === user?.id && <span className="you-badge">Du</span>}
                </div>
                <div className="score">{player.score} poäng</div>
              </div>
            ))}
          </div>

          {selectedPlayer && selectedPlayer.userId !== user?.id ? (
            <div className="player-board-section">
              <GameResultBoard 
                grid={selectedPlayer.grid || Array(boardSize).fill(null).map(() => Array(boardSize).fill({ letter: null }))}
                boardSize={boardSize}
              />
            </div>
          ) : currentPlayer && (
            <div className="player-board-section">
              <GameResultBoard 
                grid={currentPlayer.grid || Array(boardSize).fill(null).map(() => Array(boardSize).fill({ letter: null }))}
                boardSize={boardSize}
              />
            </div>
          )}

          <div className="game-actions">
            <button 
              onClick={handleLeaveRoom} 
              className="back-to-lobby-button primary-button"
            >
              Lämna spelet
            </button>
          </div>
        </div>

        {/* Modal removed - board now shows directly above */}
      </div>
    );
  }

  // Show game interface if game is active
  if (gameStarted && currentGame) {
    return (
      <div className="game-page">
        <div className="game-header">
          <button 
            onClick={handleLeaveRoom}
            className="back-button"
          >
            ← Lämna spelet
          </button>
          <h2>🧩 {currentRoom.name}</h2>
          <div className="room-code-display">
            {currentRoom.code}
          </div>
        </div>
        
        <Suspense fallback={
          <div className="loading-game-interface">
            <div className="loading-spinner"></div>
            <p>Laddar spelplan...</p>
          </div>
        }>
          <GameInterface />
        </Suspense>
      </div>
    );
  }

  // Show lobby by default
  return (
    <div className="game-page">
      <div className="game-header">
        <button 
          onClick={handleLeaveRoom}
          className="back-button"
        >
          ← Lämna rummet
        </button>
        <h2>🧩 Rum</h2>
        <div></div>
      </div>
      
      <RoomLobby onStartGame={handleStartGame} />
    </div>
  );
};

export default GamePage;