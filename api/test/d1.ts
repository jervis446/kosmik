/** A D1-shaped wrapper around in-memory SQLite (which D1 is built on), with all migrations applied. */
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

type Stmt = { sql: string; args: SQLInputValue[] };

export function d1(): { db: D1Database; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).sort()) raw.exec(readFileSync(new URL(f, dir), 'utf8'));

  const toArg = (v: unknown): SQLInputValue => (v instanceof ArrayBuffer ? new Uint8Array(v) : (v as SQLInputValue));
  const run = (s: Stmt) => ({ meta: { changes: Number(raw.prepare(s.sql).run(...s.args).changes) } });
  const make = (sql: string, args: SQLInputValue[] = []) => {
    const s: Stmt = { sql, args };
    return {
      ...s,
      bind: (...a: unknown[]) => make(sql, a.map(toArg)),
      run: async () => run(s),
      all: async () => ({ results: raw.prepare(sql).all(...args) }),
      first: async () => raw.prepare(sql).get(...args) ?? null,
    };
  };
  const db = {
    prepare: (sql: string) => make(sql),
    batch: async (stmts: Stmt[]) => {
      raw.exec('BEGIN');
      try {
        const out = stmts.map(run);
        raw.exec('COMMIT');
        return out;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { db: db as unknown as D1Database, raw };
}
