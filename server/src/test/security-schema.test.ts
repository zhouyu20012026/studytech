import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('security schema', () => {
  it('declares reset token and audit log tables', async () => {
    const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8')
    expect(schema).toContain('create table if not exists password_reset_tokens')
    expect(schema).toContain('create table if not exists admin_audit_logs')
  })
})
