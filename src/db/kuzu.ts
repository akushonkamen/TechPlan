import kuzu, { Database, Connection } from 'kuzu';
import path from 'path';

let db: Database | null = null;
let conn: Connection | null = null;

const DB_PATH = path.resolve(process.cwd(), 'database.kuzu');

export async function getKuzuConnection(): Promise<Connection> {
  if (conn) return conn;

  db = new kuzu.Database(DB_PATH);
  conn = new kuzu.Connection(db);

  await initSchema(conn);
  return conn;
}

/**
 * Execute a Cypher query. Uses prepare+execute when params are provided,
 * or plain query for simple statements.
 */
export async function kuzuQuery(cypher: string, params?: Record<string, any>): Promise<any[]> {
  if (!conn) throw new Error('Kuzu not initialized');

  let result: any;
  if (params && Object.keys(params).length > 0) {
    const stmt = await conn.prepare(cypher);
    result = await conn.execute(stmt, params);
  } else {
    result = await conn.query(cypher);
  }

  const rows = await result.getAll();
  result.close();
  return rows as any[];
}

async function initSchema(connection: Connection): Promise<void> {
  const statements = [
    // Node tables
    `CREATE NODE TABLE IF NOT EXISTS Topic (
      id STRING,
      name STRING,
      description STRING,
      PRIMARY KEY (id)
    )`,

    `CREATE NODE TABLE IF NOT EXISTS Entity (
      name STRING,
      type STRING,
      confidence DOUBLE,
      docCount INT64,
      firstSeen STRING,
      PRIMARY KEY (name)
    )`,

    `CREATE NODE TABLE IF NOT EXISTS Event (
      id STRING,
      title STRING,
      eventType STRING,
      eventTime STRING,
      participants STRING,
      confidence DOUBLE,
      PRIMARY KEY (id)
    )`,

    `CREATE NODE TABLE IF NOT EXISTS Claim (
      id STRING,
      text STRING,
      polarity STRING,
      confidence DOUBLE,
      PRIMARY KEY (id)
    )`,

    // Relationship tables
    `CREATE REL TABLE IF NOT EXISTS HAS_ENTITY (FROM Topic TO Entity)`,
    `CREATE REL TABLE IF NOT EXISTS HAS_EVENT (FROM Topic TO Event)`,
    `CREATE REL TABLE IF NOT EXISTS HAS_CLAIM (FROM Topic TO Claim)`,
    `CREATE REL TABLE IF NOT EXISTS PARTICIPATED_IN (FROM Entity TO Event)`,
    `CREATE REL TABLE IF NOT EXISTS DEVELOPS (FROM Entity TO Entity, confidence DOUBLE)`,
    `CREATE REL TABLE IF NOT EXISTS COMPETES_WITH (FROM Entity TO Entity, confidence DOUBLE)`,
    `CREATE REL TABLE IF NOT EXISTS USES (FROM Entity TO Entity, confidence DOUBLE)`,
    `CREATE REL TABLE IF NOT EXISTS INVESTS_IN (FROM Entity TO Entity, confidence DOUBLE)`,
    `CREATE REL TABLE IF NOT EXISTS PARTNERS_WITH (FROM Entity TO Entity, confidence DOUBLE)`,
    `CREATE REL TABLE IF NOT EXISTS PUBLISHED_BY (FROM Entity TO Entity, confidence DOUBLE)`,
    `CREATE REL TABLE IF NOT EXISTS SUPPORTS (FROM Entity TO Entity, confidence DOUBLE)`,
    `CREATE REL TABLE IF NOT EXISTS CONTRADICTS (FROM Entity TO Entity, confidence DOUBLE)`,
    `CREATE REL TABLE IF NOT EXISTS MENTIONS (FROM Entity TO Entity, confidence DOUBLE)`,
    `CREATE REL TABLE IF NOT EXISTS COMPRESSES (FROM Entity TO Entity, confidence DOUBLE)`,
    `CREATE REL TABLE IF NOT EXISTS EXTENDS (FROM Entity TO Entity, confidence DOUBLE)`,
    `CREATE REL TABLE IF NOT EXISTS MODIFIES (FROM Entity TO Entity, confidence DOUBLE)`,
    `CREATE REL TABLE IF NOT EXISTS IMPROVES (FROM Entity TO Entity, confidence DOUBLE)`,
    `CREATE REL TABLE IF NOT EXISTS EVOLVES_FROM (FROM Entity TO Entity, confidence DOUBLE)`,
    `CREATE REL TABLE IF NOT EXISTS BENCHMARKS (FROM Entity TO Entity, confidence DOUBLE)`,
    `CREATE REL TABLE IF NOT EXISTS RELATED_TO (FROM Entity TO Entity, confidence DOUBLE)`,
  ];

  for (const stmt of statements) {
    try {
      const result = await connection.query(stmt);
      if (!Array.isArray(result)) result.close();
    } catch (err: any) {
      if (!String(err?.message || '').includes('already exists')) {
        console.error('[Kuzu] Schema error:', err?.message);
      }
    }
  }
}

export async function closeKuzu(): Promise<void> {
  try {
    if (conn) { conn = null; }
    if (db) { db = null; }
  } catch {}
}
