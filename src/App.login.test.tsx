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

  beforeEach(() => {
    vi.stubEnv('VITE_ADMIN_EMAIL', '49703878@qq.com')
    vi.mocked(useInventorySync).mockReturnValue({
      inventory: initialInventory,
      loading: false,
      error: '请先登录后同步服务器数据',
      authRequired: true,
      login,
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
})
