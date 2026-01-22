import { Pool, PoolConfig, QueryResult } from 'pg';
import { dbLogger } from '../utils/logger';
import { DatabaseInterface } from './sqlite';

function normalizeParams(params: any[]): any[] {
  if (params.length === 1 && Array.isArray(params[0])) {
    return params[0];
  }
  return params;
}

function replaceSqlitePlaceholdersWithPostgres(sql: string): string {
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  let result = '';
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];

    if (ch === "'" && !inDoubleQuote) {
      // Toggle single-quote mode unless escaped by doubled quotes.
      const next = sql[i + 1];
      if (inSingleQuote && next === "'") {
        result += "''";
        i++;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      result += ch;
      continue;
    }

    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      result += ch;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && ch === '?') {
      index += 1;
      result += `$${index}`;
      continue;
    }

    result += ch;
  }

  return result;
}

function translateSqliteDdlToPostgres(sql: string): string {
  // Minimal compatibility layer for the existing migration strings.
  return sql
    .replace(/\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi, 'SERIAL PRIMARY KEY')
    .replace(/\bDATETIME\b/gi, 'TIMESTAMP')
    .replace(/\bCOLLATE\s+NOCASE\b/gi, '');
}

function maybeAddReturningId(sql: string): string {
  const cleaned = sql.trim().replace(/;\s*$/, '');
  const match = cleaned.match(/^insert\s+into\s+([a-zA-Z0-9_\.\"]+)/i);
  if (!match) return cleaned;

  const tableNameRaw = match[1];
  const tableName = tableNameRaw.replace(/"/g, '').split('.').pop()?.toLowerCase() ?? '';

  if (/\breturning\b/i.test(cleaned)) return cleaned;

  // Tables that don't have an `id` primary key.
  if (tableName === 'schema_migrations' || tableName === 'migrations') return cleaned;

  return `${cleaned} RETURNING id`;
}

export class PostgresDatabase implements DatabaseInterface {
  private pool: Pool;

  constructor(connectionString: string) {
    const config: PoolConfig = {
      connectionString,
    };

    // Render Postgres commonly expects SSL for external connections.
    // Make it opt-out via DATABASE_SSL=false.
    const sslDisabled = process.env.DATABASE_SSL === 'false';
    if (!sslDisabled && process.env.NODE_ENV === 'production') {
      (config as any).ssl = { rejectUnauthorized: false };
    }

    this.pool = new Pool(config);
    dbLogger.info('Postgres Database pool created');
  }

  private async query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
    const normalizedSql = replaceSqlitePlaceholdersWithPostgres(translateSqliteDdlToPostgres(sql));
    try {
      return await this.pool.query<T>(normalizedSql, params);
    } catch (error) {
      dbLogger.error('SQL Error (Postgres)', {
        message: (error as Error).message,
        sql: normalizedSql,
        params,
      });
      throw error;
    }
  }

  async run(query: string, ...params: any[]): Promise<{ lastInsertRowid: number; changes: number }> {
    const normalizedParams = normalizeParams(params);

    // Preserve SQLite-like lastInsertRowid behavior for our codebase.
    const sql = maybeAddReturningId(query);
    const result = await this.query(sql, normalizedParams);

    const lastInsertRowid = (result.rows as any)?.[0]?.id ? Number((result.rows as any)[0].id) : 0;
    return {
      lastInsertRowid,
      changes: result.rowCount ?? 0,
    };
  }

  async get(query: string, ...params: any[]): Promise<any> {
    const normalizedParams = normalizeParams(params);
    const result = await this.query(query, normalizedParams);
    return result.rows[0] ?? null;
  }

  async all(query: string, ...params: any[]): Promise<any[]> {
    const normalizedParams = normalizeParams(params);
    const result = await this.query(query, normalizedParams);
    return result.rows;
  }

  async exec(query: string): Promise<void> {
    // `MigrationRunner` already splits statements; keep this simple.
    await this.query(query, []);
  }

  async close(): Promise<void> {
    await this.pool.end();
    dbLogger.info('Postgres Database pool closed');
  }

  // Compatibility helpers used by DatabaseManager in development.
  async clearAllRoomsAndGames(): Promise<void> {
    await this.exec('DELETE FROM players;');
    await this.exec('DELETE FROM games;');
    await this.exec('DELETE FROM room_members;');
    await this.exec('DELETE FROM rooms;');
  }

  async resetPlayingRooms(): Promise<void> {
    await this.exec('DELETE FROM players;');
    await this.exec('DELETE FROM games;');
    await this.run("UPDATE rooms SET status = 'waiting' WHERE status = 'playing'");
  }
}
