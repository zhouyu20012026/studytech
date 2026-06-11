import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requireAuth } from '../auth.js'
import { pool, query } from '../db.js'
import { ApiError, notFound } from '../errors.js'
import { assertAdminMembership, createMembership } from '../memberships.js'
import { hashSecurityToken, makeInvitationCode } from '../security/tokenService.js'

export const homeRoutes = Router()

homeRoutes.use(requireAuth)

const invitationSchema = z.object({
  role: z.enum(['admin', 'member']).default('member'),
  expiresInDays: z.number().int().min(1).max(30).default(7),
  maxUses: z.number().int().min(1).max(100).default(1),
})

async function loadCurrentMembership(homeId: string, membershipId: string) {
  const result = await query<{ id: string; role: 'owner' | 'admin' | 'member'; homeId: string; status: 'active' | 'disabled' }>(
    `select id, role, home_id as "homeId", status
       from home_memberships
      where id = $1 and home_id = $2 and status = 'active'`,
    [membershipId, homeId],
  )
  return result.rows[0] ?? null
}

export async function redeemInvitation(
  client: { query: typeof pool.query },
  input: { inviteCode: string; userId: string; displayName: string },
) {
  const codeHash = hashSecurityToken(input.inviteCode)
  const invitationResult = await client.query<{
    id: string
    homeId: string
    role: 'admin' | 'member'
    maxUses: number
    usedCount: number
  }>(
    `select id, home_id as "homeId", role, max_uses as "maxUses", used_count as "usedCount"
       from home_invitations
      where code_hash = $1
        and disabled_at is null
        and expires_at > now()
        and used_count < max_uses
      for update`,
    [codeHash],
  )
  const invitation = invitationResult.rows[0]
  if (!invitation) {
    throw new ApiError('invalid_invitation', 'Invalid or expired invitation', 400)
  }

  const membership = await createMembership(client, {
    homeId: invitation.homeId,
    userId: input.userId,
    displayName: input.displayName,
    role: invitation.role,
  })
  await client.query('update home_invitations set used_count = used_count + 1 where id = $1', [invitation.id])
  return membership
}

homeRoutes.get('/me', async (request, response, next) => {
  try {
    const memberships = await query(
      `select home_memberships.id, home_memberships.home_id as "homeId", homes.name as "homeName",
              home_memberships.display_name as "displayName", home_memberships.role, home_memberships.status
         from home_memberships
         join homes on homes.id = home_memberships.home_id
        where home_memberships.user_id = $1
        order by home_memberships.created_at asc`,
      [request.user!.id],
    )
    response.json({
      user: request.user,
      activeHome: { id: request.user!.homeId },
      membership: { id: request.user!.membershipId, role: request.user!.membershipRole },
      memberships: memberships.rows,
    })
  } catch (error) {
    next(error)
  }
})

homeRoutes.get('/homes/:homeId/members', async (request, response, next) => {
  try {
    const current = await loadCurrentMembership(request.params.homeId, request.user!.membershipId)
    if (!current) {
      throw notFound('Home not found')
    }
    assertAdminMembership(current)

    const result = await query(
      `select home_memberships.id, home_memberships.display_name as "displayName", users.email,
              home_memberships.role, home_memberships.status, home_memberships.created_at as "createdAt"
         from home_memberships
         join users on users.id = home_memberships.user_id
        where home_memberships.home_id = $1
        order by home_memberships.created_at asc`,
      [request.params.homeId],
    )
    response.json(result.rows)
  } catch (error) {
    next(error)
  }
})

homeRoutes.post('/homes/:homeId/invitations', async (request, response, next) => {
  try {
    const current = await loadCurrentMembership(request.params.homeId, request.user!.membershipId)
    if (!current) {
      throw notFound('Home not found')
    }
    assertAdminMembership(current)

    const input = invitationSchema.parse(request.body)
    const code = makeInvitationCode()
    const result = await query<{
      id: string
      homeId: string
      role: string
      expiresAt: string
      maxUses: number
      usedCount: number
    }>(
      `insert into home_invitations (id, home_id, code_hash, role, created_by_membership_id, expires_at, max_uses, used_count, disabled_at, created_at)
       values ($1, $2, $3, $4, $5, now() + ($6 || ' days')::interval, $7, 0, null, now())
       returning id, home_id as "homeId", role, expires_at as "expiresAt", max_uses as "maxUses", used_count as "usedCount"`,
      [`invite-${randomUUID()}`, request.params.homeId, hashSecurityToken(code), input.role, request.user!.membershipId, input.expiresInDays, input.maxUses],
    )

    response.status(201).json({ code, invitation: result.rows[0] })
  } catch (error) {
    next(error)
  }
})

homeRoutes.post('/homes/join', async (request, response, next) => {
  const client = await pool.connect()
  try {
    const input = z.object({ inviteCode: z.string().min(1), displayName: z.string().min(1).optional() }).parse(request.body)
    await client.query('begin')
    const membership = await redeemInvitation(client, {
      inviteCode: input.inviteCode,
      userId: request.user!.id,
      displayName: input.displayName ?? request.user!.email,
    })
    await client.query('commit')
    response.status(201).json({ membership })
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    next(error)
  } finally {
    client.release()
  }
})
