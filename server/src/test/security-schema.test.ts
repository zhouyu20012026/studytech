import { readFile } from 'node:fs/promises'
import bcrypt from 'bcryptjs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { migrate, pool } from '../db.js'
import { seedDatabase } from '../seed.js'

describe('security schema', () => {
  beforeAll(async () => {
    await migrate()
  })

  afterAll(async () => {
    await pool.query('update users set email = $1, password_hash = $2 where id = $3', ['admin@example.com', await bcrypt.hash('admin12345', 12), 'user-admin'])
    await pool.end()
  })

  it('declares reset token and audit log tables', async () => {
    const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8')
    expect(schema).toContain('create table if not exists password_reset_tokens')
    expect(schema).toContain('create table if not exists admin_audit_logs')
  })

  it('updates the seeded admin when admin email changes', async () => {
    await seedDatabase({ closePool: false })

    vi.stubEnv('ADMIN_EMAIL', '49703878@qq.com')
    vi.resetModules()
    const { seedDatabase: seedWithUpdatedEnv } = await import('../seed.js')
    await seedWithUpdatedEnv({ closePool: false })

    const result = await pool.query<{ email: string }>('select email from users where id = $1', ['user-admin'])
    expect(result.rows[0].email).toBe('49703878@qq.com')
  })
})
