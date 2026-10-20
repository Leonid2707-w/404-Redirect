import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

type Row = Record<string, unknown>;
type QueryResult<T extends Row = Row> = { results: T[] };

let client: NeonQueryFunction<false, false> | null = null;
let schemaPromise: Promise<void> | null = null;

function connectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

function getClient() {
  if (client) return client;
  const url = connectionString();
  if (!url) throw new Error("DATABASE_URL is not configured");
  client = neon(url);
  return client;
}

function postgresPlaceholders(query: string) {
  let index = 0;
  return query.replace(/\?/g, () => `$${++index}`);
}

async function ensureSchema() {
  if (!schemaPromise) {
    const sql = getClient();
    schemaPromise = sql
      .transaction([
        sql.query(`
          CREATE TABLE IF NOT EXISTS tracking_links (
            id SERIAL PRIMARY KEY,
            slug TEXT NOT NULL UNIQUE,
            label TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT '',
            account TEXT NOT NULL DEFAULT '',
            campaign TEXT NOT NULL DEFAULT '',
            active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
            created_at TEXT NOT NULL
          )
        `),
        sql.query(`
          CREATE TABLE IF NOT EXISTS events (
            id SERIAL PRIMARY KEY,
            event_type TEXT NOT NULL,
            action TEXT NOT NULL DEFAULT '',
            link_id INTEGER REFERENCES tracking_links(id) ON DELETE SET NULL,
            visitor_id TEXT NOT NULL,
            page TEXT NOT NULL DEFAULT '/',
            referrer TEXT NOT NULL DEFAULT '',
            country TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
          )
        `),
        sql.query(`
          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          )
        `),
        sql.query("CREATE INDEX IF NOT EXISTS events_created_at_idx ON events (created_at)"),
        sql.query("CREATE INDEX IF NOT EXISTS events_link_id_idx ON events (link_id)"),
        sql.query("CREATE INDEX IF NOT EXISTS events_type_idx ON events (event_type)"),
      ])
      .then(() => undefined)
      .catch((error) => {
        schemaPromise = null;
        throw error;
      });
  }
  return schemaPromise;
}

export class DatabasePreparedStatement {
  readonly query: string;
  readonly values: unknown[];

  constructor(query: string, values: unknown[] = []) {
    this.query = postgresPlaceholders(query);
    this.values = values;
  }

  bind(...values: unknown[]) {
    return new DatabasePreparedStatement(this.query, values);
  }

  private async execute<T extends Row = Row>() {
    await ensureSchema();
    return (await getClient().query(this.query, this.values)) as T[];
  }

  async all<T extends Row = Row>(): Promise<QueryResult<T>> {
    return { results: await this.execute<T>() };
  }

  async first<T extends Row = Row>(): Promise<T | null> {
    const rows = await this.execute<T>();
    return rows[0] || null;
  }

  async run() {
    await this.execute();
    return { success: true };
  }
}

class Database {
  prepare(query: string) {
    return new DatabasePreparedStatement(query);
  }

  async batch(statements: DatabasePreparedStatement[]): Promise<QueryResult[]> {
    await ensureSchema();
    const sql = getClient();
    const results = await sql.transaction(
      statements.map((statement) => sql.query(statement.query, statement.values)),
    );
    return results.map((rows) => ({ results: rows as Row[] }));
  }
}

const database = new Database();

export function getPostgresDatabase() {
  return database;
}
