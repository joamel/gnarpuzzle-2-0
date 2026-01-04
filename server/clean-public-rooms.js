const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'gnarpuzzle.db');
const db = new Database(dbPath);

console.log('🧹 Cleaning up duplicate public rooms...');

// Delete all public rooms (is_private = false or settings contains is_private: false)
const publicRoomNames = ['Snabbspel 4×4', 'Klassiskt 5×5', 'Utmaning 6×6'];

for (const name of publicRoomNames) {
  try {
    const result = db.prepare('DELETE FROM rooms WHERE name = ?').run(name);
    console.log(`✅ Deleted ${result.changes} instances of "${name}"`);
  } catch (err) {
    console.error(`❌ Error deleting "${name}":`, err.message);
  }
}

console.log('✨ Cleanup complete!');
db.close();
