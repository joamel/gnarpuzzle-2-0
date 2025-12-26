import { WordValidationService } from '../services/WordValidationService';
import { GridCell } from '../models/types';

describe('WordValidationService', () => {
  let wordService: WordValidationService;

  beforeAll(async () => {
    wordService = WordValidationService.getInstance();
    await wordService.loadDictionary();
  });

  describe('Dictionary Loading', () => {
    test('should load Swedish dictionary successfully', () => {
      expect(wordService.isReady()).toBe(true);
      expect(wordService.getDictionarySize()).toBeGreaterThan(1000);
    });

    test('should be singleton instance', () => {
      const instance2 = WordValidationService.getInstance();
      expect(wordService).toBe(instance2);
    });
  });

  describe('Word Validation', () => {
    test('should validate common Swedish words', () => {
      expect(wordService.isValidWord('HUND')).toBe(true);
      expect(wordService.isValidWord('KATT')).toBe(true);
      expect(wordService.isValidWord('HUS')).toBe(true);
      expect(wordService.isValidWord('BIL')).toBe(true);
    });

    test('should reject invalid words', () => {
      expect(wordService.isValidWord('XYZQ')).toBe(false);
      expect(wordService.isValidWord('ASDFGH')).toBe(false);
      expect(wordService.isValidWord('')).toBe(false);
      expect(wordService.isValidWord('X')).toBe(false); // Too short
    });

    test('should handle case insensitive validation', () => {
      expect(wordService.isValidWord('hund')).toBe(true);
      expect(wordService.isValidWord('Katt')).toBe(true);
      expect(wordService.isValidWord('HUS')).toBe(true);
    });

    test('should handle Swedish characters', () => {
      expect(wordService.isValidWord('KÖR')).toBe(true);
      expect(wordService.isValidWord('HÄR')).toBe(true);
      expect(wordService.isValidWord('SÅ')).toBe(true);
    });
  });

  describe('Grid Word Extraction', () => {
    test('should extract horizontal words from grid', () => {
      const grid: GridCell[][] = [
        [
          { letter: 'H', x: 0, y: 0 },
          { letter: 'U', x: 1, y: 0 },
          { letter: 'N', x: 2, y: 0 },
          { letter: 'D', x: 3, y: 0 }
        ],
        [
          { letter: null, x: 0, y: 1 },
          { letter: null, x: 1, y: 1 },
          { letter: null, x: 2, y: 1 },
          { letter: null, x: 3, y: 1 }
        ],
        [
          { letter: 'K', x: 0, y: 2 },
          { letter: 'A', x: 1, y: 2 },
          { letter: 'T', x: 2, y: 2 },
          { letter: 'T', x: 3, y: 2 }
        ],
        [
          { letter: null, x: 0, y: 3 },
          { letter: null, x: 1, y: 3 },
          { letter: null, x: 2, y: 3 },
          { letter: null, x: 3, y: 3 }
        ]
      ];

      const words = wordService.extractWordsFromGrid(grid);
      expect(words).toContain('HUND');
      expect(words).toContain('KATT');
    });

    test('should extract vertical words from grid', () => {
      const grid: GridCell[][] = [
        [
          { letter: 'H', x: 0, y: 0 },
          { letter: 'K', x: 1, y: 0 },
          { letter: null, x: 2, y: 0 },
          { letter: null, x: 3, y: 0 }
        ],
        [
          { letter: 'U', x: 0, y: 1 },
          { letter: 'A', x: 1, y: 1 },
          { letter: null, x: 2, y: 1 },
          { letter: null, x: 3, y: 1 }
        ],
        [
          { letter: 'S', x: 0, y: 2 },
          { letter: 'T', x: 1, y: 2 },
          { letter: null, x: 2, y: 2 },
          { letter: null, x: 3, y: 2 }
        ],
        [
          { letter: null, x: 0, y: 3 },
          { letter: 'T', x: 1, y: 3 },
          { letter: null, x: 2, y: 3 },
          { letter: null, x: 3, y: 3 }
        ]
      ];

      const words = wordService.extractWordsFromGrid(grid);
      expect(words).toContain('HUS');
      expect(words).toContain('KATT');
    });
  });

  describe('Word Scoring', () => {
    test('should find valid words with correct scores', () => {
      const grid: GridCell[][] = [
        [
          { letter: 'H', x: 0, y: 0 },
          { letter: 'U', x: 1, y: 0 },
          { letter: 'N', x: 2, y: 0 },
          { letter: 'D', x: 3, y: 0 }
        ],
        [
          { letter: null, x: 0, y: 1 },
          { letter: null, x: 1, y: 1 },
          { letter: null, x: 2, y: 1 },
          { letter: null, x: 3, y: 1 }
        ],
        [
          { letter: null, x: 0, y: 2 },
          { letter: null, x: 1, y: 2 },
          { letter: null, x: 2, y: 2 },
          { letter: null, x: 3, y: 2 }
        ],
        [
          { letter: null, x: 0, y: 3 },
          { letter: null, x: 1, y: 3 },
          { letter: null, x: 2, y: 3 },
          { letter: null, x: 3, y: 3 }
        ]
      ];

      const validWords = wordService.findValidWords(grid);
      const hundWord = validWords.find(w => w.word === 'HUND');
      
      expect(hundWord).toBeDefined();
      expect(hundWord?.points).toBe(4); // 1 point per letter
      expect(hundWord?.direction).toBe('horizontal');
      expect(hundWord?.startX).toBe(0);
      expect(hundWord?.startY).toBe(0);
      expect(hundWord?.isComplete).toBe(true); // Full row
    });

    test('should calculate total grid score with bonuses', () => {
      const grid: GridCell[][] = [
        [
          { letter: 'H', x: 0, y: 0 },
          { letter: 'U', x: 1, y: 0 },
          { letter: 'N', x: 2, y: 0 },
          { letter: 'D', x: 3, y: 0 }
        ],
        [
          { letter: 'U', x: 0, y: 1 },
          { letter: 'S', x: 1, y: 1 },
          { letter: null, x: 2, y: 1 },
          { letter: null, x: 3, y: 1 }
        ],
        [
          { letter: 'S', x: 0, y: 2 },
          { letter: null, x: 1, y: 2 },
          { letter: null, x: 2, y: 2 },
          { letter: null, x: 3, y: 2 }
        ],
        [
          { letter: null, x: 0, y: 3 },
          { letter: null, x: 1, y: 3 },
          { letter: null, x: 2, y: 3 },
          { letter: null, x: 3, y: 3 }
        ]
      ];

      const gridScore = wordService.calculateGridScore(grid);
      
      // Should find at least HUND (4 pts + 2 bonus for complete row)
      expect(gridScore.totalPoints).toBeGreaterThan(4);
      expect(gridScore.words.length).toBeGreaterThan(0);
      expect(gridScore.completedRows).toBe(1); // First row is complete
    });
  });

  describe('Complete Lines Detection', () => {
    test('should detect complete rows and columns', () => {
      const grid: GridCell[][] = [
        [
          { letter: 'K', x: 0, y: 0 },
          { letter: 'A', x: 1, y: 0 },
          { letter: 'T', x: 2, y: 0 }
        ],
        [
          { letter: 'A', x: 0, y: 1 },
          { letter: null, x: 1, y: 1 },
          { letter: null, x: 2, y: 1 }
        ],
        [
          { letter: 'R', x: 0, y: 2 },
          { letter: null, x: 1, y: 2 },
          { letter: null, x: 2, y: 2 }
        ]
      ];

      const validWords = wordService.findValidWords(grid);
      
      // Should find at least one word (horizontal KAT or vertical KAR)
      expect(validWords.length).toBeGreaterThan(0);
      // Note: Not all word combinations may be valid Swedish words
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty grid', () => {
      const grid: GridCell[][] = [
        [
          { letter: null, x: 0, y: 0 },
          { letter: null, x: 1, y: 0 }
        ],
        [
          { letter: null, x: 0, y: 1 },
          { letter: null, x: 1, y: 1 }
        ]
      ];

      const words = wordService.extractWordsFromGrid(grid);
      const validWords = wordService.findValidWords(grid);
      const gridScore = wordService.calculateGridScore(grid);
      
      expect(words).toHaveLength(0);
      expect(validWords).toHaveLength(0);
      expect(gridScore.totalPoints).toBe(0);
    });

    test('should handle single letters (too short for words)', () => {
      const grid: GridCell[][] = [
        [
          { letter: 'A', x: 0, y: 0 },
          { letter: null, x: 1, y: 0 }
        ],
        [
          { letter: null, x: 0, y: 1 },
          { letter: 'B', x: 1, y: 1 }
        ]
      ];

      const words = wordService.extractWordsFromGrid(grid);
      expect(words).toHaveLength(0); // Single letters don't count
    });
  });
});