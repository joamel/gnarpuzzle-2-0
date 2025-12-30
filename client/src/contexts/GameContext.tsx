import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { GameState, Player, Room, GamePhase, GameTimer, Leaderboard } from '../types/game';
import { socketService } from '../services/socketService';
import { apiService } from '../services/apiService';
import { useAuth } from './AuthContext';

interface GameContextType {
  // Current game state
  currentGame: GameState | null;
  currentRoom: Room | null;
  players: Player[];
  currentPlayer: Player | null;
  isMyTurn: boolean;
  
  // Game phase and timing
  gamePhase: GamePhase | null;
  gameTimer: GameTimer | null;
  selectedLetter: string | null;
  
  // Game actions
  startGame: (roomId: number) => Promise<void>;
  selectLetter: (letter: string) => Promise<void>;
  placeLetter: (x: number, y: number) => Promise<void>;
  confirmPlacement: () => Promise<void>;
  
  // Room actions
  joinRoom: (code: string) => Promise<Room>;
  leaveRoom: () => Promise<void>;
  
  // UI state
  isLoading: boolean;
  error: string | null;
  leaderboard: Leaderboard[] | null;
}

const GameContext = createContext<GameContextType | null>(null);

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
};

interface GameProviderProps {
  children: React.ReactNode;
}

