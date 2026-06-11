import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { NextFunction, Request, Response } from 'express'
import { config } from './config.js'
import { hashToken, pool, query } from './db.js'
import { getActiveMembershipForUser } from './memberships.js'
import { unauthorized } from './errors.js'

export const adminSessionCookie = 'home_inventory_session'

export interface AuthUser {
  id: string
  email: string
  homeId: string
  membershipId: string
  membershipRole: 'owner' | 'admin' | 'member'
  isPlatformAdmin: boolean
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

export async function createSession(userId: string, activeHomeId?: string) {
  const token = randomBytes(32).toString('hex')
  const tokenHash = hashToken(`${token}:${config.SESSION_SECRET}`)
  await query(
    `insert into sessions (token_hash, user_id, expires_at, created_at, active_home_id)
     values ($1, $2, now() + interval '30 days', now(), $3)`,
    [tokenHash, userId, activeHomeId ?? null],
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
    const result = await query<{ id: string; email: string; isPlatformAdmin: boolean; activeHomeId: string | null }>(
      `select users.id, users.email, users.is_platform_admin as "isPlatformAdmin", sessions.active_home_id as "activeHomeId"
       from sessions
       join users on users.id = sessions.user_id
       where sessions.token_hash = $1 and sessions.expires_at > now() and users.status = 'active'`,
      [tokenHash],
    )

    const user = result.rows[0]
    if (!user) {
      next(unauthorized('Invalid or expired session'))
      return
    }

    const membership = await getActiveMembershipForUser(pool, user.id, user.activeHomeId)
    if (!membership) {
      next(unauthorized('Active membership required'))
      return
    }

    request.user = {
      id: user.id,
      email: user.email,
      homeId: membership.homeId,
      membershipId: membership.id,
      membershipRole: membership.role,
      isPlatformAdmin: user.isPlatformAdmin,
    }
    next()
  } catch (error) {
    next(error)
  }
}
