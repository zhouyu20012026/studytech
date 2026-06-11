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

  it('declares multi-home platform tables and columns', async () => {
    const tables = await pool.query<{ tableName: string }>(
      `select table_name as "tableName"
       from information_schema.tables
       where table_schema = 'public'
         and table_name in ('home_memberships', 'home_invitations', 'email_verification_tokens')`,
    )
    expect(tables.rows.map((row) => row.tableName).sort()).toEqual(['email_verification_tokens', 'home_invitations', 'home_memberships'])

    const columns = await pool.query<{ columnName: string }>(
      `select column_name as "columnName"
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'users'
         and column_name in ('status', 'is_platform_admin', 'email_verified_at')`,
    )
    expect(columns.rows.map((row) => row.columnName).sort()).toEqual(['email_verified_at', 'is_platform_admin', 'status'])
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

  it('seeds the admin as platform admin and default home owner', async () => {
    await seedDatabase({ closePool: false })

    const user = await pool.query<{ status: string; isPlatformAdmin: boolean; emailVerified: Date | null }>(
      'select status, is_platform_admin as "isPlatformAdmin", email_verified_at as "emailVerified" from users where id = $1',
      ['user-admin'],
    )
    expect(user.rows[0]).toMatchObject({ status: 'active', isPlatformAdmin: true })
    expect(user.rows[0].emailVerified).toBeInstanceOf(Date)

    const membership = await pool.query<{ id: string; role: string; status: string }>(
      'select id, role, status from home_memberships where user_id = $1 and home_id = $2',
      ['user-admin', 'home-1'],
    )
    expect(membership.rows[0]).toMatchObject({ role: 'owner', status: 'active' })

    const legacyMember = await pool.query<{ id: string; role: string }>('select id, role from members where id = $1', [membership.rows[0].id])
    expect(legacyMember.rows[0]).toMatchObject({ id: membership.rows[0].id, role: 'admin' })
  })
})
