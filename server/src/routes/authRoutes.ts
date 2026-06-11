import { Router } from 'express'
import { z } from 'zod'
import { ApiError, unauthorized } from '../errors.js'
import { clearSessionCookie, createSession, getRequestToken, requireAuth, revokeSession, setSessionCookie, verifyPassword } from '../auth.js'
import { pool, query } from '../db.js'
import { getActiveMembershipForUser } from '../memberships.js'
import { writeAuditLog } from '../security/auditRepository.js'
import { recordLoginAttempt, shouldRequireCaptcha } from '../security/rateLimitRepository.js'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  captcha: z.string().optional(),
})

export const authRoutes = Router()

function getIp(request: { ip?: string }) {
  return request.ip ?? 'unknown'
}

authRoutes.post('/login', async (request, response, next) => {
  try {
    const input = loginSchema.parse(request.body)
    const ip = getIp(request)
    const userAgent = request.get('user-agent') ?? null
    const captchaRequired = await shouldRequireCaptcha(input.email, ip)

    if (captchaRequired && input.captcha !== '1234') {
      await recordLoginAttempt({ email: input.email, ip, success: false, captchaRequired: true })
      await writeAuditLog({ email: input.email, eventType: 'login_failure', outcome: 'failed', ip, userAgent, detail: { reason: 'captcha_required' } })
      throw new ApiError('captcha_required', 'Captcha required', 403)
    }

    const result = await query<{ id: string; email: string; passwordHash: string; isPlatformAdmin: boolean }>(
      'select id, email, password_hash as "passwordHash", is_platform_admin as "isPlatformAdmin" from users where email = $1 and status = $2',
      [input.email, 'active'],
    )
    const user = result.rows[0]
    const membership = user ? await getActiveMembershipForUser(pool, user.id) : null

    if (!user || !membership || !(await verifyPassword(input.password, user.passwordHash))) {
      await recordLoginAttempt({ email: input.email, ip, success: false, captchaRequired })
      await writeAuditLog({ email: input.email, eventType: 'login_failure', outcome: 'failed', ip, userAgent })
      throw unauthorized('Invalid email or password')
    }

    await recordLoginAttempt({ email: input.email, ip, success: true, captchaRequired })
    await writeAuditLog({ userId: user.id, email: user.email, eventType: 'login_success', outcome: 'ok', ip, userAgent })

    const token = await createSession(user.id, membership.homeId)
    setSessionCookie(response, token)
    response.json({
      token,
      user: { id: user.id, email: user.email, homeId: membership.homeId, isPlatformAdmin: user.isPlatformAdmin },
      activeHome: { id: membership.homeId, name: membership.homeName },
      membership: { id: membership.id, homeId: membership.homeId, displayName: membership.displayName, role: membership.role },
      captchaRequired: false,
    })
  } catch (error) {
    next(error)
  }
})

authRoutes.post('/logout', requireAuth, async (request, response, next) => {
  try {
    await revokeSession(getRequestToken(request))
    await writeAuditLog({ userId: request.user?.id, email: request.user?.email, eventType: 'logout', outcome: 'ok', ip: getIp(request), userAgent: request.get('user-agent') ?? null })
    clearSessionCookie(response)
    response.status(204).send()
  } catch (error) {
    next(error)
  }
})
