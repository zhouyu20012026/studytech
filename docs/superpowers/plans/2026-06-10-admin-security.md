# Admin Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the public admin surface with email-based recovery, login throttling, CAPTCHA gating, auditable sessions, and safer password handling for the IP-hosted Ubuntu deployment.

**Architecture:** Extend the existing Express API with a small security layer that sits beside the current auth and admin routes instead of replacing them. Keep the current inventory data model intact, add focused tables for login attempts, reset tokens, and audit logs, and expose only the minimum new endpoints needed for login protection and password recovery. The admin UI stays in the same React app, but gains a login/recovery flow and a security settings screen.

**Tech Stack:** React, Vite, Capacitor, Node.js, TypeScript, Express, PostgreSQL, Vitest, QQ Mail SMTP, bcrypt, server-side sessions.

---

### Task 1: Security Schema and Environment

**Files:**
- Modify: `server/src/schema.sql`
- Modify: `server/src/config.ts`
- Modify: `server/package.json`
- Modify: `.env.example`
- Modify: `deploy/README.md`

- [ ] **Step 1: Write the failing schema test**

Create `server/src/test/security-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

describe('security schema', () => {
  it('declares reset token and audit log tables', async () => {
    const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8')
    expect(schema).toContain('create table if not exists password_reset_tokens')
    expect(schema).toContain('create table if not exists admin_audit_logs')
  })
})
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `npm --prefix server exec vitest run src/test/security-schema.test.ts --config vitest.config.ts`

Expected: FAIL because the new tables do not exist yet.

- [ ] **Step 3: Extend the schema and config**

Update `server/src/schema.sql` to add:

```sql
create table if not exists password_reset_tokens (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null,
  request_ip text,
  request_user_agent text
);

create table if not exists admin_audit_logs (
  id text primary key,
  user_id text references users(id) on delete set null,
  email text,
  event_type text not null,
  outcome text not null,
  ip text,
  user_agent text,
  detail jsonb,
  created_at timestamptz not null
);

create table if not exists login_attempts (
  id text primary key,
  email text not null,
  ip text not null,
  success boolean not null,
  captcha_required boolean not null default false,
  created_at timestamptz not null
);
```

Update `server/src/config.ts`:

```ts
import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgres://inventory:inventory@localhost:5432/inventory'),
  SESSION_SECRET: z.string().min(16).default('dev-session-secret-change-me'),
  ADMIN_EMAIL: z.string().email().default('admin@example.com'),
  ADMIN_PASSWORD: z.string().min(12).default('admin12345'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  MAIL_HOST: z.string().default('smtp.qq.com'),
  MAIL_PORT: z.coerce.number().default(465),
  MAIL_USER: z.string().email().default('49703878@qq.com'),
  MAIL_PASS: z.string().min(1).default('replace-me'),
  MAIL_FROM: z.string().email().default('49703878@qq.com'),
  LOGIN_FAILURE_THRESHOLD: z.coerce.number().default(3),
  LOGIN_LOCK_MINUTES: z.coerce.number().default(15),
  RESET_TOKEN_MINUTES: z.coerce.number().default(15),
})

export const config = envSchema.parse(process.env)
```

Update `server/package.json` dependencies:

```json
{
  "dependencies": {
    "helmet": "^8.0.0",
    "nodemailer": "^7.0.10"
  }
}
```

Update `.env.example` with the new mail and security settings, but keep secrets blank or placeholder-only.

Update `deploy/README.md` to document QQ Mail SMTP authorization code usage and the new security env vars.

- [ ] **Step 4: Run the schema/config tests**

Run:

```bash
npm run server:build
npm run server:test
```

Expected: build and tests still pass after the schema/config additions.

- [ ] **Step 5: Commit**

Run:

```bash
git add server/src/schema.sql server/src/config.ts .env.example deploy/README.md server/src/test/security-schema.test.ts
git commit -m "feat: add admin security schema"
```

### Task 2: Security Services

**Files:**
- Create: `server/src/security/emailService.ts`
- Create: `server/src/security/auditRepository.ts`
- Create: `server/src/security/rateLimitRepository.ts`
- Create: `server/src/security/tokenService.ts`
- Modify: `server/package.json`

- [ ] **Step 1: Add tests for token and audit helpers**

Create `server/src/test/security-services.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { hashToken, makeResetToken } from '../security/tokenService.js'

