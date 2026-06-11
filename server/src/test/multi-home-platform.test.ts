import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { migrate, pool } from '../db.js'
import { createApp } from '../index.js'
import { seedDatabase } from '../seed.js'

vi.mock('../security/emailService.js', () => ({
  sendRegistrationEmail: vi.fn(),
  sendResetEmail: vi.fn(),
}))

describe('multi-home platform auth context', () => {
  const app = createApp()

  beforeAll(async () => {
    await migrate()
    await seedDatabase({ closePool: false })
  })

  afterAll(async () => {
    await pool.end()
  })

  async function login() {
    const response = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'admin12345' })
    expect(response.status).toBe(200)
    return response
  }

  it('returns active home and membership when logging in', async () => {
    const response = await login()

    expect(response.body.activeHome).toMatchObject({ id: 'home-1', name: '周家' })
    expect(response.body.membership).toMatchObject({ id: 'membership-admin', homeId: 'home-1', role: 'owner' })
    expect(response.body.user).toMatchObject({ id: 'user-admin', email: 'admin@example.com', homeId: 'home-1' })
  })

  it('records the active membership as the actor for item creation', async () => {
    const loginResponse = await login()

    const createResponse = await request(app)
      .post('/api/items')
      .set('Authorization', `Bearer ${loginResponse.body.token}`)
      .send({ name: '会员上下文物品', locationId: 'loc-shoe' })

    expect(createResponse.status).toBe(201)
    const createdItem = createResponse.body.items.find((item: { name: string }) => item.name === '会员上下文物品')
    expect(createdItem).toMatchObject({ createdBy: 'membership-admin', updatedBy: 'membership-admin' })
  })

  it('rejects inventory access when the active membership is disabled', async () => {
    const loginResponse = await login()
    await pool.query('update home_memberships set status = $1 where id = $2', ['disabled', 'membership-admin'])

    const response = await request(app).get('/api/inventory').set('Authorization', `Bearer ${loginResponse.body.token}`)

    expect([401, 403]).toContain(response.status)

    await pool.query('update home_memberships set status = $1 where id = $2', ['active', 'membership-admin'])
  })

  it('starts registration by storing a pending email verification token', async () => {
    await pool.query('delete from email_verification_tokens where email = $1', ['new-family@example.com'])

    const response = await request(app).post('/api/auth/register/start').send({
      email: 'new-family@example.com',
      password: 'new-password-123',
      displayName: '张三',
      homeName: '张三家',
    })

    expect(response.status).toBe(200)
    expect(response.body.ok).toBe(true)

    const token = await pool.query<{ email: string; payload: { displayName: string; homeName: string } }>(
      'select email, payload from email_verification_tokens where email = $1 order by created_at desc limit 1',
      ['new-family@example.com'],
    )
    expect(token.rows[0].email).toBe('new-family@example.com')
    expect(token.rows[0].payload).toMatchObject({ displayName: '张三', homeName: '张三家' })
  })

  it('rejects registration start with both home name and invite code', async () => {
    const response = await request(app).post('/api/auth/register/start').send({
      email: 'ambiguous@example.com',
      password: 'new-password-123',
      displayName: '李四',
      homeName: '李四家',
      inviteCode: 'abc',
    })

    expect(response.status).toBe(400)
  })

  it('verifies registration and creates a user-owned household', async () => {
    await request(app).post('/api/auth/register/start').send({
      email: 'verified-family@example.com',
      password: 'new-password-123',
      displayName: '王五',
      homeName: '王五家',
    })
    const token = await pool.query<{ token_hash: string }>('select token_hash from email_verification_tokens where email = $1 order by created_at desc limit 1', [
      'verified-family@example.com',
    ])

    const response = await request(app).post('/api/auth/register/verify').send({
      email: 'verified-family@example.com',
      code: token.rows[0].token_hash,
    })

    expect(response.status).toBe(200)
    expect(response.body.token).toEqual(expect.any(String))
    expect(response.body.activeHome).toMatchObject({ name: '王五家' })
    expect(response.body.membership).toMatchObject({ displayName: '王五', role: 'owner' })

    const inventory = await request(app).get('/api/inventory').set('Authorization', `Bearer ${response.body.token}`)
    expect(inventory.status).toBe(200)
    expect(inventory.body.home.name).toBe('王五家')
    expect(inventory.body.items).toEqual([])
    expect(inventory.body.areas.length).toBeGreaterThan(0)
    expect(inventory.body.locations.length).toBeGreaterThan(0)
  })
})
