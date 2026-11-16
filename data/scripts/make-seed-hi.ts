/**
 * Writes api/seed/hindi.sql: the Hindi library made by translate-hi.ts (meaning cards, herb names,
 * Gita verse renderings). Safe to re-run; make-seed.ts includes the same lines in a full rebuild.
 *
 * Usage: node data/scripts/make-seed-hi.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const sql = (s: string) => `'${s.replace(/'/g, "''")}'`;
const read = <T>(p: string, empty: T): T => (existsSync(new URL(p, root)) ? JSON.parse(readFileSync(new URL(p, root), 'utf8')) : empty);

export function hindiLines(): string[] {
  const lines: string[] = [];
  for (const m of read<{ kind: string; key: string; title: string; body: string }[]>('meanings-hi.json', [])) {
    lines.push(`INSERT OR REPLACE INTO meanings (kind, key, lang, title, body, reviewed) VALUES (${sql(m.kind)}, ${sql(m.key)}, 'hi', ${sql(m.title)}, ${sql(m.body)}, 0);`);
  }
  for (const [key, name] of Object.entries(read<Record<string, string>>('herb-names-hi.json', {}))) lines.push(`UPDATE herbs SET name_hi = ${sql(name)} WHERE key = ${sql(key)};`);
  for (const [ref, text] of Object.entries(read<Record<string, string>>('verses-hi.json', {}))) lines.push(`UPDATE verses SET translation_hi = ${sql(text)} WHERE ref = ${sql(ref)};`);
  return lines;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const lines = hindiLines();
  mkdirSync(new URL('../api/seed/', root), { recursive: true });
  writeFileSync(new URL('../api/seed/hindi.sql', root), `${lines.join('\n')}\n`);
  console.log(`Hindi seed: ${lines.length} statements`);
}
