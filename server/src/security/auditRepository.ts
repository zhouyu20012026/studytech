import { randomUUID } from 'node:crypto'
import { query } from '../db.js'

export type AuditEventType =
  | 'login_success'
  | 'login_failure'
  | 'password_reset_requested'
  | 'password_reset_success'
  | 'password_change_success'
  | 'logout'
  | 'logout_all'

export async function writeAuditLog(input: {
  userId?: string | null
  email?: string | null
  eventType: AuditEventType
  outcome: 'ok' | 'failed'
  ip?: string | null
  userAgent?: string | null
  detail?: unknown
}) {
  await query(
    `insert into admin_audit_logs (id, user_id, email, event_type, outcome, ip, user_agent, detail, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
    [
      `audit-${randomUUID()}`,
      input.userId ?? null,
      input.email ?? null,
      input.eventType,
      input.outcome,
      input.ip ?? null,
      input.userAgent ?? null,
      input.detail ? JSON.stringify(input.detail) : null,
    ],
  )
}

export async function getRecentAuditLogs(limit = 30) {
  const result = await query<{
    id: string
    email: string | null
    eventType: string
    outcome: string
    ip: string | null
    userAgent: string | null
    createdAt: string
  }>(
    `select id, email, event_type as "eventType", outcome, ip, user_agent as "userAgent", created_at as "createdAt"
     from admin_audit_logs
     order by created_at desc
     limit $1`,
    [limit],
  )
  return result.rows
}
