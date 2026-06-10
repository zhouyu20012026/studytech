import bcrypt from 'bcryptjs'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { migrate, pool } from '../db.js'
import { createApp } from '../index.js'
import { seedDatabase } from '../seed.js'

vi.mock('../security/emailService.js', () => ({
  sendResetEmail: vi.fn(),
}))

describe('password reset flow', () => {
  const app = createApp()

  beforeAll(async () => {
    await migrate()
    await seedDatabase({ closePool: false })
    await pool.query('delete from password_reset_tokens')
  })

  afterAll(async () => {
    await pool.query('update users set password_hash = $1 where email = $2', [await bcrypt.hash('admin12345', 12), 'admin@example.com'])
    await pool.query('delete from login_attempts')
    await pool.end()
  })

  it('accepts forgot-password and returns a generic success response', async () => {
    const response = await request(app).post('/api/auth/forgot-password').send({ email: 'admin@example.com' })
    expect(response.status).toBe(200)
    expect(response.body.ok).toBe(true)

    const tokens = await pool.query('select user_id, used_at from password_reset_tokens order by created_at desc limit 1')
    expect(tokens.rows[0].user_id).toBe('user-admin')
    expect(tokens.rows[0].used_at).toBeNull()
  })

  it('resets password with a valid code and revokes old sessions', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'admin12345' })
    expect(login.status).toBe(200)

    await request(app).post('/api/auth/forgot-password').send({ email: 'admin@example.com' })
    const tokenResult = await pool.query<{ token_hash: string }>('select token_hash from password_reset_tokens order by created_at desc limit 1')

    const reset = await request(app).post('/api/auth/reset-password').send({ email: 'admin@example.com', code: tokenResult.rows[0].token_hash, password: 'new-password-123' })
    expect(reset.status).toBe(200)
    expect(reset.body.ok).toBe(true)

    const oldSession = await request(app).get('/api/inventory').set('Authorization', `Bearer ${login.body.token}`)
    expect(oldSession.status).toBe(401)

    const user = await pool.query<{ password_hash: string }>('select password_hash from users where email = $1', ['admin@example.com'])
    expect(await bcrypt.compare('new-password-123', user.rows[0].password_hash)).toBe(true)
  })
})
