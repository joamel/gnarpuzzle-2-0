import { describe, it, expect, beforeAll } from 'vitest';
import { WordValidationService } from './WordValidationService';
import { GridCell } from '../models/types';

describe('WordValidationService Scoring', () => {
  let service: WordValidationService;

  beforeAll(async () => {
    service = WordValidationService.getInstance();
    await service.loadDictionary();
  });

  it('Complete row LÅSTA scores correctly with optimal partition', () => {
      const grid: GridCell[][] = [
        [
          { letter: 'L', x: 0, y: 0 },
          { letter: 'Å', x: 1, y: 0 },
          { letter: 'S', x: 2, y: 0 },
          { letter: 'T', x: 3, y: 0 },
          { letter: 'A', x: 4, y: 0 }
        ],
        [{ letter: null, x: 0, y: 1 }, { letter: null, x: 1, y: 1 }, { letter: null, x: 2, y: 1 }, { letter: null, x: 3, y: 1 }, { letter: null, x: 4, y: 1 }],
        [{ letter: null, x: 0, y: 2 }, { letter: null, x: 1, y: 2 }, { letter: null, x: 2, y: 2 }, { letter: null, x: 3, y: 2 }, { letter: null, x: 4, y: 2 }],
        [{ letter: null, x: 0, y: 3 }, { letter: null, x: 1, y: 3 }, { letter: null, x: 2, y: 3 }, { letter: null, x: 3, y: 3 }, { letter: null, x: 4, y: 3 }],
        [{ letter: null, x: 0, y: 4 }, { letter: null, x: 1, y: 4 }, { letter: null, x: 2, y: 4 }, { letter: null, x: 3, y: 4 }, { letter: null, x: 4, y: 4 }]
      ];

      const score = service.calculateGridScore(grid);

      // Should find LÅS (3p) + TA (2p) = 5p word points
      // No complete row bonus since LÅSTA isn't a valid word as one unit
      expect(score.totalPoints).toBe(5); // 5p words, no bonus
      expect(score.words.length).toBe(2);
      expect(score.words.map(w => w.word)).toContain('LÅS');
      expect(score.words.map(w => w.word)).toContain('TA');
      expect(score.completedRows).toBe(0); // Row filled but not forming a valid single word
    });

    it('should not give complete row bonus for partial rows', () => {
      const grid: GridCell[][] = [
        [
          { letter: 'H', x: 0, y: 0 },
          { letter: 'E', x: 1, y: 0 },
          { letter: 'J', x: 2, y: 0 },
          { letter: null, x: 3, y: 0 },
          { letter: 'L', x: 4, y: 0 }
        ],
        [{ letter: null, x: 0, y: 1 }, { letter: null, x: 1, y: 1 }, { letter: null, x: 2, y: 1 }, { letter: null, x: 3, y: 1 }, { letter: 'Ä', x: 4, y: 1 }],
        [{ letter: null, x: 0, y: 2 }, { letter: null, x: 1, y: 2 }, { letter: null, x: 2, y: 2 }, { letter: null, x: 3, y: 2 }, { letter: 'R', x: 4, y: 2 }],
        [{ letter: null, x: 0, y: 3 }, { letter: null, x: 1, y: 3 }, { letter: null, x: 2, y: 3 }, { letter: null, x: 3, y: 3 }, { letter: null, x: 4, y: 3 }],
        [{ letter: null, x: 0, y: 4 }, { letter: null, x: 1, y: 4 }, { letter: null, x: 2, y: 4 }, { letter: null, x: 3, y: 4 }, { letter: null, x: 4, y: 4 }]
      ];

      const score = service.calculateGridScore(grid);

      // Should find HEJ (3p) + LÄR (3p) = 6p, NO complete row bonus
      expect(score.totalPoints).toBe(6);
      expect(score.completedRows).toBe(0);
    });

    it('should validate dictionary is loaded and working', () => {
      expect(service.isReady()).toBe(true);
      expect(service.getDictionarySize()).toBeGreaterThan(100000);
    });

    it('should not count single letters as words', () => {
      const grid: GridCell[][] = [
        [
          { letter: 'A', x: 0, y: 0 },
          { letter: null, x: 1, y: 0 },
          { letter: null, x: 2, y: 0 },
          { letter: null, x: 3, y: 0 },
          { letter: null, x: 4, y: 0 }
        ],
        [{ letter: null, x: 0, y: 1 }, { letter: null, x: 1, y: 1 }, { letter: null, x: 2, y: 1 }, { letter: null, x: 3, y: 1 }, { letter: null, x: 4, y: 1 }],
        [{ letter: null, x: 0, y: 2 }, { letter: null, x: 1, y: 2 }, { letter: null, x: 2, y: 2 }, { letter: null, x: 3, y: 2 }, { letter: null, x: 4, y: 2 }],
        [{ letter: null, x: 0, y: 3 }, { letter: null, x: 1, y: 3 }, { letter: null, x: 2, y: 3 }, { letter: null, x: 3, y: 3 }, { letter: null, x: 4, y: 3 }],
        [{ letter: null, x: 0, y: 4 }, { letter: null, x: 1, y: 4 }, { letter: null, x: 2, y: 4 }, { letter: null, x: 3, y: 4 }, { letter: null, x: 4, y: 4 }]
      ];

      const score = service.calculateGridScore(grid);

      // Single letter should not count
      expect(score.totalPoints).toBe(0);
      expect(score.words.length).toBe(0);
    });
  });
