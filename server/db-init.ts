import Database from "better-sqlite3";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Single source of truth for the runtime database schema.
 *
 * The schema is declared once in shared/schema.ts (Drizzle) and materialized
 * into ./migrations by `npx drizzle-kit generate`. This module applies those
 * migration files at startup. The raw CREATE TABLE strings that used to live in
 * storage.ts are gone — Drizzle is now the only place the schema is defined.
 *
 * Non-destructive baseline: an already-populated legacy data.db predates the
 * migrations journal. On first run we detect existing tables and record the
 * initial migration as "applied" WITHOUT executing it, so existing data is
 * never dropped. Subsequent migrations (added columns/tables) then run against
 * both fresh and legacy databases.
 */

// esbuild's cjs bundle provides a native __dirname; in dev (tsx ESM) there is
// no __dirname binding, so `typeof` returns "undefined" without throwing. We
// avoid import.meta.url entirely because it is empty in the cjs output format.
const scriptDir = typeof __dirname !== "undefined" ? __dirname : undefined;

// In dev (tsx) migrations sit at ../migrations relative to server/. In the
// esbuild bundle (dist/index.cjs) they sit next to the bundle at ../migrations.
// Both dev and prod are launched from the project root, so cwd/migrations is a
// reliable fallback.
function migrationsDir(): string {
  const candidates = [
    scriptDir ? join(scriptDir, "..", "migrations") : undefined,
    join(process.cwd(), "migrations"),
  ].filter((p): p is string => p !== undefined);
  return candidates.find((p) => existsSync(join(p, "meta", "_journal.json"))) ?? candidates[candidates.length - 1];
}

type JournalEntry = { idx: number; tag: string };

export function initDatabase(sqlite: Database.Database) {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (tag TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)"
  );

  const dir = migrationsDir();
  const journalPath = join(dir, "meta", "_journal.json");
  if (!existsSync(journalPath)) {
    console.warn("[db-init] no migrations journal found; skipping migrations");
    return;
  }

  const journal = JSON.parse(readFileSync(journalPath, "utf-8")) as {
    entries: JournalEntry[];
  };
  const entries = [...journal.entries].sort((a, b) => a.idx - b.idx);

  const applied = new Set(
    sqlite.prepare("SELECT tag FROM _migrations").all().map((r: any) => r.tag as string)
  );

  // Legacy DB = core tables exist but nothing recorded in the journal yet.
  const tasksExists = !!sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'")
    .get();
  const isLegacyBaseline = tasksExists && applied.size === 0;

  const record = sqlite.prepare(
    "INSERT INTO _migrations (tag, applied_at) VALUES (?, ?)"
  );

  for (const entry of entries) {
    if (applied.has(entry.tag)) continue;

    if (entry.idx === 0 && isLegacyBaseline) {
      record.run(entry.tag, Date.now());
      console.log(`[db-init] baselined existing database at ${entry.tag} (not executed)`);
      continue;
    }

    const sql = readFileSync(join(dir, `${entry.tag}.sql`), "utf-8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    const tx = sqlite.transaction(() => {
      for (const stmt of statements) sqlite.exec(stmt);
      record.run(entry.tag, Date.now());
    });
    tx();
    console.log(`[db-init] applied migration ${entry.tag}`);
  }
}