export const GameProvider: React.FC<GameProviderProps> = ({ children }) => {
  const { user } = useAuth();
  
  const [currentGame, setCurrentGame] = useState<GameState | null>(null);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gamePhase, setGamePhase] = useState<GamePhase | null>(null);
  const [gameTimer, setGameTimer] = useState<GameTimer | null>(null);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<Leaderboard[] | null>(null);

  const currentPlayer = players.find(p => p.userId === user?.id) || null;
  const isMyTurn = currentGame?.currentTurn === currentPlayer?.position;

  // Timer management
  useEffect(() => {
    if (!gameTimer?.endTime) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const remainingSeconds = Math.max(0, Math.ceil((gameTimer.endTime - now) / 1000));
      const isWarning = remainingSeconds <= 5;

      setGameTimer(prev => prev ? { ...prev, remainingSeconds, isWarning } : null);

      if (remainingSeconds === 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [gameTimer?.endTime]);

  // Socket event handlers
  useEffect(() => {
    if (!socketService.isConnected()) return;

    const handleGamePhaseChanged = (data: any) => {
      setGamePhase(data.phase);
      setGameTimer({
        endTime: data.timer_end,
        remainingSeconds: Math.ceil((data.timer_end - Date.now()) / 1000),
        isWarning: false,
      });
      
      // If we don't have a current game yet but get a phase change, create game object
      if (!currentGame && data.gameId) {
        setCurrentGame({
          id: data.gameId,
          roomId: currentRoom?.id || 0,
          phase: data.phase,
          currentTurn: data.current_turn || null,
          status: 'active'
        });
      } else if (currentGame) {
        setCurrentGame(prev => prev ? { ...prev, phase: data.phase, currentTurn: data.current_turn || prev.currentTurn } : null);
      }
    };

    const handleLetterSelected = (data: any) => {
      if (data.playerId === user?.id) {
        setSelectedLetter(data.letter);
      }
      
      // Update player state
      setPlayers(prev => prev.map(p => 
        p.userId === data.playerId 
          ? { ...p, currentLetter: data.letter }
          : p
      ));
    };

    const handleLetterPlaced = (data: any) => {
      // Update player's grid
      setPlayers(prev => prev.map(p => {
        if (p.userId === data.playerId) {
          const newGrid = [...p.grid];
          if (newGrid[data.y] && newGrid[data.y][data.x]) {
            newGrid[data.y][data.x] = {
              letter: data.letter,
              x: data.x,
              y: data.y,
            };
          }
          return { ...p, grid: newGrid };
        }
        return p;
      }));
    };

    const handleGameEnded = (data: any) => {
      setLeaderboard(data.leaderboard);
      setGamePhase('finished');
      setGameTimer(null);
      
      if (currentGame) {
        setCurrentGame(prev => prev ? { ...prev, status: 'completed' } : null);
      }
    };

    const handleRoomMemberLeft = (data: any) => {
      console.log(`🚪 Member left room: ${data.user.username}`);
      
      // Force refresh room data to get updated member list
      if (currentRoom && currentRoom.code === data.roomCode) {
        fetchRoomData(data.roomCode).catch(err => {
          console.error('Failed to refresh room data after member left:', err);
        });
      }
    };

    const handleOwnershipTransferred = (data: any) => {
      console.log(`👑 Room ownership transferred to: ${data.newCreator.username}`);
      
      // Update current room data
      if (currentRoom && currentRoom.code === data.roomCode) {
        setCurrentRoom(prev => prev ? { 
          ...prev, 
          created_by: data.newCreator.id 
        } : null);
      }
    };

    const handleRoomUpdated = (data: any) => {
      console.log(`🔄 Room updated:`, data.room);
      
      // Update current room data
      if (currentRoom && currentRoom.code === data.room.code) {
        setCurrentRoom(data.room);
      }
    };

    // Register socket events
    socketService.on('game:phase_changed', handleGamePhaseChanged);
    socketService.on('letter:selected', handleLetterSelected);
    socketService.on('letter:placed', handleLetterPlaced);
    socketService.on('game:ended', handleGameEnded);
    socketService.on('room:member_left', handleRoomMemberLeft);
    socketService.on('room:ownership_transferred', handleOwnershipTransferred);
    socketService.on('room:updated', handleRoomUpdated);

    return () => {
      socketService.off('game:phase_changed', handleGamePhaseChanged);
      socketService.off('letter:selected', handleLetterSelected);
      socketService.off('letter:placed', handleLetterPlaced);
      socketService.off('game:ended', handleGameEnded);
      socketService.off('room:member_left', handleRoomMemberLeft);
      socketService.off('room:ownership_transferred', handleOwnershipTransferred);
      socketService.off('room:updated', handleRoomUpdated);
    };
  }, [currentGame, user?.id]);

  // Game actions
  const startGame = useCallback(async (roomId: number) => {
    console.log('🎮 GameContext.startGame called with roomId:', roomId);
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('📡 Calling apiService.startGame...');
      const game = await apiService.startGame(roomId);
      console.log('✅ Game started successfully:', game);
      setCurrentGame(game);
      
    } catch (err) {
      console.error('❌ Error in startGame:', err);
      console.error('Error details:', {
        name: err instanceof Error ? err.name : 'Unknown',
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined
      });
      
      const message = err instanceof Error ? err.message : 'Failed to start game';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
      console.log('🏁 startGame finished, isLoading set to false');
    }
  }, []);

  // Helper function to fetch room data
  const fetchRoomData = useCallback(async (roomCode: string) => {
    try {
      const room = await apiService.getRoomByCode(roomCode);
      return room;
    } catch (err) {
      console.error(`Failed to fetch room data for ${roomCode}:`, err);
      throw err;
    }
  }, []);

  const selectLetter = useCallback(async (letter: string) => {
    if (!currentGame || !currentPlayer) {
      throw new Error('No active game or player');
    }

    try {
      await apiService.selectLetter(currentGame.id, currentPlayer.userId, letter);
      setSelectedLetter(letter);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to select letter';
      setError(message);
      throw err;
    }
  }, [currentGame, currentPlayer]);

  const placeLetter = useCallback(async (x: number, y: number) => {
    if (!currentGame || !currentPlayer || !selectedLetter) {
      throw new Error('Cannot place letter');
    }

    try {
      await apiService.placeLetter(currentGame.id, currentPlayer.userId, x, y);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to place letter';
      setError(message);
      throw err;
    }
  }, [currentGame, currentPlayer, selectedLetter]);

  const confirmPlacement = useCallback(async () => {
    if (!currentGame || !currentPlayer) {
      throw new Error('Cannot confirm placement');
    }

    try {
      await apiService.confirmPlacement(currentGame.id, currentPlayer.userId);
      setSelectedLetter(null);
      
      // Update local state
      setPlayers(prev => prev.map(p => 
        p.userId === currentPlayer.userId 
          ? { ...p, placementConfirmed: true }
          : p
      ));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to confirm placement';
      setError(message);
      throw err;
    }
  }, [currentGame, currentPlayer]);

  // Room actions
  const joinRoom = useCallback(async (code: string): Promise<Room> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const room = await apiService.joinRoom(code);
      setCurrentRoom(room);
      
      return room;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join room';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const leaveRoom = useCallback(async () => {
    if (!currentRoom) return;
    
    try {
      await apiService.leaveRoom(currentRoom.code);
      setCurrentRoom(null);
      setCurrentGame(null);
      setPlayers([]);
      setGamePhase(null);
      setGameTimer(null);
      setSelectedLetter(null);
      setLeaderboard(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to leave room';
      setError(message);
      throw err;
    }
  }, [currentRoom]);

  const value: GameContextType = {
    currentGame,
    currentRoom,
    players,
    currentPlayer,
    isMyTurn,
    gamePhase,
    gameTimer,
    selectedLetter,
    startGame,
    selectLetter,
    placeLetter,
    confirmPlacement,
    joinRoom,
    leaveRoom,
    isLoading,
    error,
    leaderboard,
  };

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
};