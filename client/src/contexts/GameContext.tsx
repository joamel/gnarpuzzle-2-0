import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { GameState, Player, Room, GamePhase, GameTimer, Leaderboard } from '../types/game';
import { socketService } from '../services/socketService';
import { apiService } from '../services/apiService';
import { useAuth } from './AuthContext';
import { logger } from '../utils/logger';

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
  joinRoom: (code: string, password?: string) => Promise<Room>;
  leaveRoom: (intentional?: boolean) => Promise<void>;
  
  // UI state
  isLoading: boolean;
  error: string | null;
  leaderboard: Leaderboard[] | null;
  gameEndReason: string | null;
  boardSize: number;
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
  const [gameEndReason, setGameEndReason] = useState<string | null>(null);
  const [boardSize, setBoardSize] = useState<number>(5);

  const currentPlayer = players.find(p => p.userId === user?.id) || null;
  
  // Enhanced turn calculation with better debugging
  const currentTurnUserId = currentGame?.currentTurn ? Number(currentGame.currentTurn) : 0;
  const playerUserId = user?.id ? Number(user.id) : 0;
  const isMyTurn = currentTurnUserId === playerUserId && currentTurnUserId > 0;

  // Only log turn issues when there's an actual problem
  // Removed excessive debug logging for cleaner console

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

    const handleGamePhaseChanged = async (data: any) => {

      setGamePhase(data.phase);
      
      // Clear selected letter when starting new letter selection phase
      if (data.phase === 'letter_selection') {
        setSelectedLetter(null);
      }
      
      // Set selected letter when entering placement phase (robustness for missed letter:selected events)
      if (data.phase === 'letter_placement') {
        if (data.current_letter) {
          console.log('✅ Phase change included current_letter:', data.current_letter);
          setSelectedLetter(data.current_letter);
        } else if (data.gameId && user) {
          // Fallback: Fetch from API if letter not included in event
          console.warn('⚠️ Phase change missing current_letter, fetching from API');
          try {
            const gameData = await apiService.getGame(data.gameId);
            const currentPlayer = gameData?.game?.players?.find((p: any) => p.user_id === user.id);
            if (currentPlayer?.current_letter) {
              setSelectedLetter(currentPlayer.current_letter);
            } else {
              console.error('❌ Could not recover current_letter from API');
            }
          } catch (error) {
            console.error('❌ Failed to fetch game state for letter recovery:', error);
          }
        }
      }
      
      // Only set timer if we have a valid timer_end value
      if (data.timer_end && data.timer_end > Date.now()) {
        const remainingSeconds = Math.ceil((data.timer_end - Date.now()) / 1000);
        setGameTimer({
          endTime: data.timer_end,
          remainingSeconds: remainingSeconds,
          isWarning: remainingSeconds <= 5,
        });
      } else {
        setGameTimer(null);
      }
      
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
        setCurrentGame(prev => {
          if (!prev) return null;
          const updatedGame = { 
            ...prev, 
            phase: data.phase, 
            currentTurn: data.current_turn !== undefined ? data.current_turn : prev.currentTurn 
          };
          // Game state updated
          return updatedGame;
        });
      }
    };

    const handleLetterSelected = (data: any) => {
      console.log('🔤 Letter selected event received:', {
        letter: data.letter,
        playerId: data.playerId,
        turn: data.turn,
        timestamp: new Date().toLocaleTimeString()
      });
      
      // All players should get the selected letter to place on their own grids
      setSelectedLetter(data.letter);

      // Update player state
      setPlayers(prev => prev.map(p => 
        p.userId === data.playerId 
          ? { ...p, currentLetter: data.letter }
          : p
      ));
    };

    const handleLetterPlaced = (data: any) => {
      try {
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
      } catch (error) {
        logger.game.error('Error handling letter placed event', { error, data });
      }
    };

    const handleGameEnded = (data: any) => {
      try {
        // Parse grid and words data if they are JSON strings
        const parsedLeaderboard = (data.leaderboard || []).map((player: any) => {
          try {
            return {
              ...player,
              grid: typeof player.grid === 'string' ? JSON.parse(player.grid) : player.grid,
              words: typeof player.words === 'string' ? JSON.parse(player.words) : player.words
            };
          } catch (parseError) {
            console.error('❌ Error parsing player leaderboard data:', parseError, player);
            return {
              ...player,
              grid: player.grid,
              words: player.words
            };
          }
        });
        
        setLeaderboard(parsedLeaderboard);
        setGamePhase('finished');
        setGameTimer(null);
        
        // Store board size from game data
        if (data.boardSize) {
          setBoardSize(data.boardSize);
        }
        
        // Store reason if provided (e.g., player_left)
        if (data.reason) {
          setGameEndReason(data.reason);
        }
        
        if (currentGame) {
          setCurrentGame(prev => prev ? { ...prev, status: 'completed' } : null);
        }

        // Update room status back to waiting
        if (currentRoom) {
          setCurrentRoom(prev => prev ? { ...prev, status: 'waiting' } : null);
        }
      } catch (error) {
        logger.game.error('Error handling game ended event', { error, data });
        // Set minimal game end state
        setGamePhase('finished');
        setGameTimer(null);
      }
    };

    const handleGameStarted = (data: any) => {
      
      // Join the game socket room for receiving game events
      // Join game socket room
      if (data.gameId) {
        socketService.joinGame(data.gameId);
      }
      
      // Create game state from the event data
      const gameState = {
        id: data.gameId,
        roomId: data.roomId,
        phase: data.phase,
        currentTurn: data.currentTurn || 1, // Use socket data, fallback to 1
        status: 'active' as const
      };
      
      setCurrentGame(gameState);
      setGamePhase(data.phase as GamePhase);
      
      // If players are included in the event (reconnection), set them immediately
      if (data.players && Array.isArray(data.players) && data.players.length > 0) {
        console.log('🎮 Setting players from game:started event:', data.players.length);
        setPlayers(data.players);
      }
      
      // Update room status to playing
      if (currentRoom) {
        setCurrentRoom({
          ...currentRoom,
          status: 'playing'
        });
      }
      
      // Set timer if provided
      if (data.timer_end) {
        setGameTimer({
          endTime: data.timer_end,
          remainingSeconds: Math.ceil((data.timer_end - Date.now()) / 1000),
          isWarning: false,
        });
      }

      // Fetch current game state to get accurate phase and player data
      if (data.gameId) {

        apiService.getGame(data.gameId).then(gameData => {

          if (gameData && gameData.game) {
            const game = gameData.game;


            console.log('🔍 API game keys:', Object.keys(game));

            // Only update gamePhase if API has valid phase, otherwise keep socket phase
            if (game.current_phase) {
              setGamePhase(game.current_phase as GamePhase);
            } else {

            }
            
            setCurrentGame({
              id: game.id,
              roomId: game.room_id,
              phase: game.current_phase || data.phase, // Fallback to socket phase
              currentTurn: game.current_turn,
              status: 'active'
            });

            // Set players from game data
            if (game.players) {
              try {

                const mappedPlayers = game.players.map((p: any, index: number) => {
                  console.log(`🎯 Processing player ${index + 1}:`, {
                    id: p.id,
                    user_id: p.user_id,
                    position: p.position,
                    username: p.username,
                    grid_state_type: typeof p.grid_state,
                    grid_state_sample: typeof p.grid_state === 'string' 
                      ? p.grid_state.substring(0, 100) + '...' 
                      : p.grid_state ? 'parsed object' : 'null'
                  });
                  
                  let parsedGrid;
                  try {
                    // Handle case where grid_state might already be parsed
                    if (typeof p.grid_state === 'string') {
                      parsedGrid = JSON.parse(p.grid_state || '[[]]');
                    } else if (p.grid_state && Array.isArray(p.grid_state)) {
                      parsedGrid = p.grid_state;
                    } else {
                      throw new Error('Invalid grid_state format');
                    }
                  } catch (parseError) {
                    console.warn(`⚠️ Failed to parse grid_state for player ${p.user_id}:`, (parseError as Error).message);
                    console.warn(`Grid state content:`, p.grid_state);
                    // Create default grid based on room settings
                    const gridSize = currentRoom?.board_size || 5;
                    parsedGrid = Array(gridSize).fill(null).map((_, y) => 
                      Array(gridSize).fill(null).map((_, x) => ({
                        letter: null,
                        x: x,
                        y: y
                      }))
                    );
                  }
                  
                  return {
                    id: p.id,
                    userId: p.user_id,
                    gameId: game.id,
                    position: p.position,
                    username: p.username,
                    grid: parsedGrid,
                    currentLetter: p.current_letter || undefined,
                    placementConfirmed: p.placement_confirmed === 1,
                    finalScore: p.final_score || 0,
                    connected: true
                  };
                });

                setPlayers(mappedPlayers);
                
                console.log('👥 Setting players with position data:', 
                  mappedPlayers.map((p: Player) => ({ 
                    userId: p.userId, 
                    username: p.username, 
                    position: p.position, 
                    positionType: typeof p.position 
                  }))
                );
                
                // Set selectedLetter for current user if they have a current letter
                if (user) {
                  const currentPlayer = mappedPlayers.find((p: any) => p.userId === user.id);
                  if (currentPlayer?.currentLetter) {

                    setSelectedLetter(currentPlayer.currentLetter);
                  }
                }
              } catch (mappingError) {
                console.error('❌ Error during player mapping:', mappingError);

                // Fallback: Set basic game phase from socket data
                if (data.phase) {
                  setGamePhase(data.phase as GamePhase);
                  setCurrentGame({
                    id: data.gameId,
                    roomId: data.roomId,
                    phase: data.phase,
                    currentTurn: data.currentTurn || 1,
                    status: 'active'
                  });
                }
              }
            }
          }
        }).catch(err => {
          console.error('❌ Failed to fetch game state:', err);

          // Fallback: Set basic game phase from socket data
          if (data.phase) {

            setGamePhase(data.phase as GamePhase);
            setCurrentGame({
              id: data.gameId,
              roomId: data.roomId,
              phase: data.phase,
              currentTurn: data.currentTurn || 1,
              status: 'active'
            });
          }
          
          // Fallback: Create minimal mock player data
          if (user) {
            const gridSize = currentRoom?.board_size || 5; // Use room settings or default
            const mockPlayer: Player = {
              id: user.id,
              userId: user.id,
              gameId: data.gameId,
              position: 1, // Will be updated when real player data arrives
              username: user.username,
              grid: Array(gridSize).fill(null).map((_, y) => Array(gridSize).fill(null).map((_, x) => ({
                letter: null,
                x: x,
                y: y
              }))),
              currentLetter: undefined,
              placementConfirmed: false,
              finalScore: 0,
              connected: true
            };
            setPlayers([mockPlayer]);
          }
        });
      }
    };

    const handleRoomMemberLeft = (data: any) => {

      // Force refresh room data to get updated member list
      if (currentRoom && currentRoom.code === data.roomCode) {
        fetchRoomData(data.roomCode).catch(err => {
          console.error('Failed to refresh room data after member left:', err);
        });
      }
    };

    const handleGamePlayerLeft = (data: any) => {

      // Update current turn if it changed
      if (currentGame && data.newCurrentTurn) {
        setCurrentGame(prev => prev ? {
          ...prev,
          currentTurn: data.newCurrentTurn
        } : null);
      }
      
      // Refresh player list
      if (currentRoom) {
        fetchRoomData(currentRoom.code).catch(err => {
          console.error('Failed to refresh room data after player left game:', err);
        });
      }
    };

    const handleOwnershipTransferred = (data: any) => {
      try {
        // Update current room data
        if (currentRoom && currentRoom.code === data.roomCode) {
          setCurrentRoom(prev => prev ? { 
            ...prev, 
            created_by: data.newCreator.id 
          } : null);
        }
      } catch (error) {
        console.error('❌ Error handling ownership transferred event:', error, data);
      }
    };

    const handleRoomUpdated = (data: any) => {
      try {
        // Update current room data
        if (currentRoom && currentRoom.code === data.room.code) {
          setCurrentRoom(data.room);
        }
      } catch (error) {
        console.error('❌ Error handling room updated event:', error, data);
      }
    };

    const handleTurnSkipped = (data: any) => {
      try {
        // Update game state with new current turn
        setCurrentGame(prev => {
          if (!prev) return null;
          return { ...prev, currentTurn: data.nextPlayerId };
        });
      } catch (error) {
        console.error('❌ Error handling turn skipped event:', error, data);
      }
    };

    // Register socket events
    socketService.on('game:phase_changed', handleGamePhaseChanged);
    socketService.on('letter:selected', handleLetterSelected);
    socketService.on('letter:placed', handleLetterPlaced);
    socketService.on('game:ended', handleGameEnded);
    socketService.on('game:started', handleGameStarted);
    socketService.on('game:player_left', handleGamePlayerLeft);
    socketService.on('room:member_left', handleRoomMemberLeft);
    socketService.on('room:ownership_transferred', handleOwnershipTransferred);
    socketService.on('room:updated', handleRoomUpdated);
    socketService.on('turn:skipped', handleTurnSkipped);

    return () => {
      socketService.off('game:phase_changed', handleGamePhaseChanged);
      socketService.off('letter:selected', handleLetterSelected);
      socketService.off('letter:placed', handleLetterPlaced);
      socketService.off('game:ended', handleGameEnded);
      socketService.off('game:started', handleGameStarted);
      socketService.off('game:player_left', handleGamePlayerLeft);
      socketService.off('room:member_left', handleRoomMemberLeft);
      socketService.off('room:ownership_transferred', handleOwnershipTransferred);
      socketService.off('room:updated', handleRoomUpdated);
      socketService.off('turn:skipped', handleTurnSkipped);
    };
  }, [currentGame, currentRoom, user, players.length]);

  // Handle browser refresh/close - warn user and leave room
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (currentRoom && (currentGame || currentRoom.status === 'waiting')) {
        e.preventDefault();
        e.returnValue = 'Om du lämnar sidan kommer du att lämna rummet. Är du säker?';
        return 'Om du lämnar sidan kommer du att lämna rummet. Är du säker?';
      }
    };

    const handleUnload = () => {
      if (currentRoom) {
        try {
          // Use sendBeacon for reliable cleanup on page unload
          const API_BASE_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
          const url = `${API_BASE_URL}/api/rooms/${currentRoom.code}/leave`;
          const data = JSON.stringify({});
          
          // Include auth token in the request if available
          const token = localStorage.getItem('auth_token');
          const headers = new Headers();
          headers.append('Content-Type', 'application/json');
          if (token) {
            headers.append('Authorization', `Bearer ${token}`);
          }
          
          fetch(url, {
            method: 'DELETE',
            headers: headers,
            body: data,
            keepalive: true // Important for cleanup on page unload
          }).catch(() => {
            // Ignore errors during page unload
          });
        } catch (error) {
          console.warn('Failed to leave room on page unload:', error);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleUnload);
    };
  }, [currentRoom, currentGame]);

  // Game actions
  const startGame = useCallback(async (roomId: number) => {




    try {
      setIsLoading(true);
      setError(null);

      const game = await apiService.startGame(roomId);

      console.log('🎮 Game object structure:', {
        game,
        gameKeys: game ? Object.keys(game) : 'no game',
        gameState: game?.state,
        gameId: game?.id
      });
      
      // Convert Game to GameState format for our context
      const gameState: GameState = {
        id: Number(game.id),
        roomId: Number(game.roomId),
        phase: 'letter_selection', // Default phase when starting
        currentTurn: game.currentTurn || 1,
        status: 'active'
      };
      
      setCurrentGame(gameState);

      // Set game phase 
      setGamePhase('letter_selection');
      
      // Update room status to 'playing' after successful game start
      if (currentRoom) {

        setCurrentRoom({
          ...currentRoom,
          status: 'playing'
        });
      }
      
      // TODO: Load players data for the new game
      // For now, we'll rely on Socket events to populate players

      // TEMPORARY: Create mock player data so GameInterface can render
      if (user && game?.id) {
        const gridSize = currentRoom?.board_size || 5; // Use room settings or default
        const mockPlayer: Player = {
          id: user.id,
          userId: user.id,
          gameId: Number(game.id),
          position: 1, // Will be updated when real player data arrives
          username: user.username,
          grid: Array(gridSize).fill(null).map((_, y) => Array(gridSize).fill(null).map((_, x) => ({
            letter: null,
            x: x,
            y: y
          }))),
          currentLetter: undefined,
          placementConfirmed: false,
          finalScore: 0,
          connected: true
        };

        setPlayers([mockPlayer]);
      }
      
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

    }
  }, [currentRoom, user]);

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
      console.error('❌ selectLetter failed - missing game or player:', {
        hasCurrentGame: !!currentGame,
        hasCurrentPlayer: !!currentPlayer,
        playersLength: players.length,
        userId: user?.id
      });
      throw new Error('No active game or player');
    }

    // Check if it's the player's turn
    if (!isMyTurn) {
      console.error('❌ selectLetter failed - not player turn:', {
        currentTurn: currentGame.currentTurn,
        currentTurnType: typeof currentGame.currentTurn,
        playerUserId: user?.id,
        playerUserIdType: typeof user?.id,
        isMyTurnCalculation: `${Number(currentGame.currentTurn)} === ${Number(user?.id)} = ${Number(currentGame.currentTurn) === Number(user?.id)}`
      });
      throw new Error('It is not your turn to select a letter');
    }

    try {
      await apiService.selectLetter(currentGame.id, currentPlayer.userId, letter);
      setSelectedLetter(letter);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to select letter';
      setError(message);
      throw err;
    }
  }, [currentGame, currentPlayer, isMyTurn]);

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
  const joinRoom = useCallback(async (code: string, password?: string): Promise<Room> => {
    try {
      setIsLoading(true);
      setError(null);

      const room = await apiService.joinRoom(code, password);

      console.log('🏠 Room object keys:', Object.keys(room));
      setCurrentRoom(room);
      
      // If room is playing, fetch the active game
      if (room.status === 'playing') {
        try {
          console.log('🎮 Room is playing, fetching active game...');
          const gameResponse = await apiService.getGameByRoomId(room.id);
          if (gameResponse && gameResponse.game) {
            const game = gameResponse.game;
            const gameState: GameState = {
              id: Number(game.id),
              roomId: Number(game.room_id),
              phase: 'letter_selection', // Will be updated by socket events
              currentTurn: game.current_turn || 1,
              status: 'active'
            };
            setCurrentGame(gameState);
            setGamePhase('letter_selection'); // Will be updated by socket
            console.log('🎮 Restored game state:', gameState);
          }
        } catch (gameErr) {
          console.error('Failed to fetch active game:', gameErr);
          // Don't fail the join if we can't fetch game - socket will sync
        }
      }
      
      // Also join the Socket.IO room immediately
      socketService.joinRoom(code);
      
      return room;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join room';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const leaveRoom = useCallback(async (intentional: boolean = false) => {
    if (!currentRoom) return;
    
    try {
      await apiService.leaveRoom(currentRoom.code, intentional);
      setCurrentRoom(null);
      setCurrentGame(null);
      setPlayers([]);
      setGamePhase(null);
      setGameTimer(null);
      setSelectedLetter(null);
      setLeaderboard(null);
      setGameEndReason(null);
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
    gameEndReason,
    boardSize,
  };

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
};
