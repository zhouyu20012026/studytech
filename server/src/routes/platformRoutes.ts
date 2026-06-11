import { Router } from 'express'
import { requireAuth } from '../auth.js'
import { query } from '../db.js'
import { assertPlatformAdmin } from '../memberships.js'

export const platformRoutes = Router()

platformRoutes.use(requireAuth)

platformRoutes.get('/summary', async (request, response, next) => {
  try {
    assertPlatformAdmin({ id: request.user!.id, email: request.user!.email, isPlatformAdmin: request.user!.isPlatformAdmin })

    const [users, homes, memberships, items, recentAuditEvents] = await Promise.all([
      query<{ count: string }>('select count(*)::text as count from users'),
      query<{ count: string }>('select count(*)::text as count from homes'),
      query<{ count: string }>('select count(*)::text as count from home_memberships'),
      query<{ count: string }>('select count(*)::text as count from items'),
      query<{ count: string }>("select count(*)::text as count from admin_audit_logs where created_at > now() - interval '7 days'"),
    ])

    response.json({
      users: Number(users.rows[0].count),
      homes: Number(homes.rows[0].count),
      memberships: Number(memberships.rows[0].count),
      items: Number(items.rows[0].count),
      recentAuditEvents: Number(recentAuditEvents.rows[0].count),
    })
  } catch (error) {
    next(error)
  }
})
