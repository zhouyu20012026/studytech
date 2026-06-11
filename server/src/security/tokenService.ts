import { createHash, randomBytes, randomInt } from 'node:crypto'

export function makeResetCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

export function makeEmailCode() {
  return makeResetCode()
}

export function makeResetToken() {
  return randomBytes(24).toString('hex')
}

export function makeInvitationCode() {
  return randomBytes(18).toString('base64url')
}

export function hashSecurityToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
