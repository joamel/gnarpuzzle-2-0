import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import RoomLobby from '../components/RoomLobby';
import { GameInterface } from '../components/GameInterface';

const GamePage: React.FC = () => {
  const { user } = useAuth();
  const { currentRoom, currentGame, gamePhase, leaderboard } = useGame();
  const navigate = useNavigate();
  const [gameStarted, setGameStarted] = useState(false);

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

  const handleBackToLobby = () => {
    setGameStarted(false);
  };

  console.log('🎮 GamePage render decision:', {
    currentRoom: !!currentRoom,
    currentGame: !!currentGame, 
    gamePhase,
    gameStarted,
    leaderboard: !!leaderboard,
    willShowLeaderboard: gamePhase === 'finished' && leaderboard,
    willShowGame: gameStarted && currentGame,
    willShowLobby: true // fallback
  });

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
    return (
      <div className="game-finished">
        <div className="game-finished-content">
          <h2>🏆 Spelet avslutat!</h2>
          
          <div className="leaderboard">
            <h3>Resultat</h3>
            {leaderboard.map((player, index) => (
              <div key={player.userId} className={`leaderboard-item ${player.userId === user?.id ? 'current-player' : ''}`}>
                <div className="rank">#{index + 1}</div>
                <div className="player-info">
                  <span className="username">{player.username}</span>
                  {player.userId === user?.id && <span className="you-badge">Du</span>}
                </div>
                <div className="score">{player.score} poäng</div>
              </div>
            ))}
          </div>

          {leaderboard.find(p => p.userId === user?.id) && (
            <div className="player-words">
              <h4>Dina ord:</h4>
              <div className="words-list">
                {leaderboard.find(p => p.userId === user?.id)!.words.map((word, index) => (
                  <div key={index} className="word-item">
                    <span className="word">{word.word}</span>
                    <span className="points">{word.points}p</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="game-actions">
            <button 
              onClick={handleBackToLobby} 
              className="back-to-lobby-button primary-button"
            >
              Tillbaka till lobby
            </button>
            <button 
              onClick={() => navigate('/')} 
              className="new-game-button secondary-button"
            >
              Nytt spel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show game interface if game is active
  if (gameStarted && currentGame) {
    return (
      <div className="game-page">
        <div className="game-header">
          <button 
            onClick={handleBackToLobby}
            className="back-button"
          >
            ← Tillbaka till lobby
          </button>
          <h2>🧩 {currentRoom.name}</h2>
          <div className="room-code-display">
            {currentRoom.code}
          </div>
        </div>
        
        <GameInterface />
      </div>
    );
  }

  // Show lobby by default
  return (
    <div className="game-page">
      <div className="game-header">
        <button 
          onClick={() => navigate('/')}
          className="back-button"
        >
          ← Hem
        </button>
        <h2>🧩 Rum</h2>
        <div></div>
      </div>
      
      <RoomLobby onStartGame={handleStartGame} />
    </div>
  );
};

export default GamePage;