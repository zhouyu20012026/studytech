import { Router } from 'express'
import { z } from 'zod'
import { createSession, requireAuth, revokeSession, verifyPassword } from '../auth.js'
import { query } from '../db.js'
import { unauthorized } from '../errors.js'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const authRoutes = Router()

authRoutes.post('/login', async (request, response, next) => {
  try {
    const input = loginSchema.parse(request.body)
    const result = await query<{ id: string; email: string; passwordHash: string; homeId: string }>(
      'select id, email, password_hash as "passwordHash", home_id as "homeId" from users where email = $1',
      [input.email],
    )
    const user = result.rows[0]

    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw unauthorized('Invalid email or password')
    }

    const token = await createSession(user.id)
    response.json({ token, user: { id: user.id, email: user.email, homeId: user.homeId } })
  } catch (error) {
    next(error)
  }
})

authRoutes.post('/logout', requireAuth, async (request, response, next) => {
  try {
    const header = request.header('authorization')
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
    await revokeSession(token)
    response.status(204).send()
  } catch (error) {
    next(error)
  }
})
