import { randomUUID } from 'node:crypto'
import { config } from '../config.js'
import { query } from '../db.js'

export async function shouldRequireCaptcha(email: string, ip: string) {
  const attempts = await query<{ count: string }>(
    `select count(*)::text as count from login_attempts
     where email = $1 and ip = $2 and success = false and created_at > now() - ($3 || ' minutes')::interval`,
    [email, ip, config.LOGIN_LOCK_MINUTES],
  )
  return Number(attempts.rows[0]?.count ?? '0') >= config.LOGIN_FAILURE_THRESHOLD
}

export async function recordLoginAttempt(input: { email: string; ip: string; success: boolean; captchaRequired?: boolean }) {
  await query(
    `insert into login_attempts (id, email, ip, success, captcha_required, created_at)
     values ($1, $2, $3, $4, $5, now())`,
    [`attempt-${randomUUID()}`, input.email, input.ip, input.success, input.captchaRequired ?? false],
  )
}
