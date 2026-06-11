import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initialInventory } from './domain/sampleData'
import { useInventorySync } from './hooks/useInventorySync'
import App from './App'

vi.mock('./hooks/useInventorySync', () => ({
  useInventorySync: vi.fn(),
}))

describe('App mobile login', () => {
  const login = vi.fn()
  const registerStart = vi.fn()
  const registerVerify = vi.fn()

  beforeEach(() => {
    vi.stubEnv('VITE_ADMIN_EMAIL', '49703878@qq.com')
    vi.mocked(useInventorySync).mockReturnValue({
      inventory: initialInventory,
      loading: false,
      error: '请先登录后同步服务器数据',
      authRequired: true,
      login,
      registerStart,
      registerVerify,
      refresh: vi.fn(),
      createItem: vi.fn(),
      moveItem: vi.fn(),
      archiveItem: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('shows a manual login form without a bundled password', async () => {
    const user = userEvent.setup()

    render(<App />)

    expect(screen.getByRole('heading', { name: '登录后同步' })).toBeInTheDocument()
    expect(screen.getByLabelText('邮箱')).toHaveValue('49703878@qq.com')
    expect(screen.getByLabelText('密码')).toHaveValue('')

    await user.type(screen.getByLabelText('密码'), 'new-password-123')
    await user.click(screen.getByRole('button', { name: '登录同步' }))

    expect(login).toHaveBeenCalledWith('49703878@qq.com', 'new-password-123')
  })

  it('starts create-home registration and verifies the email code', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: '注册' }))
    await user.clear(screen.getByLabelText('邮箱'))
    await user.type(screen.getByLabelText('邮箱'), 'new-family@example.com')
    await user.type(screen.getByLabelText('密码'), 'new-password-123')
    await user.type(screen.getByLabelText('昵称'), '张三')
    await user.type(screen.getByLabelText('家庭名称'), '张三家')
    await user.click(screen.getByRole('button', { name: '发送验证码' }))

    expect(registerStart).toHaveBeenCalledWith({
      email: 'new-family@example.com',
      password: 'new-password-123',
      displayName: '张三',
      homeName: '张三家',
      inviteCode: undefined,
    })

    await user.type(screen.getByLabelText('邮箱验证码'), '123456')
    await user.click(screen.getByRole('button', { name: '完成注册' }))

    expect(registerVerify).toHaveBeenCalledWith('new-family@example.com', '123456')
  })

  it('starts join-home registration with an invitation code', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: '注册' }))
    await user.click(screen.getByRole('button', { name: '邀请码加入' }))
    await user.clear(screen.getByLabelText('邮箱'))
    await user.type(screen.getByLabelText('邮箱'), 'joiner@example.com')
    await user.type(screen.getByLabelText('密码'), 'new-password-123')
    await user.type(screen.getByLabelText('昵称'), '李四')
    await user.type(screen.getByLabelText('邀请码'), 'invite-code')
    await user.click(screen.getByRole('button', { name: '发送验证码' }))

    expect(registerStart).toHaveBeenCalledWith({
      email: 'joiner@example.com',
      password: 'new-password-123',
      displayName: '李四',
      homeName: undefined,
      inviteCode: 'invite-code',
    })
  })
})
