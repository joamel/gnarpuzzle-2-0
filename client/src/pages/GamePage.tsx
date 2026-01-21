import React, { useState, useEffect, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import RoomLobby from '../components/RoomLobby';
import GameResultBoard from '../components/GameResultBoard';
import OnlineStats from '../components/OnlineStats';
import UserMenu from '../components/UserMenu';
import Logo from '@/assets/Logo';
import { socketService } from '../services/socketService';
import { logger } from '../utils/logger';

// Lazy load GameInterface for better performance
const GameInterface = React.lazy(() => import('../components/GameInterface').then(module => ({ 
  default: module.GameInterface 
})));

const GamePage: React.FC = () => {
  const { user } = useAuth();
  const { currentRoom, currentGame, gamePhase, leaderboard, gameEndReason, boardSize, joinRoom } = useGame();
  const navigate = useNavigate();
  const location = useLocation();
  const [gameStarted, setGameStarted] = useState(false);
  const [selectedPlayerBoard, setSelectedPlayerBoard] = useState<number | null>(null);

  // Handle URL parameters for direct room join
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const roomCode = urlParams.get('room');
    const password = urlParams.get('password');
    
    if (roomCode && !currentRoom) {
      // Auto-join room from shared link
      logger.room.info('Auto-joining room from shared link', { roomCode });
      joinRoom(roomCode, password || undefined).then(() => {
        logger.room.info('Successfully joined room from shared link', { roomCode });
        // Clear URL parameters after joining
        navigate('/game', { replace: true });
      }).catch((error) => {
        logger.room.error('Failed to join room from shared link', { roomCode, error });
        alert(`Kunde inte gå med i rummet: ${error.message || 'Okänt fel'}`);
        navigate('/', { replace: true });
      });
    }
  }, [location.search, currentRoom, joinRoom, navigate]);

  useEffect(() => {
    logger.game.debug('GamePage state', {
      currentRoom: currentRoom?.code ?? null,
      hasCurrentGame: !!currentGame,
      gamePhase,
    });
    
    if (currentGame && (gamePhase === 'letter_selection' || gamePhase === 'letter_placement')) {
      setGameStarted(true);
    }
    
    // If room status is "playing", show game interface even without currentGame
    if (currentRoom?.status === 'playing') {
      setGameStarted(true);
    }

    // Return to lobby if game is no longer active and we're showing game interface
    if (gameStarted && !currentGame && currentRoom?.status !== 'playing') {
      setGameStarted(false);
    }

    // If game phase is finished, let it show leaderboard (gameStarted stays true)
    // but GamePage will render leaderboard because gamePhase === 'finished'
  }, [currentGame, gamePhase, currentRoom]);

  // Prevent screen lock during active gameplay (best-effort)
  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      try {
        const nav: any = navigator as any;
        if (!nav.wakeLock?.request) return;
        wakeLock = await nav.wakeLock.request('screen');
      } catch (e) {
        // Wake Lock is best-effort (requires secure context and user gesture in some browsers)
        logger.game.debug('WakeLock request failed', { message: (e as Error).message });
      }
    };

    const releaseWakeLock = async () => {
      try {
        await wakeLock?.release?.();
      } catch {
        // ignore
      } finally {
        wakeLock = null;
      }
    };

    const shouldHoldLock = gameStarted && gamePhase !== 'finished';
    if (shouldHoldLock) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    const onVisibilityChange = () => {
      // Re-acquire after returning to foreground
      if (!document.hidden && shouldHoldLock) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      releaseWakeLock();
    };
  }, [gameStarted, gamePhase]);

  const handleStartGame = () => {
    setGameStarted(true);
  };

  // Return to room lobby after game finishes
  const handleBackToLobby = () => {
    setGameStarted(false);
    setSelectedPlayerBoard(null);
    
    // Reset ready status when returning to lobby
    if (currentRoom?.code) {
      socketService.setPlayerReady(currentRoom.code, false);
    }
  };

  if (!currentRoom) {
    logger.room.debug('Rendering "not in room" screen');
    return (
      <div className="no-room">
        <p>Du är inte i något rum just nu.</p>
        <button onClick={() => navigate('/')}>
          Tillbaka till startsidan
        </button>
      </div>
    );
  }

  // Show leaderboard if game is finished and user wants to see results
  if (gamePhase === 'finished' && leaderboard && gameStarted) {
    const currentPlayer = leaderboard.find(p => p.userId === user?.id);
    const selectedPlayer = selectedPlayerBoard ? leaderboard.find(p => p.userId === selectedPlayerBoard) : null;

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
                words={selectedPlayer.words}
              />
            </div>
          ) : currentPlayer && (
            <div className="player-board-section">
              <GameResultBoard 
                grid={currentPlayer.grid || Array(boardSize).fill(null).map(() => Array(boardSize).fill({ letter: null }))}
                boardSize={boardSize}
                words={currentPlayer.words}
              />
            </div>
          )}

          <div className="game-actions">
            <button 
              onClick={handleBackToLobby} 
              className="back-to-lobby-button primary-button"
            >
              Tillbaka till rummet
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
        <header className="page-header">
          <Logo size="small" showText={true} />
          <div className="page-header-actions">
            <UserMenu />
            <OnlineStats className="header-online-stats" />
          </div>
        </header>
        
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
      <header className="page-header">
        <Logo size="small" showText={true} />
        <div className="page-header-actions">
          <UserMenu />
          <OnlineStats className="header-online-stats" />
        </div>
      </header>
      
      <RoomLobby onStartGame={handleStartGame} />
    </div>
  );
};

export default GamePage;
