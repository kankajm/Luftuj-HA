import { Database } from "bun:sqlite";
import type { Statement } from "bun:sqlite";
import { copyFileSync, existsSync, mkdirSync } from "fs";
import { promises as fsp } from "fs";
import path from "path";

const DEFAULT_DATA_DIR = "/data";
const FALLBACK_DATA_DIR = path.resolve(process.cwd(), "../../data");

const dataDir = (() => {
  if (process.env.LUFTATOR_DB_PATH) {
    return path.dirname(process.env.LUFTATOR_DB_PATH);
  }
  if (existsSync(DEFAULT_DATA_DIR)) {
    return DEFAULT_DATA_DIR;
  }
  return FALLBACK_DATA_DIR;
})();

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const DATABASE_PATH = process.env.LUFTATOR_DB_PATH ?? path.join(dataDir, "luftator.db");

interface Migration {
  id: string;
  statements: string[];
}

const migrations: Migration[] = [
  {
    id: "001_initial",
    statements: [
      `CREATE TABLE IF NOT EXISTS controllers (
        id TEXT PRIMARY KEY,
        name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS valve_state (
        entity_id TEXT PRIMARY KEY,
        controller_id TEXT,
        name TEXT,
        value REAL,
        state TEXT,
        last_updated TEXT NOT NULL,
        attributes TEXT,
        FOREIGN KEY (controller_id) REFERENCES controllers(id)
      )`,
      `CREATE TABLE IF NOT EXISTS valve_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id TEXT NOT NULL,
        controller_id TEXT,
        name TEXT,
        value REAL,
        state TEXT,
        recorded_at TEXT NOT NULL,
        attributes TEXT,
        FOREIGN KEY (controller_id) REFERENCES controllers(id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_valve_history_entity_id_recorded_at
        ON valve_history(entity_id, recorded_at DESC)`
    ],
  },
];

let db: Database | null = null;

type StatementMap = {
  upsertController: Statement;
  upsertValveState: Statement;
  insertValveHistory: Statement;
};

let statements: StatementMap | null = null;

type ValveStateRecord = {
  entity_id: string;
  controller_id: string | null;
  name: string | null;
  value: number | null;
  state: string | null;
  timestamp: string;
  attributes: string;
};

function openDatabase(): Database {
  return new Database(DATABASE_PATH, { create: true });
}

function applyMigrations(database: Database): void {
  database.run("PRAGMA journal_mode = WAL;");
  database.run(
    `CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );`,
  );

  const migrationRows = database.query("SELECT id FROM migrations").all() as { id: string }[];
  const existing = new Set(migrationRows.map((row) => row.id));

  const insertMigration = database.prepare("INSERT INTO migrations (id) VALUES (?)");

  for (const migration of migrations) {
    if (existing.has(migration.id)) {
      continue;
    }
    database.run("BEGIN");
    try {
      for (const sql of migration.statements) {
        database.run(sql);
      }
      insertMigration.run(migration.id);
      database.run("COMMIT");
    } catch (error) {
      database.run("ROLLBACK");
      throw error;
    }
  }
}

function finalizeStatements(): void {
  if (!statements) {
    return;
  }
  statements.upsertController.finalize();
  statements.upsertValveState.finalize();
  statements.insertValveHistory.finalize();
  statements = null;
}

function prepareStatements(database: Database): StatementMap {
  return {
    upsertController: database.prepare(
      `INSERT INTO controllers (id, name, created_at, updated_at)
       VALUES (?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = datetime('now')`,
    ),
    upsertValveState: database.prepare(
      `INSERT INTO valve_state (entity_id, controller_id, name, value, state, last_updated, attributes)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(entity_id) DO UPDATE SET
         controller_id = excluded.controller_id,
         name = excluded.name,
         value = excluded.value,
         state = excluded.state,
         last_updated = excluded.last_updated,
         attributes = excluded.attributes`,
    ),
    insertValveHistory: database.prepare(
      `INSERT INTO valve_history (entity_id, controller_id, name, value, state, recorded_at, attributes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
  };
}

function setupDatabase(): void {
  if (statements) {
    finalizeStatements();
  }
  if (db) {
    db.close();
    db = null;
  }

  db = openDatabase();
  applyMigrations(db);
  statements = prepareStatements(db);
}

setupDatabase();

export interface ValveSnapshotRecord {
  entityId: string;
  controllerId: string | null;
  controllerName?: string | null;
  name: string | null;
  value: number | null;
  state: string | null;
  attributes: Record<string, unknown> | null;
  timestamp?: string;
}

function normaliseRecord(record: ValveSnapshotRecord): ValveStateRecord {
  return {
    entity_id: record.entityId,
    controller_id: record.controllerId,
    name: record.name ?? null,
    value: record.value ?? null,
    state: record.state ?? null,
    attributes: JSON.stringify(record.attributes ?? {}),
    timestamp: record.timestamp ?? new Date().toISOString(),
  };
}

export function storeValveSnapshots(records: ValveSnapshotRecord[]): void {
  if (records.length === 0) {
    return;
  }

  if (!db || !statements) {
    throw new Error("Database not initialised");
  }

  const prepared = statements;

  const transaction = db.transaction((items: ValveSnapshotRecord[]) => {
    for (const item of items) {
      const record = normaliseRecord(item);
      if (record.controller_id) {
        prepared.upsertController.run(record.controller_id, item.controllerName ?? null);
      }
      prepared.upsertValveState.run(
        record.entity_id,
        record.controller_id,
        record.name,
        record.value,
        record.state,
        record.timestamp,
        record.attributes,
      );
      prepared.insertValveHistory.run(
        record.entity_id,
        record.controller_id,
        record.name,
        record.value,
        record.state,
        record.timestamp,
        record.attributes,
      );
    }
  });

  transaction(records);
}

export function getDatabasePath(): string {
  return DATABASE_PATH;
}

export async function createDatabaseBackup(): Promise<string | null> {
  const sourcePath = getDatabasePath();
  if (!existsSync(sourcePath)) {
    return null;
  }

  const backupPath = `${sourcePath}.${Date.now()}.bak`;
  copyFileSync(sourcePath, backupPath);
  return backupPath;
}

export async function replaceDatabaseWithFile(buffer: Buffer): Promise<void> {
  if (statements) {
    finalizeStatements();
  }
  if (db) {
    db.close();
    db = null;
  }

  await fsp.writeFile(getDatabasePath(), buffer);
  setupDatabase();
}
