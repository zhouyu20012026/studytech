import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { ApiError, unauthorized } from './errors.js'

export type MembershipRole = 'owner' | 'admin' | 'member'
export type MembershipStatus = 'active' | 'disabled'

export interface Membership {
  id: string
  homeId: string
  userId: string
  displayName: string
  role: MembershipRole
  status: MembershipStatus
  homeName?: string
}

export interface PlatformUser {
  id: string
  email: string
  isPlatformAdmin: boolean
}

type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>

function legacyRole(role: MembershipRole) {
  return role === 'member' ? 'member' : 'admin'
}

export async function mirrorMembershipToLegacyMember(client: Queryable, membership: Membership) {
  await client.query(
    `insert into members (id, home_id, name, role)
     values ($1, $2, $3, $4)
     on conflict (id) do update set home_id = excluded.home_id, name = excluded.name, role = excluded.role`,
    [membership.id, membership.homeId, membership.displayName, legacyRole(membership.role)],
  )
}

export async function createMembership(
  client: Queryable,
  input: { homeId: string; userId: string; displayName: string; role: MembershipRole; id?: string },
) {
  const id = input.id ?? `membership-${randomUUID()}`
  const result = await client.query<Membership>(
    `insert into home_memberships (id, home_id, user_id, display_name, role, status, created_at)
     values ($1, $2, $3, $4, $5, 'active', now())
     on conflict (home_id, user_id) do update set display_name = excluded.display_name, role = excluded.role, status = 'active'
     returning id, home_id as "homeId", user_id as "userId", display_name as "displayName", role, status`,
    [id, input.homeId, input.userId, input.displayName, input.role],
  )
  const membership = result.rows[0]
  await mirrorMembershipToLegacyMember(client, membership)
  return membership
}

export async function getActiveMembershipForUser(client: Queryable, userId: string, activeHomeId?: string | null) {
  const result = await client.query<Membership>(
    `select home_memberships.id, home_memberships.home_id as "homeId", home_memberships.user_id as "userId",
            home_memberships.display_name as "displayName", home_memberships.role, home_memberships.status,
            homes.name as "homeName"
       from home_memberships
       join homes on homes.id = home_memberships.home_id
      where home_memberships.user_id = $1
        and home_memberships.status = 'active'
        and homes.status = 'active'
        and ($2::text is null or home_memberships.home_id = $2)
      order by home_memberships.created_at asc
      limit 1`,
    [userId, activeHomeId ?? null],
  )
  return result.rows[0] ?? null
}

export function assertAdminMembership(membership: Pick<Membership, 'role'>) {
  if (membership.role !== 'owner' && membership.role !== 'admin') {
    throw new ApiError('forbidden', 'Admin membership required', 403)
  }
}

export function assertPlatformAdmin(user: PlatformUser) {
  if (!user.isPlatformAdmin) {
    throw new ApiError('forbidden', 'Platform admin required', 403)
  }
}

export function requireMembership(membership: Membership | null) {
  if (!membership) {
    throw unauthorized('Active membership required')
  }
  return membership
}
