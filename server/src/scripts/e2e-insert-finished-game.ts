import { DatabaseManager } from '../config/database';

const getArg = (name: string): string | undefined => {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
};

const mustNumber = (name: string): number => {
  const raw = getArg(name);
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) {
    throw new Error(`Missing/invalid ${name} (got: ${raw ?? 'undefined'})`);
  }
  return n;
};

async function main() {
  const roomId = mustNumber('--roomId');
  const user1 = mustNumber('--user1');
  const user2 = mustNumber('--user2');
  const score1 = Number(getArg('--score1') ?? '12');
  const score2 = Number(getArg('--score2') ?? '9');

  const words1 = getArg('--words1') ?? '[]';
  const words2 = getArg('--words2') ?? '[]';

  const dbManager = await DatabaseManager.getInstance();
  const db = dbManager.getDatabase();

  const gameRes = await db.run(
    `INSERT INTO games (room_id, state, current_phase, finished_at)
     VALUES (?, 'finished', 'finished', CURRENT_TIMESTAMP)`,
    roomId
  );

  const gameId = gameRes.lastInsertRowid as number;

  await db.run(
    `INSERT INTO players (game_id, user_id, position, score, final_score, words_found)
     VALUES (?, ?, ?, ?, ?, ?)`,
    gameId,
    user1,
    0,
    score1,
    score1,
    words1
  );

  await db.run(
    `INSERT INTO players (game_id, user_id, position, score, final_score, words_found)
     VALUES (?, ?, ?, ?, ?, ?)`,
    gameId,
    user2,
    1,
    score2,
    score2,
    words2
  );

  // Print a single JSON line so callers can parse it easily.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ roomId, gameId, user1, user2, score1, score2 }));

  await dbManager.close();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
