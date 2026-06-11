# Multi-Home Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the app into a multi-home platform where many families can register, create or join isolated household spaces, and record real household actors for inventory actions.

**Architecture:** The backend becomes membership-driven: sessions resolve to a user, active home, and active `home_memberships` actor. Inventory APIs derive `home_id` and actor membership from the session, registration uses email codes, and household admins manage invitation codes. The frontend adds login/register choices and an admin members/invitations surface while preserving the existing inventory experience.

**Tech Stack:** Node.js, TypeScript, Express, PostgreSQL, zod, bcryptjs, nodemailer, React, Vite, Vitest, Supertest, Capacitor.

---

## File Structure

- Modify `server/src/schema.sql`: idempotent schema additions for users status, homes status, memberships, invitations, email verification tokens, and sessions active home.
- Modify `server/src/auth.ts`: expand auth context to include active home and membership; keep bearer/cookie token compatibility.
- Create `server/src/memberships.ts`: membership lookup, role checks, membership mirroring into legacy `members`.
- Create `server/src/routes/registrationRoutes.ts`: registration start/verify endpoints.
- Create `server/src/routes/homeRoutes.ts`: `/api/me`, join household, members, invitation endpoints.
- Create `server/src/routes/platformRoutes.ts`: platform summary endpoint guarded by platform admin flag.
- Modify `server/src/security/tokenService.ts`: add invitation/email code helpers.
- Modify `server/src/security/emailService.ts`: add registration email sender.
- Modify `server/src/routes/authRoutes.ts`: return active home and membership on login.
- Modify `server/src/routes/inventoryRoutes.ts`: use `request.user.membershipId` instead of fixed `u-me`.
- Modify `server/src/inventoryRepository.ts`: read members from `home_memberships`, validate locations belong to home.
- Modify `server/src/seed.ts`: seed platform admin membership and compatibility member idempotently.
- Add tests in `server/src/test/multi-home-platform.test.ts`.
- Modify `src/domain/types.ts`: add membership-rich login response, user/home metadata.
- Modify `src/api/client.ts`: add registration, me, invitation, members, platform summary APIs.
- Modify `src/hooks/useInventorySync.ts`: key cache by active home once known.
- Modify `src/App.tsx` and `src/App.css`: add register create-home/join-home entry points.
- Modify `src/admin/AdminApp.tsx` and `src/admin/AdminApp.css`: add members/invitation panel.
- Add or update frontend tests for register and admin invitation flows.

## Tasks

### Task 1: Schema And Membership Foundation

**Files:**
- Modify: `server/src/schema.sql`
- Create: `server/src/memberships.ts`
- Modify: `server/src/seed.ts`
- Test: `server/src/test/security-schema.test.ts`

- [ ] Add failing schema tests that assert:
  - `home_memberships` exists.
  - `home_invitations` exists.
  - `email_verification_tokens` exists.
  - `users` has `status`, `is_platform_admin`, `email_verified_at`.
  - seeded admin has an owner membership for `home-1`.

- [ ] Run `npm run server:test -- security-schema` and confirm the new tests fail before implementation.

- [ ] Extend `schema.sql` idempotently:
  - Add columns to `users`: `status`, `is_platform_admin`, `email_verified_at`.
  - Add columns to `homes`: `status`, `created_by_user_id`, `created_at`.
  - Add column to `sessions`: `active_home_id`.
  - Create `home_memberships`, `home_invitations`, `email_verification_tokens`.
  - Do not drop `users.home_id` or `members`.

- [ ] Implement `server/src/memberships.ts` with:
  - `createMembership({ homeId, userId, displayName, role })`
  - `getActiveMembershipForUser(userId, activeHomeId?)`
  - `mirrorMembershipToLegacyMember(membership)`
  - `assertAdminMembership(membership)`
  - `assertPlatformAdmin(user)`

- [ ] Update `seed.ts` so the seeded QQ/admin user:
  - Has `status = 'active'`
  - Has `is_platform_admin = true`
  - Has `email_verified_at = now()`
  - Has an owner `home_memberships` row for `home-1`
  - Has matching legacy `members` row with the same membership id

- [ ] Run `npm run server:test -- security-schema` and confirm it passes.

- [ ] Commit:

```bash
git add server/src/schema.sql server/src/memberships.ts server/src/seed.ts server/src/test/security-schema.test.ts
git commit -m "feat: add multi-home membership schema"
```

### Task 2: Auth Context Uses Active Membership

**Files:**
- Modify: `server/src/auth.ts`
- Modify: `server/src/routes/authRoutes.ts`
- Modify: `server/src/routes/inventoryRoutes.ts`
- Modify: `server/src/inventoryRepository.ts`
- Test: `server/src/test/multi-home-platform.test.ts`
- Test: `server/src/test/server.test.ts`

