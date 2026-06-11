import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initialInventory } from '../domain/sampleData'
import { apiClient } from '../api/client'
import { AdminApp } from './AdminApp'

vi.mock('../api/client', () => ({
  apiClient: {
    login: vi.fn(),
    getInventory: vi.fn(),
    getAdminSummary: vi.fn(),
    getSecurityLogs: vi.fn(),
    getHomeMembers: vi.fn(),
    createInvitation: vi.fn(),
    archiveItem: vi.fn(),
  },
}))

describe('AdminApp', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
  })

  beforeEach(() => {
    vi.mocked(apiClient.login).mockResolvedValue({
      token: 'test-token',
      user: { id: 'user-admin', email: 'admin@example.com', homeId: 'home-1' },
    })
    vi.mocked(apiClient.getInventory).mockResolvedValue(initialInventory)
    vi.mocked(apiClient.getAdminSummary).mockResolvedValue({
      activeItems: 5,
      archivedItems: 1,
      locations: 6,
      members: 3,
      recentMovements: initialInventory.movements,
    })
    vi.mocked(apiClient.getSecurityLogs).mockResolvedValue([])
    vi.mocked(apiClient.getHomeMembers).mockResolvedValue([
      { id: 'membership-admin', displayName: '管理员', email: 'admin@example.com', role: 'owner', status: 'active', createdAt: '2026-06-11T00:00:00.000Z' },
    ])
    vi.mocked(apiClient.createInvitation).mockResolvedValue({
      code: 'invite-code',
      invitation: { id: 'invite-1', homeId: 'home-1', role: 'member', expiresAt: '2026-06-18T00:00:00.000Z', maxUses: 1, usedCount: 0 },
    })
    vi.mocked(apiClient.archiveItem).mockResolvedValue(initialInventory)
  })

  it('loads inventory metrics, item rows, and archives an item', async () => {
    const user = userEvent.setup()

    render(<AdminApp />)

    expect(await screen.findByRole('heading', { name: '周家后台' })).toBeInTheDocument()
    expect(screen.getByText('在用物品')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '护照' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '卧室 - 床头柜第一层' })).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: '归档' })[0])

    expect(apiClient.archiveItem).toHaveBeenCalledWith('item-passport')
    await waitFor(() => expect(apiClient.getInventory).toHaveBeenCalledTimes(2))
  })

  it('shows members and creates an invitation code', async () => {
    const user = userEvent.setup()

    render(<AdminApp />)

    expect(await screen.findByRole('heading', { name: '成员与邀请' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '管理员' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'admin@example.com' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '生成邀请码' }))

    expect(apiClient.createInvitation).toHaveBeenCalledWith('home-1', { role: 'member', expiresInDays: 7, maxUses: 1 })
    expect(await screen.findByText('invite-code')).toBeInTheDocument()
  })

  it('shows the login form when the server rejects the initial load', async () => {
    vi.mocked(apiClient.getInventory).mockRejectedValueOnce(new Error('Authentication required'))

    render(<AdminApp />)

    expect(await screen.findByRole('heading', { name: '后台安全登录' })).toBeInTheDocument()
    expect(screen.getByLabelText('邮箱')).toHaveValue('admin@example.com')
    expect(screen.getByLabelText('密码')).toHaveValue('')
  })

  it('prefills the login email from environment config', async () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', '49703878@qq.com')
    vi.mocked(apiClient.getInventory).mockRejectedValueOnce(new Error('Authentication required'))

    render(<AdminApp />)

    expect(await screen.findByLabelText('邮箱')).toHaveValue('49703878@qq.com')
  })
})
