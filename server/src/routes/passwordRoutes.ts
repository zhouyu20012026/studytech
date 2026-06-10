import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { adminSessionCookie, clearSessionCookie, getRequestToken, hashPassword, requireAuth, revokeAllSessions, revokeSession, verifyPassword } from '../auth.js'
import { config } from '../config.js'
import { query } from '../db.js'
import { ApiError, unauthorized } from '../errors.js'
import { writeAuditLog } from '../security/auditRepository.js'
import { sendResetEmail } from '../security/emailService.js'
import { hashSecurityToken, makeResetCode } from '../security/tokenService.js'

export const passwordRoutes = Router()

const passwordSchema = z.string().min(12)

function ipOf(request: { ip?: string }) {
  return request.ip ?? 'unknown'
}

passwordRoutes.post('/forgot-password', async (request, response, next) => {
  try {
    const input = z.object({ email: z.string().email() }).parse(request.body)
    const userResult = await query<{ id: string }>('select id from users where email = $1', [input.email])
    const user = userResult.rows[0]

    if (user) {
      const code = makeResetCode()
      const tokenHash = hashSecurityToken(code)
      await query('update password_reset_tokens set used_at = now() where user_id = $1 and used_at is null', [user.id])
      await query(
        `insert into password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at, request_ip, request_user_agent)
         values ($1, $2, $3, now() + ($4 || ' minutes')::interval, null, now(), $5, $6)`,
        [`reset-${randomUUID()}`, user.id, tokenHash, config.RESET_TOKEN_MINUTES, ipOf(request), request.get('user-agent') ?? null],
      )
      await sendResetEmail(input.email, code)
      await writeAuditLog({ userId: user.id, email: input.email, eventType: 'password_reset_requested', outcome: 'ok', ip: ipOf(request), userAgent: request.get('user-agent') ?? null })
    }

    response.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

passwordRoutes.post('/reset-password', async (request, response, next) => {
  try {
    const input = z.object({ email: z.string().email(), code: z.string().min(6), password: passwordSchema }).parse(request.body)
    const codeHash = input.code.length === 64 ? input.code : hashSecurityToken(input.code)
    const result = await query<{ userId: string; tokenId: string }>(
      `select users.id as "userId", password_reset_tokens.id as "tokenId"
       from password_reset_tokens
       join users on users.id = password_reset_tokens.user_id
       where users.email = $1 and password_reset_tokens.token_hash = $2
         and password_reset_tokens.used_at is null and password_reset_tokens.expires_at > now()
       order by password_reset_tokens.created_at desc
       limit 1`,
      [input.email, codeHash],
    )
    const token = result.rows[0]

    if (!token) {
      await writeAuditLog({ email: input.email, eventType: 'password_reset_success', outcome: 'failed', ip: ipOf(request), userAgent: request.get('user-agent') ?? null })
      throw new ApiError('invalid_reset_code', 'Invalid or expired reset code', 400)
    }

    await query('update users set password_hash = $1 where id = $2', [await hashPassword(input.password), token.userId])
    await query('update password_reset_tokens set used_at = now() where id = $1', [token.tokenId])
    await revokeAllSessions(token.userId)
    await writeAuditLog({ userId: token.userId, email: input.email, eventType: 'password_reset_success', outcome: 'ok', ip: ipOf(request), userAgent: request.get('user-agent') ?? null })
    clearSessionCookie(response)
    response.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

passwordRoutes.post('/change-password', requireAuth, async (request, response, next) => {
  try {
    const input = z.object({ currentPassword: z.string().min(1), password: passwordSchema }).parse(request.body)
    const userResult = await query<{ passwordHash: string }>('select password_hash as "passwordHash" from users where id = $1', [request.user!.id])

    if (!userResult.rows[0] || !(await verifyPassword(input.currentPassword, userResult.rows[0].passwordHash))) {
      throw unauthorized('Invalid email or password')
    }

    await query('update users set password_hash = $1 where id = $2', [await hashPassword(input.password), request.user!.id])
    await revokeAllSessions(request.user!.id)
    await writeAuditLog({ userId: request.user!.id, email: request.user!.email, eventType: 'password_change_success', outcome: 'ok', ip: ipOf(request), userAgent: request.get('user-agent') ?? null })
    clearSessionCookie(response)
    response.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

passwordRoutes.post('/logout-all', requireAuth, async (request, response, next) => {
  try {
    await revokeAllSessions(request.user!.id)
    await writeAuditLog({ userId: request.user!.id, email: request.user!.email, eventType: 'logout_all', outcome: 'ok', ip: ipOf(request), userAgent: request.get('user-agent') ?? null })
    await revokeSession(getRequestToken(request))
    response.clearCookie(adminSessionCookie, { path: '/', sameSite: 'lax', secure: false })
    response.status(204).send()
  } catch (error) {
    next(error)
  }
})