- [ ] Add failing tests:
  - Login response includes `activeHome` and `membership`.
  - Creating an item records `createdBy` as the logged-in membership id, not `u-me`.
  - A user with a disabled membership receives 401 or 403 for `/api/inventory`.

- [ ] Run targeted server tests and confirm failures.

- [ ] Expand `AuthUser` in `auth.ts`:
  - `id`
  - `email`
  - `homeId`
  - `membershipId`
  - `membershipRole`
  - `isPlatformAdmin`

- [ ] Update `createSession(userId, activeHomeId?)` to store `active_home_id` when available.

- [ ] Update `requireAuth`:
  - Resolve session token.
  - Load active user where `users.status = 'active'`.
  - Resolve active membership from `sessions.active_home_id` or the first active membership.
  - Reject disabled user, disabled home, or disabled membership.
  - Populate `request.user`.

- [ ] Update `authRoutes.post('/login')`:
  - Only active users can log in.
  - Create session with active home.
  - Return `{ token, user, activeHome, membership, captchaRequired: false }`.

- [ ] Update `inventoryRoutes` to pass `request.user!.membershipId` for create, move, archive.

- [ ] Update `inventoryRepository.getInventory()` to read members from `home_memberships` joined to `users`, and append legacy `members` rows whose ids appear in item or movement actor columns but are not present in `home_memberships`.

- [ ] Run:

```bash
npm run server:test -- multi-home-platform
npm run server:test -- server
```

- [ ] Commit:

```bash
git add server/src/auth.ts server/src/routes/authRoutes.ts server/src/routes/inventoryRoutes.ts server/src/inventoryRepository.ts server/src/test/multi-home-platform.test.ts server/src/test/server.test.ts
git commit -m "feat: resolve sessions through home memberships"
```

### Task 3: Registration With Email Verification

**Files:**
- Create: `server/src/routes/registrationRoutes.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/security/tokenService.ts`
- Modify: `server/src/security/emailService.ts`
- Test: `server/src/test/multi-home-platform.test.ts`

- [ ] Add failing tests:
  - `POST /api/auth/register/start` with `{ email, password, displayName, homeName }` stores a pending verification token and returns `{ ok: true }`.
  - `POST /api/auth/register/verify` with the stored token creates user, home, owner membership, default areas/locations, session, and returns active home.
  - Register start rejects a payload with both `homeName` and `inviteCode`.

- [ ] Implement token helpers:
  - `makeEmailCode()`
  - `hashSecurityToken(code)`
  - Keep reset token behavior unchanged.

- [ ] Add `sendRegistrationEmail(to, code)` to email service.

- [ ] Implement registration routes:
  - Hash password before storing pending payload.
  - Store pending payload in `email_verification_tokens.payload`.
  - Mark older unused registration codes for the same email as used.
  - On verify, create user/home/membership in one transaction.
  - Seed default areas and starter locations for new homes.
  - Issue a session.

- [ ] Mount routes under `/api/auth`.

- [ ] Run:

```bash
npm run server:test -- multi-home-platform
npm run server:build
```

- [ ] Commit:

```bash
git add server/src/routes/registrationRoutes.ts server/src/index.ts server/src/security/tokenService.ts server/src/security/emailService.ts server/src/test/multi-home-platform.test.ts
git commit -m "feat: add email verified registration"
```

### Task 4: Household Invitations And Member APIs

**Files:**
- Create: `server/src/routes/homeRoutes.ts`
- Modify: `server/src/index.ts`
- Test: `server/src/test/multi-home-platform.test.ts`

- [ ] Add failing tests:
  - Owner can create an invitation and receives a plain code once.
  - Member cannot create invitations.
  - Register with invitation joins the invitation home as a member.
  - A Home A user cannot read Home B inventory.
  - Invitation max uses and expiry are enforced.

- [ ] Implement invitation creation:
  - Generate high entropy code.
  - Store hash only.
  - Store role, max uses, expiry, creator membership.

- [ ] Implement member listing:
  - Owner/admin only.
  - Return membership id, display name, email, role, status, createdAt.

- [ ] Implement `POST /api/homes/join` for logged-in users.

- [ ] Update registration verify to handle invitation payload path.

- [ ] Run:

```bash
npm run server:test -- multi-home-platform
npm run server:test
```

- [ ] Commit:

```bash
git add server/src/routes/homeRoutes.ts server/src/index.ts server/src/routes/registrationRoutes.ts server/src/test/multi-home-platform.test.ts
git commit -m "feat: add household invitations"
```

### Task 5: Platform Summary API

**Files:**
- Create: `server/src/routes/platformRoutes.ts`
- Modify: `server/src/index.ts`
- Test: `server/src/test/multi-home-platform.test.ts`

