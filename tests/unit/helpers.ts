import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Scenario } from '../../src/scenario/types';

let SQL: Promise<SqlJsStatic> | null = null;
export function sqlJs(): Promise<SqlJsStatic> {
  SQL ??= initSqlJs();
  return SQL;
}

export function radice(rel: string): string {
  return fileURLToPath(new URL(`../../${rel}`, import.meta.url));
}

export function leggiScenario(rel = 'scenari-esempio/universita.json'): Scenario {
  return JSON.parse(readFileSync(radice(rel), 'utf-8')) as Scenario;
}
