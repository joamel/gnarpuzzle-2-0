import * as fs from 'fs';
import * as path from 'path';
import { GridCell } from '../models/types';

export interface WordScore {
  word: string;
  points: number;
  startX: number;
  startY: number;
  direction: 'horizontal' | 'vertical';
  isComplete: boolean;
}

export interface GridScore {
  words: WordScore[];
  totalPoints: number;
  completedRows: number;
  completedCols: number;
}

export class WordValidationService {
  private static instance: WordValidationService;
  private swedishWords: Set<string> = new Set();
  private isLoaded = false;

  private constructor() {}

  public static getInstance(): WordValidationService {
    if (!WordValidationService.instance) {
      WordValidationService.instance = new WordValidationService();
    }
    return WordValidationService.instance;
  }

  /**
   * Load Swedish dictionary from JSON file
   */
  async loadDictionary(): Promise<void> {
    if (this.isLoaded) return;

    try {
      const dictPath = path.join(process.cwd(), 'data', 'swedish.json');
      const dictData = await fs.promises.readFile(dictPath, 'utf-8');
      const words: string[] = JSON.parse(dictData);
      
      // Add all words to Set for O(1) lookup, normalize to uppercase
      words.forEach(word => {
        if (word && word.length >= 2) {
          this.swedishWords.add(word.toUpperCase().trim());
        }
      });

      console.log(`📖 Swedish dictionary loaded: ${this.swedishWords.size} words`);
      this.isLoaded = true;
    } catch (error) {
      console.error('Failed to load Swedish dictionary:', error);
      throw new Error('Could not load word dictionary');
    }
  }

  /**
   * Check if a word exists in the Swedish dictionary
   */
  isValidWord(word: string): boolean {
    if (!this.isLoaded) {
      throw new Error('Dictionary not loaded. Call loadDictionary() first.');
    }
    
    if (!word || word.length < 2) return false;
    return this.swedishWords.has(word.toUpperCase().trim());
  }

  /**
   * Extract all possible words from a grid (horizontal and vertical)
   */
  extractWordsFromGrid(grid: GridCell[][]): string[] {
    const words: string[] = [];
    const gridSize = grid.length;

    // Extract horizontal words
    for (let y = 0; y < gridSize; y++) {
      let currentWord = '';
      for (let x = 0; x < gridSize; x++) {
        const cell = grid[y][x];
        if (cell.letter) {
          currentWord += cell.letter;
        } else {
          // End of word sequence
          if (currentWord.length >= 2) {
            words.push(currentWord);
          }
          currentWord = '';
        }
      }
      // Check word at end of row
      if (currentWord.length >= 2) {
        words.push(currentWord);
      }
    }

    // Extract vertical words
    for (let x = 0; x < gridSize; x++) {
      let currentWord = '';
      for (let y = 0; y < gridSize; y++) {
        const cell = grid[y][x];
        if (cell.letter) {
          currentWord += cell.letter;
        } else {
          // End of word sequence
          if (currentWord.length >= 2) {
            words.push(currentWord);
          }
          currentWord = '';
        }
      }
      // Check word at end of column
      if (currentWord.length >= 2) {
        words.push(currentWord);
      }
    }

    return words;
  }

  /**
   * Find all valid words in grid with positions and scoring
   */
  findValidWords(grid: GridCell[][]): WordScore[] {
    const validWords: WordScore[] = [];
    const gridSize = grid.length;

    // Find horizontal words
    for (let y = 0; y < gridSize; y++) {
      let currentWord = '';
      let startX = 0;
      
      for (let x = 0; x <= gridSize; x++) {
        const cell = x < gridSize ? grid[y][x] : null;
        
        if (cell?.letter) {
          if (currentWord === '') {
            startX = x;
          }
          currentWord += cell.letter;
        } else {
          // End of word sequence or end of row
          if (currentWord.length >= 2 && this.isValidWord(currentWord)) {
            validWords.push({
              word: currentWord,
              points: this.calculateWordPoints(currentWord),
              startX,
              startY: y,
              direction: 'horizontal',
              isComplete: this.isRowComplete(grid, y)
            });
          }
          currentWord = '';
        }
      }
    }

    // Find vertical words
    for (let x = 0; x < gridSize; x++) {
      let currentWord = '';
      let startY = 0;
      
      for (let y = 0; y <= gridSize; y++) {
        const cell = y < gridSize ? grid[y][x] : null;
        
        if (cell?.letter) {
          if (currentWord === '') {
            startY = y;
          }
          currentWord += cell.letter;
        } else {
          // End of word sequence or end of column
          if (currentWord.length >= 2 && this.isValidWord(currentWord)) {
            validWords.push({
              word: currentWord,
              points: this.calculateWordPoints(currentWord),
              startX: x,
              startY,
              direction: 'vertical',
              isComplete: this.isColumnComplete(grid, x)
            });
          }
          currentWord = '';
        }
      }
    }

    return validWords;
  }

  /**
   * Calculate total score for a player's grid
   */
  calculateGridScore(grid: GridCell[][]): GridScore {
    const validWords = this.findValidWords(grid);
    let totalPoints = 0;
    let completedRows = 0;
    let completedCols = 0;

    // Calculate points from valid words
    validWords.forEach(wordScore => {
      totalPoints += wordScore.points;
      
      // Add bonus for complete rows/columns
      if (wordScore.isComplete) {
        totalPoints += 2; // 2 point bonus for complete line
        
        if (wordScore.direction === 'horizontal') {
          completedRows++;
        } else {
          completedCols++;
        }
      }
    });

    return {
      words: validWords,
      totalPoints,
      completedRows,
      completedCols
    };
  }

  /**
   * Calculate points for a word (1 point per letter)
   */
  private calculateWordPoints(word: string): number {
    return word.length;
  }

  /**
   * Check if a row is completely filled
   */
  private isRowComplete(grid: GridCell[][], row: number): boolean {
    return grid[row].every(cell => cell.letter !== null);
  }

  /**
   * Check if a column is completely filled
   */
  private isColumnComplete(grid: GridCell[][], col: number): boolean {
    return grid.every(row => row[col].letter !== null);
  }

  /**
   * Get dictionary size (for debugging/stats)
   */
  getDictionarySize(): number {
    return this.swedishWords.size;
  }

  /**
   * Check if dictionary is loaded
   */
  isReady(): boolean {
    return this.isLoaded;
  }
}