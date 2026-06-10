import { describe, expect, it } from 'vitest'
import { hashSecurityToken, makeResetCode } from '../security/tokenService.js'

describe('security helpers', () => {
  it('hashes reset tokens deterministically', () => {
    expect(hashSecurityToken('abc')).toBe(hashSecurityToken('abc'))
  })

  it('generates six digit reset codes', () => {
    expect(makeResetCode()).toMatch(/^\d{6}$/)
  })
})
