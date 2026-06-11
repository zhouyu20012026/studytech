import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { createSession, setSessionCookie } from '../auth.js'
import { config } from '../config.js'
import { pool, query } from '../db.js'
import { ApiError } from '../errors.js'
import { createMembership } from '../memberships.js'
import { redeemInvitation } from './homeRoutes.js'
import { writeAuditLog } from '../security/auditRepository.js'
import { sendRegistrationEmail } from '../security/emailService.js'
import { hashSecurityToken, makeEmailCode } from '../security/tokenService.js'

export const registrationRoutes = Router()

const passwordSchema = z.string().min(12)
const registerStartSchema = z
  .object({
    email: z.string().email(),
    password: passwordSchema,
    displayName: z.string().min(1).max(80),
    homeName: z.string().min(1).max(120).optional(),
    inviteCode: z.string().min(1).optional(),
  })
  .refine((input) => Boolean(input.homeName) !== Boolean(input.inviteCode), {
    message: 'Provide exactly one of homeName or inviteCode',
  })

const registerVerifySchema = z.object({
  email: z.string().email(),
  code: z.string().min(6),
})

type RegisterPayload = {
  email: string
  passwordHash: string
  displayName: string
  homeName?: string
  inviteCode?: string
}

function ipOf(request: { ip?: string }) {
  return request.ip ?? 'unknown'
}

async function seedStarterLocations(client: { query: typeof pool.query }, homeId: string) {
  const areas = [
    { id: `area-${randomUUID()}`, name: '玄关', sortOrder: 1, locations: ['鞋柜', '钥匙托盘'] },
    { id: `area-${randomUUID()}`, name: '客厅', sortOrder: 2, locations: ['电视柜', '储物柜'] },
    { id: `area-${randomUUID()}`, name: '卧室', sortOrder: 3, locations: ['床头柜', '衣柜'] },
  ]

  for (const area of areas) {
    await client.query('insert into areas (id, home_id, name, sort_order) values ($1, $2, $3, $4)', [area.id, homeId, area.name, area.sortOrder])
    for (const locationName of area.locations) {
      await client.query('insert into locations (id, home_id, area_id, name, is_common) values ($1, $2, $3, $4, true)', [
        `loc-${randomUUID()}`,
        homeId,
        area.id,
        locationName,
      ])
    }
  }
}

async function lookupInvitationHomeId(client: { query: typeof pool.query }, inviteCode: string) {
  const result = await client.query<{ homeId: string }>(
    `select home_id as "homeId"
       from home_invitations
      where code_hash = $1
        and disabled_at is null
        and expires_at > now()
        and used_count < max_uses`,
    [hashSecurityToken(inviteCode)],
  )
  const invitation = result.rows[0]
  if (!invitation) {
    throw new ApiError('invalid_invitation', 'Invalid or expired invitation', 400)
  }
  return invitation.homeId
}

registrationRoutes.post('/register/start', async (request, response, next) => {
  try {
    const input = registerStartSchema.parse(request.body)
    const existing = await query<{ id: string }>('select id from users where email = $1', [input.email])
    if (existing.rows[0]) {
      throw new ApiError('email_already_registered', 'Email already registered', 409)
    }

    const code = makeEmailCode()
    const payload: RegisterPayload = {
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, 12),
      displayName: input.displayName,
      homeName: input.homeName,
      inviteCode: input.inviteCode,
    }

    await query('update email_verification_tokens set used_at = now() where email = $1 and purpose = $2 and used_at is null', [input.email, 'register'])
    await query(
      `insert into email_verification_tokens (id, email, token_hash, purpose, payload, expires_at, used_at, created_at, request_ip, request_user_agent)
       values ($1, $2, $3, 'register', $4, now() + ($5 || ' minutes')::interval, null, now(), $6, $7)`,
      [`email-${randomUUID()}`, input.email, hashSecurityToken(code), JSON.stringify(payload), config.RESET_TOKEN_MINUTES, ipOf(request), request.get('user-agent') ?? null],
    )
    await sendRegistrationEmail(input.email, code)
    await writeAuditLog({ email: input.email, eventType: 'registration_started', outcome: 'ok', ip: ipOf(request), userAgent: request.get('user-agent') ?? null })

    response.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

registrationRoutes.post('/register/verify', async (request, response, next) => {
  const client = await pool.connect()
  try {
    const input = registerVerifySchema.parse(request.body)
    const codeHash = input.code.length === 64 ? input.code : hashSecurityToken(input.code)
    await client.query('begin')

    const tokenResult = await client.query<{ id: string; payload: RegisterPayload }>(
      `select id, payload
         from email_verification_tokens
        where email = $1 and token_hash = $2 and purpose = 'register'
          and used_at is null and expires_at > now()
        order by created_at desc
        limit 1`,
      [input.email, codeHash],
    )
    const token = tokenResult.rows[0]
    if (!token) {
      throw new ApiError('invalid_registration_code', 'Invalid or expired registration code', 400)
    }
    if (!token.payload.homeName && !token.payload.inviteCode) {
      throw new ApiError('invalid_registration_payload', 'Home name is required', 400)
    }

    const existing = await client.query<{ id: string }>('select id from users where email = $1', [input.email])
    if (existing.rows[0]) {
      throw new ApiError('email_already_registered', 'Email already registered', 409)
    }

    const userId = `user-${randomUUID()}`
    const homeId = token.payload.homeName ? `home-${randomUUID()}` : await lookupInvitationHomeId(client, token.payload.inviteCode!)
    if (token.payload.homeName) {
      await client.query('insert into homes (id, name, status, created_at) values ($1, $2, $3, now())', [
        homeId,
        token.payload.homeName,
        'active',
      ])
    }
    await client.query(
      `insert into users (id, email, password_hash, home_id, created_at, status, is_platform_admin, email_verified_at)
       values ($1, $2, $3, $4, now(), 'active', false, now())`,
      [userId, input.email, token.payload.passwordHash, homeId],
    )
    const membership = token.payload.inviteCode
      ? await redeemInvitation(client, { inviteCode: token.payload.inviteCode, userId, displayName: token.payload.displayName })
      : await (async () => {
          await client.query('update homes set created_by_user_id = $1 where id = $2', [userId, homeId])
          const ownerMembership = await createMembership(client, {
            homeId,
            userId,
            displayName: token.payload.displayName,
            role: 'owner',
          })
          await seedStarterLocations(client, homeId)
          return ownerMembership
        })()
    const activeHome = await client.query<{ id: string; name: string }>('select id, name from homes where id = $1', [membership.homeId])
    await client.query('update email_verification_tokens set used_at = now() where id = $1', [token.id])
    await client.query('commit')

    await writeAuditLog({ userId, email: input.email, eventType: 'registration_verified', outcome: 'ok', ip: ipOf(request), userAgent: request.get('user-agent') ?? null })
    const tokenValue = await createSession(userId, membership.homeId)
    setSessionCookie(response, tokenValue)
    response.json({
      token: tokenValue,
      user: { id: userId, email: input.email, homeId: membership.homeId, isPlatformAdmin: false },
      activeHome: activeHome.rows[0],
      membership: { id: membership.id, homeId: membership.homeId, displayName: membership.displayName, role: membership.role },
    })
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    next(error)
  } finally {
    client.release()
  }
})
