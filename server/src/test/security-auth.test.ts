import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate, pool } from '../db.js'
import { createApp } from '../index.js'
import { seedDatabase } from '../seed.js'

describe('admin auth hardening', () => {
  const app = createApp()

  beforeAll(async () => {
    await migrate()
    await seedDatabase({ closePool: false })
    await pool.query('delete from login_attempts')
    await pool.query('delete from admin_audit_logs')
  })

  afterAll(async () => {
    await pool.end()
  })

  it('rejects wrong passwords without leaking account details and writes an audit log', async () => {
    const response = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'wrong-password' })

    expect(response.status).toBe(401)
    expect(response.body.error.message).toBe('Invalid email or password')

    const audit = await pool.query('select event_type, outcome from admin_audit_logs order by created_at desc limit 1')
    expect(audit.rows[0]).toMatchObject({ event_type: 'login_failure', outcome: 'failed' })
  })

  it('requires captcha after repeated failed login attempts', async () => {
    for (let index = 0; index < 3; index += 1) {
      await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: `wrong-${index}` })
    }

    const response = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'admin12345' })

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('captcha_required')
  })

  it('sets an http only cookie when login succeeds', async () => {
    await pool.query('delete from login_attempts')

    const response = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'admin12345' })

    expect(response.status).toBe(200)
    const cookies = response.headers['set-cookie']
    const cookieHeader = Array.isArray(cookies) ? cookies.join(';') : String(cookies)
    expect(cookieHeader).toContain('HttpOnly')
  })
})