describe('security helpers', () => {
  it('hashes reset tokens deterministically', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix server exec vitest run src/test/security-services.test.ts --config vitest.config.ts`

Expected: FAIL because the helper modules do not exist yet.

- [ ] **Step 3: Implement email, audit, rate limit, and token helpers**

Create the helper modules with the following minimal responsibilities:

```ts
// server/src/security/tokenService.ts
import { randomBytes, createHash } from 'node:crypto'
export function makeResetToken() {
  return randomBytes(24).toString('hex')
}
export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
```

```ts
// server/src/security/emailService.ts
import nodemailer from 'nodemailer'
import { config } from '../config.js'
export async function sendResetEmail(to: string, code: string) {
  const transporter = nodemailer.createTransport({
    host: config.MAIL_HOST,
    port: config.MAIL_PORT,
    secure: config.MAIL_PORT === 465,
    auth: { user: config.MAIL_USER, pass: config.MAIL_PASS },
  })
  await transporter.sendMail({
    from: config.MAIL_FROM,
    to,
    subject: '后台密码重置验证码',
    text: `你的验证码是 ${code}，15 分钟内有效。`,
  })
}
```

Add the following dependencies to `server/package.json`:

```json
{
  "dependencies": {
    "helmet": "^8.0.0",
    "nodemailer": "^7.0.10"
  }
}
```

```ts
// server/src/security/auditRepository.ts
import { randomUUID } from 'node:crypto'
import { query } from '../db.js'
export async function writeAuditLog(input: { userId?: string | null; email?: string | null; eventType: string; outcome: string; ip?: string | null; userAgent?: string | null; detail?: unknown }) {
  await query(
    `insert into admin_audit_logs (id, user_id, email, event_type, outcome, ip, user_agent, detail, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
    [`audit-${randomUUID()}`, input.userId ?? null, input.email ?? null, input.eventType, input.outcome, input.ip ?? null, input.userAgent ?? null, input.detail ? JSON.stringify(input.detail) : null],
  )
}
```

```ts
// server/src/security/rateLimitRepository.ts
import { randomUUID } from 'node:crypto'
import { query } from '../db.js'
import { config } from '../config.js'
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
```

- [ ] **Step 4: Run the service tests**

Run:

```bash
npm run server:build
npm run server:test
```

Expected: service helpers compile and tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add server/src/security server/src/test/security-services.test.ts server/package.json server/package-lock.json
git commit -m "feat: add admin security helpers"
```

### Task 3: Auth Hardening

**Files:**
- Modify: `server/src/auth.ts`
- Modify: `server/src/routes/authRoutes.ts`
- Modify: `server/src/index.ts`
- Modify: `src/api/client.ts`

- [ ] **Step 1: Add the failing auth test**

Create `server/src/test/security-auth.test.ts`:

```ts
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../index.js'
import { migrate } from '../db.js'
import { seedDatabase } from '../seed.js'

describe('admin auth hardening', () => {
  const app = createApp()

  beforeAll(async () => {
    await migrate()
    await seedDatabase({ closePool: false })
  })

  it('rejects wrong password without leaking details', async () => {
    const response = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'wrong' })
    expect(response.status).toBe(401)
    expect(response.body.error.message).toBe('Invalid email or password')
  })
})
```

- [ ] **Step 2: Run it to verify the current behavior is incomplete**

Run: `npm --prefix server exec vitest run src/test/security-auth.test.ts --config vitest.config.ts`

Expected: fail or expose missing auth hardening behavior.

- [ ] **Step 3: Implement auth hardening**

Update `server/src/auth.ts` to:

```ts
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { NextFunction, Request, Response } from 'express'
import { config } from './config.js'
import { hashToken, query } from './db.js'
import { unauthorized } from './errors.js'
import { shouldRequireCaptcha, recordLoginAttempt } from './security/rateLimitRepository.js'

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

export async function requireAuth(request: Request, _response: Response, next: NextFunction) {
  const token = request.header('authorization')?.startsWith('Bearer ') ? request.header('authorization')!.slice(7) : ''
  if (!token) return next(unauthorized())
  const tokenHash = hashToken(`${token}:${config.SESSION_SECRET}`)
  const result = await query<{ id: string; email: string; homeId: string }>(
    `select users.id, users.email, users.home_id as "homeId"
     from sessions join users on users.id = sessions.user_id
     where sessions.token_hash = $1 and sessions.expires_at > now()`,
    [tokenHash],
  )
  if (!result.rows[0]) return next(unauthorized('Invalid or expired session'))
  request.user = result.rows[0]
  next()
}

export async function requireCaptchaIfNeeded(email: string, ip: string) {
  return shouldRequireCaptcha(email, ip)
}

export async function trackLoginAttempt(email: string, ip: string, success: boolean, captchaRequired = false) {
  await recordLoginAttempt({ email, ip, success, captchaRequired })
}
```

Update `server/src/routes/authRoutes.ts` to:

- accept `req.ip` and `user-agent`
- call `trackLoginAttempt`
- keep the error message generic
- return a flag when CAPTCHA is now required
- set and clear an `HttpOnly` admin session cookie for browser clients
- continue returning the bearer token for mobile clients

Update `server/src/index.ts` so `trust proxy` is configured for the IP-hosted Nginx path and security headers are added with `helmet`.

Update `src/api/client.ts` so browser requests include credentials for same-origin admin calls while preserving bearer token support for the mobile app.

- [ ] **Step 4: Verify auth hardening**

Run:

```bash
npm run server:build
npm run server:test
```

Expected: auth tests pass and the login response now includes CAPTCHA gating data when needed.

- [ ] **Step 5: Commit**

Run:

```bash
git add server/src/auth.ts server/src/routes/authRoutes.ts server/src/index.ts server/src/test/security-auth.test.ts
git commit -m "feat: harden admin auth"
```

### Task 4: Password Reset and Change Flow

**Files:**
- Create: `server/src/routes/passwordRoutes.ts`
- Modify: `server/src/auth.ts`
- Modify: `server/src/routes/authRoutes.ts`
- Modify: `server/src/index.ts`
- Modify: `src/api/client.ts`

- [ ] **Step 1: Add reset-flow tests**

Create `server/src/test/security-reset.test.ts`:

```ts
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../index.js'
import { migrate } from '../db.js'
import { seedDatabase } from '../seed.js'

describe('password reset flow', () => {
  const app = createApp()

  beforeAll(async () => {
    await migrate()
    await seedDatabase({ closePool: false })
  })

  it('accepts forgot-password and returns a generic success response', async () => {
    const response = await request(app).post('/api/auth/forgot-password').send({ email: 'admin@example.com' })
    expect(response.status).toBe(200)
    expect(response.body.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Implement reset and password-change routes**

Create `server/src/routes/passwordRoutes.ts` with:

```ts
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth.js'
import { query } from '../db.js'
import { unauthorized } from '../errors.js'
import { makeResetToken, hashToken } from '../security/tokenService.js'
import { sendResetEmail } from '../security/emailService.js'
import { writeAuditLog } from '../security/auditRepository.js'

export const passwordRoutes = Router()

passwordRoutes.post('/forgot-password', async (request, response, next) => {
  try {
    const input = z.object({ email: z.string().email() }).parse(request.body)
    const userResult = await query<{ id: string }>('select id from users where email = $1', [input.email])
    if (userResult.rows[0]) {
      const token = makeResetToken()
      const tokenHash = hashToken(token)
      await query(
        `insert into password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at, request_ip, request_user_agent)
         values ($1, $2, $3, now() + interval '15 minutes', null, now(), $4, $5)`,
        [`reset-${Date.now()}`, userResult.rows[0].id, tokenHash, request.ip, request.get('user-agent') ?? null],
      )
      await sendResetEmail(input.email, token)
      await writeAuditLog({ email: input.email, eventType: 'password_reset_requested', outcome: 'ok', ip: request.ip, userAgent: request.get('user-agent') ?? null })
    }
    response.json({ ok: true })
  } catch (error) {
    next(error)
  }
})
```

Add `POST /api/auth/reset-password`, `POST /api/auth/change-password`, and `POST /api/auth/logout-all` with:

- token validation
- password update with bcrypt
- session revocation
- audit log writes

- [ ] **Step 3: Verify reset flow**

Run:

```bash
npm run server:build
npm run server:test
```

Expected: reset tests pass and sessions are revoked after reset.

- [ ] **Step 4: Commit**

Run:

```bash
git add server/src/routes/passwordRoutes.ts server/src/auth.ts server/src/routes/authRoutes.ts server/src/index.ts server/src/test/security-reset.test.ts
git commit -m "feat: add password reset flow"
```

### Task 5: Admin Security UI

**Files:**
- Create: `src/admin/security/AdminSecurityApp.tsx`
- Create: `src/admin/security/AdminSecurityApp.css`
- Modify: `src/main.tsx`
- Modify: `src/api/client.ts`
- Modify: `src/domain/types.ts`

- [ ] **Step 1: Add the failing frontend test**

Create `src/admin/security/AdminSecurityApp.test.tsx`:

```tsx
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AdminSecurityApp } from './AdminSecurityApp'

describe('AdminSecurityApp', () => {
  it('shows login and forgot-password entry points', () => {
    render(<AdminSecurityApp />)
    expect(screen.getByRole('heading', { name: '后台安全登录' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Implement the UI**

Add an admin security entry page that:

- renders login
- renders forgot-password
- shows CAPTCHA when the API asks for it
- supports password reset and password change
- shows a small session/security log panel

- [ ] **Step 3: Verify the frontend**

Run:

```bash
npm test
npm run build
```

Expected: frontend tests and build pass.

- [ ] **Step 4: Commit**

Run:

```bash
git add src/admin/security src/main.tsx src/api/client.ts src/domain/types.ts
git commit -m "feat: add admin security ui"
```

### Task 6: Server Deployment and Verification

**Files:**
- Modify: `deploy/README.md`
- Modify: `deploy/nginx-bare-metal.conf` if new routes need proxying
- Modify: `deploy/studytech-api.service` if env vars or startup change

- [ ] **Step 1: Verify server build and tests**

Run:

```bash
npm run server:build
npm run server:test
npm run build
```

Expected: all pass locally in the worktree.

- [ ] **Step 2: Update deployment notes**

Document the new `.env` fields:

```bash
MAIL_HOST=smtp.qq.com
MAIL_PORT=465
MAIL_USER=49703878@qq.com
MAIL_PASS=<QQ SMTP authorization code>
MAIL_FROM=49703878@qq.com
LOGIN_FAILURE_THRESHOLD=3
LOGIN_LOCK_MINUTES=15
RESET_TOKEN_MINUTES=15
```

- [ ] **Step 3: Commit**

Run:

```bash
git add deploy README.md
git commit -m "docs: update admin security deployment notes"
```
