import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { config } from './config.js'

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL })

export async function query<T extends pg.QueryResultRow>(text: string, values: unknown[] = []) {
  return pool.query<T>(text, values)
}

export async function migrate() {
  const currentFile = fileURLToPath(import.meta.url)
  const schemaPath = path.join(path.dirname(currentFile), 'schema.sql')
  const schema = await readFile(schemaPath, 'utf8')
  await pool.query(schema)
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
