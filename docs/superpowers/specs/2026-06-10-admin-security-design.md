# Admin Security Design

## Goal

Raise the public admin surface from "shared password page" to a basic production-grade security posture for an IP-hosted Ubuntu deployment.

## Constraints

- No domain name is available yet.
- The current deployment is IP-based.
- QQ Mail SMTP is available for outbound email.
- The current backend already has login, session, inventory, and admin-summary endpoints.

Important limitation:

- Without HTTPS, login credentials and session traffic still travel over HTTP. This design reduces abuse and adds recovery and session controls, but it does not claim full transport security until HTTPS is added later.

## Recommended Approach

Use a layered defense model:

- Password login with strong password policy.
- Login rate limiting by IP and email.
- CAPTCHA only after suspicious or repeated failures.
- Email-based password reset and password change verification.
- Server-side sessions with revocation.
- Audit logging for security events.
- Nginx and deployment hardening.

This is the right balance for the current server and avoids overengineering into a second auth system.

## Alternatives Considered

1. Password + CAPTCHA + email reset

This is the recommended path. It is simple enough to ship and strong enough for a small admin surface.

2. Passwordless email OTP

This is simpler for the user but more fragile operationally and less convenient for a long-lived admin account.

3. TOTP second factor

Stronger, but it adds onboarding friction and requires a stable device setup. Better as a later phase.

## Login Flow

1. Admin enters email and password.
2. Server applies rate limits by IP and email.
3. If risk is low, normal login proceeds.
4. If failures exceed threshold, server requires CAPTCHA.
5. If password matches, server issues a new session and logs the event.
6. On repeated abuse, server can temporarily lock the account or source IP.

Login errors must be generic:

- Do not reveal whether email or password was wrong.
- Do not reveal whether the account exists.

## Session Design

- Keep sessions server-side in the database.
- Store only a hash of the session token.
- Issue a fresh session token on login.
- Revoke all sessions on password reset or admin-initiated password change.
- Add explicit logout and "logout all devices" support.

For the current IP deployment:

- Use HttpOnly cookies if the web app and API are same-origin.
- Keep token lifetime short enough to limit exposure.

## Password Policy

- Minimum length: 12 characters.
- Reject trivial defaults such as `admin12345` in production.
- Encourage mixed-length passphrases over forced complexity rules.
- Hash passwords with bcrypt.

## Email Reset Flow

The reset flow uses QQ Mail SMTP.

Steps:

1. User enters admin email.
2. Server generates a one-time reset code or link.
3. Server stores only a hash of the code plus expiration metadata.
4. Server sends the code by email.
5. User submits code plus new password.
6. Server validates code, updates password, revokes all sessions, and logs the event.

Rules:

- Reset codes expire quickly, ideally 10 to 15 minutes.
- Reset requests should return a generic success response even if the email is unknown.
- Only one active reset token should be valid at a time.

## CAPTCHA Policy

- Do not show CAPTCHA on every login.
- Show CAPTCHA after repeated failed logins or suspicious activity.
- CAPTCHA should protect the login endpoint, not replace rate limiting.

Preferred implementation:

- First choice: Alibaba Cloud CAPTCHA if already easy to integrate.
- Fallback: a simple server-generated image CAPTCHA for the first pass.

## Audit Logging

Log these events:

- Login success.
- Login failure.
- CAPTCHA failure.
- Password reset request.
- Password reset success.
- Password change success.
- Logout.
- Logout-all action.

Log fields:

- Timestamp.
- Event type.
- Admin email.
- Source IP.
- User-Agent.
- Outcome.

## Data Model Additions

Add tables for:

- `password_reset_tokens`
- `admin_audit_logs`
- optional `login_attempts`

Extend or preserve:

- `users`
- `sessions`

## API Additions

Add endpoints:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/change-password`
- `POST /api/auth/logout-all`
- `GET /api/admin/security/logs`

Optional later:

- `POST /api/auth/captcha`
- `POST /api/auth/verify-email`

## Admin UI Changes

Add admin security screens:

- Login form with conditional CAPTCHA.
- "Forgot password" entry.
- Reset password form.
- Change password form.
- Session/logout controls.
- Security log view for recent events.

## Deployment Rules

- Put mail credentials in `.env`.
- Never commit mail secrets.
- Keep the old backend service on port 3000 untouched.
- Keep the new inventory system isolated on its own routes and service.
- Add HTTPS later when a domain is available.

## Testing

Backend tests:

- Wrong password increments attempt tracking.
- CAPTCHA is required after threshold.
- Forgot-password returns generic success.
- Reset token expires and cannot be reused.
- Password reset revokes old sessions.
- Audit log entries are created.

Frontend tests:

- Login form renders CAPTCHA when required.
- Forgot-password and reset flows render correctly.
- Password change flow requires re-authentication.

## Out Of Scope For First Pass

- Domain provisioning.
- Full SSO.
- WebAuthn/passkeys.
- Enterprise role hierarchy.
- Full transport security hardening beyond what IP deployment allows.

## Implementation Order

1. Add security tables and config.
2. Add login rate limiting and audit logging.
3. Add CAPTCHA gating.
4. Add email reset flow with QQ Mail SMTP.
5. Add password change and logout-all.
6. Add admin security UI.
7. Verify with tests and deployment checks.
