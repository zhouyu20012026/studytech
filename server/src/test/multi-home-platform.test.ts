import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate, pool } from '../db.js'
import { createApp } from '../index.js'
import { seedDatabase } from '../seed.js'

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
})
