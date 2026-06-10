import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool, migrate } from '../db.js'
import { createApp } from '../index.js'
import { seedDatabase } from '../seed.js'

describe('inventory api', () => {
  const app = createApp()
  let token = ''

  beforeAll(async () => {
    await migrate()
    await seedDatabase({ closePool: false })
  })

  afterAll(async () => {
    await pool.end()
  })

  it('returns health status', async () => {
    const response = await request(app).get('/api/health')
    expect(response.status).toBe(200)
    expect(response.body.ok).toBe(true)
  })

  it('rejects inventory requests without a session', async () => {
    const response = await request(app).get('/api/inventory')
    expect(response.status).toBe(401)
  })

  it('logs in with the seeded admin user', async () => {
    const response = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'admin12345' })
    expect(response.status).toBe(200)
    expect(response.body.token).toEqual(expect.any(String))
    token = response.body.token
  })

  it('returns inventory for authenticated users', async () => {
    const response = await request(app).get('/api/inventory').set('Authorization', `Bearer ${token}`)
    expect(response.status).toBe(200)
    expect(response.body.home.name).toBe('周家')
    expect(response.body.items.length).toBeGreaterThan(0)
  })

  it('returns admin summary for authenticated users', async () => {
    const response = await request(app).get('/api/admin/summary').set('Authorization', `Bearer ${token}`)
    expect(response.status).toBe(200)
    expect(response.body.activeItems).toBeGreaterThan(0)
  })

  it('creates, moves, and archives an item', async () => {
    const createResponse = await request(app)
      .post('/api/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '测试物品', locationId: 'loc-shoe', category: '测试', note: '自动测试创建' })

    expect(createResponse.status).toBe(201)
    const createdItem = createResponse.body.items.find((item: { name: string }) => item.name === '测试物品')
    expect(createdItem).toBeTruthy()

    const moveResponse = await request(app)
      .post(`/api/items/${createdItem.id}/move`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toLocationId: 'loc-tv', note: '自动测试移动' })

    expect(moveResponse.status).toBe(200)
    expect(moveResponse.body.items.find((item: { id: string }) => item.id === createdItem.id).locationId).toBe('loc-tv')

    const archiveResponse = await request(app).post(`/api/items/${createdItem.id}/archive`).set('Authorization', `Bearer ${token}`)
    expect(archiveResponse.status).toBe(200)
    expect(archiveResponse.body.items.find((item: { id: string }) => item.id === createdItem.id).status).toBe('archived')
  })
})
