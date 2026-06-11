# Multi-Home Platform Design

## Goal

Upgrade the home inventory app from a single seeded household into a multi-home platform where many families can register, create or join separate household spaces, and keep their item data strictly isolated from other families.

## Product Model

The product has three levels:

1. Platform

The platform is operated by the service owner. Platform administration can view system-level counts, security events, and tenant health. Platform administration must not accidentally mix household data into ordinary user flows.

2. Household

A household is the tenant boundary. Every inventory object belongs to one household through `home_id`. A user who creates a household becomes that household's owner. Other users join through invitation codes.

3. Household member

A member is a user's role inside one household. Members perform item actions, and inventory history records the real member who created, moved, or archived an item.

## Recommended Approach

Use a conservative tenant model:

- Keep `homes` as the tenant table.
- Keep `users` as platform login identities.
- Add `home_memberships` to connect users to homes with a role and display name.
- Treat `home_memberships.id` as the actor id for `items.created_by`, `items.updated_by`, and `movements.moved_by`.
- Add invitation codes scoped to one home.
- Keep the first release focused on one active household per session. Multi-home switching can be added later without changing the underlying model.

This avoids the current narrow `users.home_id` design and leaves room for one user to belong to more than one household later.

## User Flows

### Register And Create Household

1. Visitor opens the web page or app and chooses register.
2. Visitor enters email, password, display name, and household name.
3. Server validates the email and password, creates the user, creates the household, creates an owner membership, issues a session, and returns the active home.
4. The new household starts with default areas and a small set of useful starter locations, but no seeded personal items.

Registration uses an email verification code sent through the existing mail service. The user must prove control of the email before the account is activated.

### Register And Join Household

1. A household owner or admin creates an invitation code.
2. A new user registers with email, password, display name, and invitation code.
3. Server creates the user, validates the invitation, creates a member membership under that invitation's home, issues a session, and returns that home.
4. The user sees only that household's inventory.

### Existing User Joins Household

1. Logged-in user enters an invitation code.
2. Server validates the code, checks the user is not already a member of that home, creates a membership, and returns the joined home.
3. The current release switches the active home immediately. Later releases can expose a household switcher.

### Household Administration

Household owner/admin can:

- View members.
- Create invitation codes.
- Disable invitation codes.
- Change member display names and roles.
- Disable a member.

Member role can:

- View inventory.
- Create items.
- Move items.
- Archive items.

Only owner/admin can manage members and locations in the first platform release.

### Platform Administration

Platform admin can:

- View number of users, homes, memberships, items, and recent security events.

Platform admin is intentionally separate from household admin. The current seeded QQ email becomes both the first platform admin and the owner of the migrated default home.

## Data Model

### `users`

Login identity.

- `id`
- `email`, unique
- `password_hash`
- `status`: `pending`, `active`, `disabled`
- `is_platform_admin`: boolean
- `created_at`
- `email_verified_at`

The existing `home_id` column is deprecated. It remains temporarily for migration compatibility but must not be used by new code after membership lookup is implemented.

### `homes`

Tenant record.

- `id`
- `name`
- `status`: `active`, `disabled`
- `created_by_user_id`
- `created_at`

### `home_memberships`

Connection between a user and a home.

- `id`
- `home_id`
- `user_id`
- `display_name`
- `role`: `owner`, `admin`, `member`
- `status`: `active`, `disabled`
- `created_at`

Unique constraint: `(home_id, user_id)`.

### `home_invitations`

Invitation codes.

- `id`
- `home_id`
- `code_hash`
- `role`
- `created_by_membership_id`
- `expires_at`
- `max_uses`
- `used_count`
- `disabled_at`
- `created_at`

Invitation codes are shown once as plain text and stored hashed.

### `email_verification_tokens`

Registration email verification.

- `id`
- `email`
- `token_hash`
- `purpose`: `register`
- `payload`
- `expires_at`
- `used_at`
- `created_at`
- `request_ip`
- `request_user_agent`

The `payload` stores pending registration data needed after email verification. Passwords in payload must be stored as password hashes, not plain text.

### Inventory Tables

Inventory tables already contain `home_id`. They remain tenant-scoped.

Actor columns use membership ids in new rows:

- `items.created_by`
- `items.updated_by`
- `movements.moved_by`

During this migration, every `home_memberships` row is mirrored into the legacy `members` table using the same id. This preserves the existing foreign keys from inventory rows to `members(id)` while making `home_memberships` the authoritative account-to-home relationship. The API reads household members from `home_memberships` joined to `users`; the legacy `members` table remains a compatibility table for inventory actor foreign keys.

## API Design

### Public Auth

- `POST /api/auth/register/start`
  - Body: `{ email, password, displayName, homeName?, inviteCode? }`
  - Sends an email verification code.
  - Exactly one of `homeName` or `inviteCode` is required.

