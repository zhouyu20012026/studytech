import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { NextFunction, Request, Response } from 'express'
import { config } from './config.js'
import { hashToken, query } from './db.js'
import { unauthorized } from './errors.js'

export const adminSessionCookie = 'home_inventory_session'

export interface AuthUser {
  id: string
  email: string
  homeId: string
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash)
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12)
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex')
  const tokenHash = hashToken(`${token}:${config.SESSION_SECRET}`)
  await query(
    `insert into sessions (token_hash, user_id, expires_at, created_at)
     values ($1, $2, now() + interval '30 days', now())`,
    [tokenHash, userId],
  )
  return token
}

export async function revokeSession(token: string) {
  if (!token) {
    return
  }

  const tokenHash = hashToken(`${token}:${config.SESSION_SECRET}`)
  await query('delete from sessions where token_hash = $1', [tokenHash])
}

export async function revokeAllSessions(userId: string) {
  await query('delete from sessions where user_id = $1', [userId])
}

export function getRequestToken(request: Request) {
  const header = request.header('authorization')
  const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  return bearer || request.cookies?.[adminSessionCookie] || ''
}

export function setSessionCookie(response: Response, token: string) {
  response.cookie(adminSessionCookie, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  })
}

export function clearSessionCookie(response: Response) {
  response.clearCookie(adminSessionCookie, { path: '/', sameSite: 'lax', secure: false })
}

export async function requireAuth(request: Request, _response: Response, next: NextFunction) {
  try {
    const token = getRequestToken(request)

    if (!token) {
      next(unauthorized())
      return
    }

    const tokenHash = hashToken(`${token}:${config.SESSION_SECRET}`)
    const result = await query<AuthUser>(
      `select users.id, users.email, users.home_id as "homeId"
       from sessions
       join users on users.id = sessions.user_id
       where sessions.token_hash = $1 and sessions.expires_at > now()`,
      [tokenHash],
    )

    const user = result.rows[0]
    if (!user) {
      next(unauthorized('Invalid or expired session'))
      return
    }

    request.user = user
    next()
  } catch (error) {
    next(error)
  }
}
