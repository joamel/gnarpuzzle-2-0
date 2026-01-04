"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WordValidationService = void 0;
const fs = require("fs");
const path = require("path");
class WordValidationService {
    constructor() {
        this.swedishWords = new Set();
        this.isLoaded = false;
        this.isFallbackMode = false;
    }
    static getInstance() {
        if (!WordValidationService.instance) {
            WordValidationService.instance = new WordValidationService();
        }
        return WordValidationService.instance;
    }
    /**
     * Load Swedish dictionary from JSON file
     */
    async loadDictionary() {
        if (this.isLoaded)
            return;
        try {
            const dictPath = path.join(process.cwd(), 'data', 'swedish.json');
            try {
                const dictData = await fs.promises.readFile(dictPath, 'utf-8');
                const words = JSON.parse(dictData);
                // Add all words to Set for O(1) lookup, normalize to uppercase
                words.forEach(word => {
                    if (word && word.length >= 2) {
                        this.swedishWords.add(word.toUpperCase().trim());
                    }
                });
                console.log(`📖 Swedish dictionary loaded: ${this.swedishWords.size} words`);
            }
            catch (fileError) {
                // If file doesn't exist, use fallback mode
                if (fileError.code === 'ENOENT') {
                    console.warn('⚠️  Swedish dictionary file not found, using fallback mode (accept any 2+ char word)');
                    this.isFallbackMode = true;
                }
                else {
                    throw fileError;
                }
            }
            this.isLoaded = true;
        }
        catch (error) {
            console.error('Failed to load Swedish dictionary:', error);
            throw new Error('Could not load word dictionary');
        }
    }
    /**
     * Check if a word exists in the Swedish dictionary
     */
    isValidWord(word) {
        if (!this.isLoaded) {
            throw new Error('Dictionary not loaded. Call loadDictionary() first.');
        }
        if (!word || word.length < 2)
            return false;
        // In fallback mode, accept any word 2+ characters (no dictionary validation)
        if (this.isFallbackMode) {
            return true;
        }
        return this.swedishWords.has(word.toUpperCase().trim());
    }
    /**
     * Extract all possible words from a grid (horizontal and vertical)
     */
    extractWordsFromGrid(grid) {
        const words = [];
        const gridSize = grid.length;
        // Extract horizontal words
        for (let y = 0; y < gridSize; y++) {
            let currentWord = '';
            for (let x = 0; x < gridSize; x++) {
                const cell = grid[y][x];
                if (cell.letter) {
                    currentWord += cell.letter;
                }
                else {
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
                }
                else {
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
    findOptimalPartition(sequence) {
        const n = sequence.length;
        // dp[i] = { words: string[], totalPoints: number } for optimal partition of sequence[0..i-1]
        const dp = [];
        dp[0] = { words: [], totalPoints: 0 };
        for (let i = 1; i <= n; i++) {
            let best = { words: [], totalPoints: 0 };
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
                                words: [...prevPartition.words, word],
                                totalPoints: newPoints
                            };
                        }
                    }
                }
            }
            dp[i] = best;
        }
        return dp[n];
    }
    /**
     * Find all valid words in grid with positions and scoring.
     * Uses optimal partitioning: each letter sequence is split into non-overlapping words
     * that maximize the score. Each letter can only be used once per line.
     */
    findValidWords(grid) {
        const validWords = [];
        const gridSize = grid.length;
        // Helper to process a letter sequence into optimal partition
        const processSequence = (letters, startPos, row, direction, isLineComplete) => {
            if (letters.length < 2) {
                return;
            }
            const partition = this.findOptimalPartition(letters);
            // If we found at least one valid word partition
            if (partition.words.length > 0) {
                let currentPos = startPos;
                for (const word of partition.words) {
                    validWords.push({
                        word,
                        points: this.calculateWordPoints(word),
                        startX: direction === 'horizontal' ? currentPos : startPos,
                        startY: direction === 'horizontal' ? row : currentPos,
                        direction,
                        // Mark as complete only if this partition uses the entire line
                        isComplete: isLineComplete && partition.words.join('') === letters
                    });
                    currentPos += word.length;
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
                }
                else {
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
                }
                else {
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
    calculateGridScore(grid) {
        const validWords = this.findValidWords(grid);
        let totalPoints = 0;
        const completedRowsSet = new Set();
        const completedColsSet = new Set();
        // Calculate points from valid words
        validWords.forEach(wordScore => {
            totalPoints += wordScore.points;
            // Add bonus for complete rows/columns (only once per line)
            if (wordScore.isComplete) {
                if (wordScore.direction === 'horizontal') {
                    if (!completedRowsSet.has(wordScore.startY)) {
                        totalPoints += 2; // 2 point bonus for complete row
                        completedRowsSet.add(wordScore.startY);
                    }
                }
                else {
                    if (!completedColsSet.has(wordScore.startX)) {
                        totalPoints += 2; // 2 point bonus for complete column
                        completedColsSet.add(wordScore.startX);
                    }
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
    calculateWordPoints(word) {
        return word.length;
    }
    /**
     * Check if a row is completely filled
     */
    isRowComplete(grid, row) {
        return grid[row].every(cell => cell.letter !== null);
    }
    /**
     * Check if a column is completely filled
     */
    isColumnComplete(grid, col) {
        return grid.every(row => row[col].letter !== null);
    }
    /**
     * Get dictionary size (for debugging/stats)
     */
    getDictionarySize() {
        return this.swedishWords.size;
    }
    /**
     * Check if dictionary is loaded
     */
    isReady() {
        return this.isLoaded;
    }
}
exports.WordValidationService = WordValidationService;
