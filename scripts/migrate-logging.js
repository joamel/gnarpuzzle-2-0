#!/usr/bin/env node
/**
 * Script för att migrera console.log till strukturerad loggning
 * 
 * Usage: node migrate-logging.js <file-path>
 */

const fs = require('fs');
const path = require('path');

const replacements = [
  // Game events
  { 
    pattern: /console\.log\(['"`]📖 Word validation service initialized['"`]\);?/g,
    replacement: "gameLogger.info('Word validation service initialized');"
  },
  {
    pattern: /console\.error\(['"`]Failed to initialize word validation service:['"`],\s*error\);?/g,
    replacement: "gameLogger.error('Failed to initialize word validation service', { error });"
  },
  {
    pattern: /console\.log\(['"`]⏰ Set letter selection timeout for \$\{settings\.letter_timer\} seconds['"`]\);?/g,
    replacement: "gameLogger.debug('Set letter selection timeout', { seconds: settings.letter_timer });"
  },
  {
    pattern: /console\.log\(['"`]⏰ handleLetterSelectionTimeout triggered for game \$\{gameId\}['"`]\);?/g,
    replacement: "gameLogger.warn('Letter selection timeout triggered', { gameId });"
  },
  {
    pattern: /console\.log\(['"`]⏰ handlePlacementTimeout triggered for game \$\{gameId\}['"`]\);?/g,
    replacement: "gameLogger.warn('Placement timeout triggered', { gameId });"
  },
  {
    pattern: /console\.log\(['"`]🏁 Game \$\{gameId\} ended\. Winner: \$\{players\[0\]\?\.username\} \(\$\{players\[0\]\?\.final_score\} pts\)['"`]\);?/g,
    replacement: "gameLogger.info('Game ended', { gameId, winner: players[0]?.username, score: players[0]?.final_score });"
  },

  // Socket events  
  {
    pattern: /console\.log\(['"`]🔗 Connected to server['"`]\);?/g,
    replacement: "socketLogger.info('Connected to server');"
  },
  {
    pattern: /console\.error\(['"`]❌ Socket connection error:['"`],\s*error\);?/g,
    replacement: "socketLogger.error('Socket connection error', { error });"
  },
  {
    pattern: /console\.log\(['"`]💔 Disconnected from server:['"`],\s*reason\);?/g,
    replacement: "socketLogger.warn('Disconnected from server', { reason });"
  },

  // Room events
  {
    pattern: /console\.log\(['"`]🏠 RoomModel\.create:/g,
    replacement: "roomLogger.debug('Room creation:"
  },
  {
    pattern: /console\.log\(['"`]👥 RoomModel\./g,
    replacement: "roomLogger.debug('Room:"
  },

  // Database
  {
    pattern: /console\.error\(['"`]❌ SQL Error in /g,
    replacement: "dbLogger.error('SQL Error:"
  },

  // Debug logs to remove (too verbose)
  {
    pattern: /console\.log\(['"`]🔍 (ALL|GET|RUN|EXEC):/g,
    replacement: "// dbLogger.debug('"
  },
];

function migrateFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let newContent = content;
  let changeCount = 0;

  replacements.forEach(({ pattern, replacement }) => {
    const matches = newContent.match(pattern);
    if (matches) {
      changeCount += matches.length;
      newContent = newContent.replace(pattern, replacement);
    }
  });

  if (changeCount > 0) {
    // Add logger imports if not present
    if (!newContent.includes('gameLogger') && changeCount > 0) {
      const importMatch = newContent.match(/^import.*from.*$/m);
      if (importMatch) {
        const loggerImports = [];
        if (newContent.includes('gameLogger')) loggerImports.push('gameLogger');
        if (newContent.includes('socketLogger')) loggerImports.push('socketLogger');
        if (newContent.includes('roomLogger')) loggerImports.push('roomLogger');
        if (newContent.includes('dbLogger')) loggerImports.push('dbLogger');
        
        if (loggerImports.length > 0) {
          const importStatement = `import { ${loggerImports.join(', ')} } from '../utils/logger';\n`;
          newContent = newContent.replace(importMatch[0], importMatch[0] + '\n' + importStatement);
        }
      }
    }

    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`✅ Updated ${filePath}: ${changeCount} changes`);
  } else {
    console.log(`⏭️  Skipped ${filePath}: no changes needed`);
  }
}

// Get file path from command line
const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node migrate-logging.js <file-path>');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

migrateFile(filePath);
