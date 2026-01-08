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
      // Try multiple paths for dictionary file
      // Development: /data/swedish.json or /server/data/swedish.json
      // Production: ../data/swedish.json from compiled dist/
      const possiblePaths = [
        path.join(process.cwd(), 'data', 'swedish.json'),
        path.join(process.cwd(), 'server', 'data', 'swedish.json'),
        path.join(__dirname, '..', '..', 'data', 'swedish.json'),
        // Render production path: app root has data/ folder
        path.join('/', 'app', 'data', 'swedish.json')
      ];
      
      let dictPath: string | null = null;
      for (const p of possiblePaths) {
        try {
          await fs.promises.access(p);
          dictPath = p;
          console.log(`✅ Found dictionary at: ${dictPath}`);
          break;
        } catch {
          // Try next path
        }
      }
      
      if (!dictPath) {
        throw new Error('Dictionary file not found in any expected location');
      }
      
      try {
        const dictData = await fs.promises.readFile(dictPath, 'utf-8');
        const words: string[] = JSON.parse(dictData);
        
        // Add all words to Set for O(1) lookup, normalize to uppercase
        words.forEach(word => {
          if (word && word.length >= 2) {
            this.swedishWords.add(word.toUpperCase().trim());
          }
        });

        console.log(`✅ Swedish dictionary loaded: ${this.swedishWords.size} words`);
      } catch (fileError: any) {
        console.error('❌ Failed to read dictionary file:', fileError);
        throw fileError;
      }
      
      this.isLoaded = true;
    } catch (error) {
      console.error('❌ Failed to load Swedish dictionary:', error);
      // Don't use fallback mode - require dictionary to be available
      throw new Error('Could not load word dictionary. Dictionary file must be present at data/swedish.json');
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
   * Find optimal word partition for a letter sequence.
   * Uses dynamic programming to find the partition that maximizes score.
   * Each letter can only be used once (no overlapping words).
   * 
   * Example: "LÅSTA" could be ["LÅS", "TA"] or ["LÅ", "STA"] or ["LÅSTA"]
   * Returns the partition with the highest total points.
   */
  private findOptimalPartition(sequence: string): { words: Array<{ word: string; startPos: number }>; totalPoints: number } {
    const n = sequence.length;
    
    // dp[i] = { words: Array<{word, startPos}>, totalPoints: number } for optimal partition of sequence[0..i-1]
    const dp: Array<{ words: Array<{ word: string; startPos: number }>; totalPoints: number }> = [];
    dp[0] = { words: [], totalPoints: 0 };
    
    // Track the best partition found at any position
    let bestOverall: { words: Array<{ word: string; startPos: number }>; totalPoints: number } = { words: [], totalPoints: 0 };

    for (let i = 1; i <= n; i++) {
      let best = dp[i - 1]; // Inherit from previous position
      
      // Try all possible last words ending at position i
      for (let j = 0; j < i; j++) {
        const word = sequence.substring(j, i);
        
        // Only consider words of length 2 or more
        if (word.length >= 2 && this.isValidWord(word)) {
          const prevPartition = dp[j];
          if (prevPartition) {
            const newPoints = prevPartition.totalPoints + this.calculateWordPoints(word);
            
            // Update best if this partition has more points
            if (newPoints > best.totalPoints) {
              best = {
                words: [...prevPartition.words, { word, startPos: j }],
                totalPoints: newPoints
              };
            }
          }
        }
      }
      
      dp[i] = best;
      
      // Track best partition overall (not just at the end)
      if (best.totalPoints > bestOverall.totalPoints) {
        bestOverall = best;
      }
    }

    // Return the best partition found anywhere, not just at the end
    return bestOverall;
  }

  /**
   * Find all valid words in grid with positions and scoring.
   * Uses optimal partitioning: each letter sequence is split into non-overlapping words
   * that maximize the score. Each letter can only be used once per line.
   */
  findValidWords(grid: GridCell[][]): WordScore[] {
    const validWords: WordScore[] = [];
    const gridSize = grid.length;

    // Helper to process a letter sequence into optimal partition
    const processSequence = (
      letters: string, 
      startPos: number, 
      row: number, 
      direction: 'horizontal' | 'vertical',
      isLineComplete: boolean
    ) => {
      if (letters.length < 2) {
        return;
      }

      const partition = this.findOptimalPartition(letters);
      
      // If we found at least one valid word partition
      if (partition.words.length > 0) {
        for (const wordInfo of partition.words) {
          const { word, startPos: wordOffsetInSeq } = wordInfo;
          
          // Double-check that word is valid (safety check)
          if (!this.isValidWord(word)) {
            console.warn(`⚠️ Invalid word in partition: "${word}" - skipping`);
            continue;
          }
          
          // Calculate absolute position: startPos (of sequence) + wordOffsetInSeq (in sequence)
          const absolutePos = startPos + wordOffsetInSeq;
          
          // Mark as complete only if:
          // 1. The line is completely filled
          // 2. This partition uses the ENTIRE line (all letters)
          // 3. AND this is a single-word partition (the entire line is one word)
          const allWords = partition.words.map(w => w.word).join('');
          const isCompleteWord = isLineComplete && 
            allWords === letters && 
            partition.words.length === 1 &&
            word === letters;
          
          // Calculate points: base points (word length) + bonus (+2 for complete row/column)
          const basePoints = this.calculateWordPoints(word);
          const totalPoints = basePoints + (isCompleteWord ? 2 : 0);
          
          // Calculate actual start position for this word
          const wordStartX = direction === 'horizontal' ? absolutePos : row;
          const wordStartY = direction === 'horizontal' ? row : absolutePos;
            
          validWords.push({
            word,
            points: totalPoints,
            startX: wordStartX,
            startY: wordStartY,
            direction,
            isComplete: isCompleteWord
          });
        }
      }
    };

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
          if (currentWord.length >= 2) {
            processSequence(currentWord, startX, y, 'horizontal', this.isRowComplete(grid, y));
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
          if (currentWord.length >= 2) {
            processSequence(currentWord, startY, x, 'vertical', this.isColumnComplete(grid, x));
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
    const completedRowsSet = new Set<number>();
    const completedColsSet = new Set<number>();

    // Calculate points from valid words (already includes +2 bonus for complete words)
    validWords.forEach(wordScore => {
      totalPoints += wordScore.points;
      
      // Track completed rows/columns for stats (bonus already included in wordScore.points)
      if (wordScore.isComplete) {
        if (wordScore.direction === 'horizontal') {
          completedRowsSet.add(wordScore.startY);
        } else {
          completedColsSet.add(wordScore.startX);
        }
      }
    });

    return {
      words: validWords,
      totalPoints,
      completedRows: completedRowsSet.size,
      completedCols: completedColsSet.size
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