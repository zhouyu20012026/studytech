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
    await pool.query('delete from sessions')
    await pool.query('delete from email_verification_tokens where email like $1', ['%@example.com'])
    await pool.query("delete from homes where name in ('张三家', '王五家', '隔离家庭')")
    await pool.query("delete from users where email in ('new-family@example.com', 'verified-family@example.com', 'invited@example.com', 'isolated@example.com')")
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

  it('allows an owner to create an invitation code', async () => {
    const loginResponse = await login()

    const response = await request(app)
      .post('/api/homes/home-1/invitations')
      .set('Authorization', `Bearer ${loginResponse.body.token}`)
      .send({ role: 'member', expiresInDays: 7, maxUses: 2 })

    expect(response.status).toBe(201)
    expect(response.body.code).toEqual(expect.any(String))
    expect(response.body.invitation).toMatchObject({ homeId: 'home-1', role: 'member', maxUses: 2, usedCount: 0 })

    const stored = await pool.query<{ code_hash: string }>('select code_hash from home_invitations where id = $1', [response.body.invitation.id])
    expect(stored.rows[0].code_hash).not.toBe(response.body.code)
  })

  it('registers a new user into an invited household', async () => {
    const ownerLogin = await login()
    const invite = await request(app)
      .post('/api/homes/home-1/invitations')
      .set('Authorization', `Bearer ${ownerLogin.body.token}`)
      .send({ role: 'member', expiresInDays: 7, maxUses: 1 })

    await request(app).post('/api/auth/register/start').send({
      email: 'invited@example.com',
      password: 'new-password-123',
      displayName: '被邀请人',
      inviteCode: invite.body.code,
    })
    const token = await pool.query<{ token_hash: string }>('select token_hash from email_verification_tokens where email = $1 order by created_at desc limit 1', ['invited@example.com'])

    const response = await request(app).post('/api/auth/register/verify').send({
      email: 'invited@example.com',
      code: token.rows[0].token_hash,
    })

    expect(response.status).toBe(200)
    expect(response.body.activeHome).toMatchObject({ id: 'home-1', name: '周家' })
    expect(response.body.membership).toMatchObject({ displayName: '被邀请人', role: 'member' })

    const invitation = await pool.query<{ used_count: number }>('select used_count from home_invitations where id = $1', [invite.body.invitation.id])
    expect(invitation.rows[0].used_count).toBe(1)
  })

  it('prevents members from creating invitations', async () => {
    const memberLogin = await request(app).post('/api/auth/login').send({ email: 'invited@example.com', password: 'new-password-123' })
    expect(memberLogin.status).toBe(200)

    const response = await request(app)
      .post('/api/homes/home-1/invitations')
      .set('Authorization', `Bearer ${memberLogin.body.token}`)
      .send({ role: 'member', expiresInDays: 7, maxUses: 1 })

    expect(response.status).toBe(403)
  })

  it('keeps households isolated through session membership', async () => {
    await request(app).post('/api/auth/register/start').send({
      email: 'isolated@example.com',
      password: 'new-password-123',
      displayName: '隔离用户',
      homeName: '隔离家庭',
    })
    const token = await pool.query<{ token_hash: string }>('select token_hash from email_verification_tokens where email = $1 order by created_at desc limit 1', ['isolated@example.com'])
    const isolatedLogin = await request(app).post('/api/auth/register/verify').send({ email: 'isolated@example.com', code: token.rows[0].token_hash })

    const inventory = await request(app).get('/api/inventory').set('Authorization', `Bearer ${isolatedLogin.body.token}`)

    expect(inventory.status).toBe(200)
    expect(inventory.body.home.name).toBe('隔离家庭')
    expect(inventory.body.items.some((item: { id: string }) => item.id === 'item-passport')).toBe(false)
  })

  it('returns platform summary for platform admins only', async () => {
    const adminLogin = await login()
    const adminResponse = await request(app).get('/api/platform/summary').set('Authorization', `Bearer ${adminLogin.body.token}`)

    expect(adminResponse.status).toBe(200)
    expect(adminResponse.body).toMatchObject({
      users: expect.any(Number),
      homes: expect.any(Number),
      memberships: expect.any(Number),
      items: expect.any(Number),
      recentAuditEvents: expect.any(Number),
    })

    const memberLogin = await request(app).post('/api/auth/login').send({ email: 'invited@example.com', password: 'new-password-123' })
    const memberResponse = await request(app).get('/api/platform/summary').set('Authorization', `Bearer ${memberLogin.body.token}`)
    expect(memberResponse.status).toBe(403)
  })
})