- `POST /api/auth/register/verify`
  - Body: `{ email, code }`
  - Creates the user and membership, then logs the user in.

- `POST /api/auth/login`
  - Existing login endpoint.
  - Response includes active membership: `{ user, activeHome, membership, token }`.

- `POST /api/auth/forgot-password`
  - Existing reset flow.

- `POST /api/auth/reset-password`
  - Existing reset flow.

### Household

- `GET /api/me`
  - Returns current user, active home, active membership, and all memberships.

- `POST /api/homes/join`
  - Body: `{ inviteCode }`.
  - Adds current user to a household.

- `GET /api/homes/:homeId/members`
  - Owner/admin only.

- `POST /api/homes/:homeId/invitations`
  - Owner/admin only.
  - Body: `{ role, expiresInDays, maxUses }`.
  - Returns the plain invitation code once.

- `POST /api/homes/:homeId/members/:membershipId/disable`
  - Owner/admin only. Owner cannot disable the last owner.

### Inventory

Existing inventory endpoints remain:

- `GET /api/inventory`
- `POST /api/items`
- `POST /api/items/:id/move`
- `POST /api/items/:id/archive`
- `POST /api/locations`

Each endpoint derives `home_id` and actor membership from the session, never from request body. A user cannot pass another `home_id` to cross tenant boundaries.

### Admin Summary

- `GET /api/admin/summary`
  - Household summary for the active home.

- `GET /api/platform/summary`
  - Platform admin only.
  - System-level counts and recent audit events.

## Client Experience

### Mobile App

When not logged in:

- Show login and register entry points.
- Register flow offers two paths:
  - Create a household.
  - Join with invitation code.

When logged in:

- App loads the active household inventory.
- Item creation, movement, and archive use the current membership as actor.
- Cached local inventory remains a fallback, but cached data must be tied to the current user/home key so one household does not see another household's cache.

### Web Admin

The current `/admin` page becomes household admin for the active home:

- Dashboard
- Items
- Locations
- Members
- Invitations
- Security logs

Platform administration can live under `/platform` and require `is_platform_admin`.

## Security And Isolation

Hard requirements:

- Every authenticated request loads user, active home, and active membership from the session.
- Inventory queries always filter by active `home_id`.
- Actor ids are server-derived from active membership.
- Invitations are random, high entropy, hashed at rest, scoped to one home, expiring, and rate-limited.
- Email verification codes are expiring and single use.
- Login, registration, invitation redemption, and password reset write audit logs.
- Disabled users, homes, and memberships cannot access inventory.

Current captcha is a placeholder. It can remain for the immediate release, but production should replace it with a real captcha provider once the domain is configured.

## Migration Strategy

Existing server data must not be deleted.

1. Keep existing `home-1` and inventory rows.
2. Add new user and membership columns/tables idempotently.
3. Create a `home_memberships` owner row for the existing QQ admin user and existing `home-1`.
4. Backfill inventory actor ids:
   - Existing rows keep their current legacy member ids.
   - New rows use membership ids that are also present in the compatibility `members` table.
5. Update reads to return members from `home_memberships`.
6. After the app no longer relies on the old `members` table, old member rows can remain as inert legacy data.

## Testing

Backend tests:

- Register with household name creates user, home, owner membership, and session.
- Register with invitation creates user and member membership under the invited home.
- A user from Home A cannot read Home B inventory.
- Creating an item stores the current membership id as creator/updater.
- Moving an item stores the current membership id as mover.
- Disabled membership cannot access inventory.
- Invitation code cannot be reused beyond max uses or after expiry.
- Platform summary rejects non-platform admins.

Frontend tests:

- Logged-out app shows login/register choices.
- Register-create-home flow calls the correct API and loads inventory.
- Register-join-home flow requires invitation code.
- Admin page shows members and invitation creation for owner/admin.
- Household cache is keyed by user/home.

Deployment verification:

- Existing QQ admin can still log in after migration.
- Existing inventory remains visible under the migrated default home.
- A new test household can register and cannot see default home data.
- Existing `icanrun` service on port 3000 remains untouched.

## Implementation Order

1. Add schema migration for users, memberships, invitations, email verification, and home status.
2. Add auth context that resolves session to user plus active membership.
3. Add registration start/verify with email code.
4. Add household invitation and member APIs.
5. Update inventory writes to use membership actor ids.
6. Update frontend auth/register flows.
7. Update admin members/invitations UI.
8. Add platform summary API and minimal `/platform` page.
9. Deploy without deleting existing data.
10. Rebuild APK against the upgraded API.

## Explicit Non-Goals For This Task

- Payments or subscription plans.
- WeChat, Apple, or phone-number login.
- Real-time collaboration.
- Multi-home switcher UI.
- Public marketplace or social sharing.
- Object photo uploads.

These can be added later after tenant isolation, registration, and invitations are stable.