- [ ] Add failing tests:
  - Non-platform admin receives 403 for `/api/platform/summary`.
  - Platform admin receives users, homes, memberships, items, and recent audit counts.

- [ ] Implement platform route with platform admin guard.

- [ ] Run:

```bash
npm run server:test -- multi-home-platform
npm run server:build
```

- [ ] Commit:

```bash
git add server/src/routes/platformRoutes.ts server/src/index.ts server/src/test/multi-home-platform.test.ts
git commit -m "feat: add platform summary"
```

### Task 6: Frontend API Types And Register Flow

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/api/client.ts`
- Modify: `src/hooks/useInventorySync.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Test: `src/App.login.test.tsx`
- Test: `src/hooks/useInventorySync.test.ts`

- [ ] Add failing frontend tests:
  - Logged-out app shows login and register choices.
  - Create-home registration calls `registerStart` then `registerVerify`.
  - Join-home registration requires invite code.
  - Cache key includes active home id after login.

- [ ] Update API client:
  - `registerStart(input)`
  - `registerVerify(email, code)`
  - `getMe()`
  - Extend login response types.

- [ ] Update `useInventorySync`:
  - Store active home id after login/register.
  - Use cache key `home_inventory_cache:<homeId>` when known.
  - Preserve old cache fallback only before login.

- [ ] Update app login panel:
  - Tabs or segmented control for login/register.
  - Register modes: create household or join invitation.
  - Email code verification step.

- [ ] Run:

```bash
npm test -- App.login
npm test -- useInventorySync
npm run build
```

- [ ] Commit:

```bash
git add src/domain/types.ts src/api/client.ts src/hooks/useInventorySync.ts src/App.tsx src/App.css src/App.login.test.tsx src/hooks/useInventorySync.test.ts
git commit -m "feat: add mobile registration flow"
```

### Task 7: Household Admin Members And Invitations UI

**Files:**
- Modify: `src/admin/AdminApp.tsx`
- Modify: `src/admin/AdminApp.css`
- Modify: `src/api/client.ts`
- Test: `src/admin/AdminApp.test.tsx`
- Test: `src/admin/AdminSecurity.test.tsx`

- [ ] Add failing tests:
  - Admin page displays members after login.
  - Owner/admin can create invitation and sees the returned code.
  - Login response with active home still loads admin dashboard.

- [ ] Add API client methods:
  - `getMe()`
  - `getHomeMembers(homeId)`
  - `createInvitation(homeId, input)`

- [ ] Update admin dashboard:
  - Members panel with email, display name, role, status.
  - Invitation creation form with role, expiry days, max uses.
  - One-time code display after creation.

- [ ] Run:

```bash
npm test -- AdminApp
npm test -- AdminSecurity
npm run build
```

- [ ] Commit:

```bash
git add src/admin/AdminApp.tsx src/admin/AdminApp.css src/api/client.ts src/admin/AdminApp.test.tsx src/admin/AdminSecurity.test.tsx
git commit -m "feat: manage household invitations in admin"
```

### Task 8: Full Verification, Deployment, And APK

**Files:**
- Modify: `.env.example`
- Build artifacts: `android/app/build/outputs/apk/debug/app-debug.apk`

- [ ] Run full local verification:

```bash
npm run server:test
npm run server:build
npm test
npm run build
```

- [ ] Review `.env.example`; keep it unchanged if no new environment variables were introduced, otherwise add only non-secret placeholders for new variables.

- [ ] Sync code to server without overwriting `.env`.

- [ ] On server:
  - Build backend.
  - Run idempotent migration/seed.
  - Restart `studytech-api`.
  - Verify QQ admin still logs in.
  - Verify default inventory remains visible.
  - Create a test household and verify it cannot see default home items.
  - Verify `icanrun` is still online on port 3000.

- [ ] Build web dist locally for server same-origin API and sync to `/var/www/studytech`.

- [ ] Build APK with:

```bash
VITE_API_BASE_URL=http://8.148.10.44:4000 VITE_ADMIN_EMAIL=49703878@qq.com npm run apk:debug
```

- [ ] Scan APK:
  - Must contain `8.148.10.44:4000`.
  - Must not contain SMTP password, `VITE_ADMIN_PASSWORD`, or `localhost:4000`.

- [ ] Commit any source/config changes needed before deployment. Do not commit secrets or generated APK unless explicitly requested.

## Self-Review

- Spec coverage: registration, invitations, membership actors, tenant isolation, platform summary, admin UI, deployment, and APK are covered.
- Scope: payments, phone login, multi-home switcher, uploads, and realtime collaboration remain out of scope.
- Type consistency: backend uses `home_memberships.id` as actor id and mirrors it into `members(id)` for existing foreign keys.
- Migration safety: existing `home-1`, inventory rows, and `members` rows are preserved; no destructive SQL is planned.
