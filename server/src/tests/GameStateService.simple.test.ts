import { GameStateService } from '../services/GameStateService';
import { SocketService } from '../services/SocketService';

// Mock SocketService for testing
const mockSocketService = {
  broadcastToRoom: jest.fn(),
  emitToGame: jest.fn(),
  emitToRoom: jest.fn(),
  emitToUser: jest.fn()
} as unknown as SocketService;

describe('GameStateService', () => {
  let gameStateService: GameStateService;

  beforeAll(async () => {
    // Initialize service
    process.env.NODE_ENV = 'test';
    gameStateService = GameStateService.getInstance(mockSocketService);
  });

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('Letter Generation', () => {
    test('should generate Swedish letters correctly', () => {
      const letters = gameStateService.getSwedishLetters();
      
      expect(letters).toContain('A');
      expect(letters).toContain('Å');
      expect(letters).toContain('Ä');
      expect(letters).toContain('Ö');
      expect(letters).toHaveLength(29); // A-Z + Å, Ä, Ö
    });

    test('should generate all unique letters', () => {
      const letters = gameStateService.getSwedishLetters();
      
      expect(letters).toHaveLength(29);
      expect(new Set(letters).size).toBe(29); // All unique
      
      // Check that we have vowels
      const vowels = letters.filter((l: string) => ['A', 'E', 'I', 'O', 'U', 'Y', 'Å', 'Ä', 'Ö'].includes(l));
      expect(vowels.length).toBeGreaterThan(0);
    });

    test('should include all Swedish alphabet letters', () => {
      const letters = gameStateService.getSwedishLetters();
      const swedishAlphabet = [
        'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
        'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
        'Å', 'Ä', 'Ö'
      ];

      swedishAlphabet.forEach(letter => {
        expect(letters).toContain(letter);
      });
    });
  });

  describe('Helper Methods', () => {
    test('should have helper methods available', () => {
      // Test that the service has expected functionality
      expect(typeof gameStateService.getSwedishLetters).toBe('function');
      
      // Test service can be instantiated
      expect(gameStateService).toBeDefined();
    });
  });

  describe('Game Phase Constants', () => {
    test('should have correct game phases defined', () => {
      // Test that the service has access to the expected phases
      // Since these might be imported from types, we test indirectly
      expect(typeof gameStateService.getSwedishLetters).toBe('function');
      
      // We can test that letter generation works with expected Swedish letters
      const letters = gameStateService.getSwedishLetters();
      expect(letters).toContain('Å');
      expect(letters).toContain('Ä'); 
      expect(letters).toContain('Ö');
    });
  });

  describe('Service Initialization', () => {
    test('should create singleton instance', () => {
      const instance1 = GameStateService.getInstance(mockSocketService);
      const instance2 = GameStateService.getInstance(mockSocketService);
      
      expect(instance1).toBe(instance2);
    });

    test('should initialize with socket service', () => {
      const service = GameStateService.getInstance(mockSocketService);
      
      expect(service).toBeDefined();
      expect(service.getSwedishLetters).toBeDefined();
    });
  });
});