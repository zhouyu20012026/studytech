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
    updateHomeMember: vi.fn(),
    disableHomeMember: vi.fn(),
    createCategory: vi.fn(),
    createLocation: vi.fn(),
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
      { id: 'membership-member', displayName: '成员甲', email: 'member@example.com', role: 'member', status: 'active', createdAt: '2026-06-11T00:00:00.000Z' },
    ])
    vi.mocked(apiClient.createInvitation).mockResolvedValue({
      code: 'invite-code',
      invitation: { id: 'invite-1', homeId: 'home-1', role: 'member', expiresAt: '2026-06-18T00:00:00.000Z', maxUses: 1, usedCount: 0 },
    })
    vi.mocked(apiClient.updateHomeMember).mockResolvedValue({ id: 'membership-member', displayName: '成员乙', role: 'admin', status: 'active' })
    vi.mocked(apiClient.disableHomeMember).mockResolvedValue({ id: 'membership-member', status: 'disabled' })
    vi.mocked(apiClient.createCategory).mockResolvedValue({ ...initialInventory, categories: [{ id: 'cat-1', name: '证件资料', status: 'active' }] })
    vi.mocked(apiClient.createLocation).mockResolvedValue({
      ...initialInventory,
      locations: [...initialInventory.locations, { id: 'loc-test', areaId: 'area-entry', name: '测试位置', description: '门口左侧柜子第二层', isCommon: true }],
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

    await user.click(screen.getAllByRole('button', { name: '隐藏' })[0])

    expect(apiClient.archiveItem).toHaveBeenCalledWith('item-passport')
    await waitFor(() => expect(apiClient.getInventory).toHaveBeenCalledTimes(2))
  })

  it('shows members, edits members, and creates a one-day invitation code', async () => {
    const user = userEvent.setup()

    render(<AdminApp />)

    expect(await screen.findByRole('heading', { name: '成员与邀请' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '管理员' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'admin@example.com' })).toBeInTheDocument()
    expect(screen.getByText('默认 1 天，仅限制邀请码使用时间；成员加入后长期有效，可在成员管理中禁用。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '生成邀请码' }))

    expect(apiClient.createInvitation).toHaveBeenCalledWith('home-1', { role: 'member', expiresInDays: 1, maxUses: 1 })
    expect(await screen.findByText('invite-code')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('昵称-member@example.com'))
    await user.type(screen.getByLabelText('昵称-member@example.com'), '成员乙')
    await user.selectOptions(screen.getByLabelText('角色-member@example.com'), 'admin')
    await user.click(screen.getAllByRole('button', { name: '保存' })[1])
    expect(apiClient.updateHomeMember).toHaveBeenCalledWith('home-1', 'membership-member', { displayName: '成员乙', role: 'admin' })

    await user.click(screen.getAllByRole('button', { name: '禁用' })[1])
    expect(apiClient.disableHomeMember).toHaveBeenCalledWith('home-1', 'membership-member')
  })

  it('shows category and location management without security logs', async () => {
    const user = userEvent.setup()

    render(<AdminApp />)

    expect(await screen.findByRole('heading', { name: '类别与位置' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '安全日志' })).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('类别名称'), '证件资料')
    await user.click(screen.getByRole('button', { name: '保存类别' }))
    expect(apiClient.createCategory).toHaveBeenCalledWith({ name: '证件资料' })

    await user.type(screen.getByLabelText('位置名称'), '测试位置')
    await user.type(screen.getByLabelText('位置描述'), '门口左侧柜子第二层')
    await user.click(screen.getByRole('button', { name: '保存位置' }))
    expect(apiClient.createLocation).toHaveBeenCalledWith({ areaId: 'area-entry', name: '测试位置', description: '门口左侧柜子第二层', isCommon: true })
  })

  it('shows the login form when the server rejects the initial load', async () => {
    vi.mocked(apiClient.getInventory).mockRejectedValueOnce(new Error('Authentication required'))

    render(<AdminApp />)

    expect(await screen.findByRole('heading', { name: '后台安全登录' })).toBeInTheDocument()
    expect(screen.getByLabelText('邮箱')).toHaveValue('admin@example.com')
    expect(screen.getByLabelText('密码')).toHaveValue('')
  })

  it('does not report a password error when login succeeds but data loading fails', async () => {
    const user = userEvent.setup()
    vi.mocked(apiClient.getInventory)
      .mockRejectedValueOnce(new Error('Authentication required'))
      .mockRejectedValueOnce(new Error('Database migration missing'))

    render(<AdminApp />)

    await screen.findByRole('heading', { name: '后台安全登录' })
    await user.type(screen.getByLabelText('密码'), 'correct-password')
    await user.click(screen.getByRole('button', { name: '登录' }))

    expect(apiClient.login).toHaveBeenCalledWith('admin@example.com', 'correct-password')
    expect(await screen.findByText('登录成功，但后台数据读取失败，请稍后刷新或联系管理员')).toBeInTheDocument()
    expect(screen.queryByText('登录失败，请检查邮箱和密码')).not.toBeInTheDocument()
  })

  it('prefills the login email from environment config', async () => {
    vi.stubEnv('VITE_ADMIN_EMAIL', '49703878@qq.com')
    vi.mocked(apiClient.getInventory).mockRejectedValueOnce(new Error('Authentication required'))

    render(<AdminApp />)

    expect(await screen.findByLabelText('邮箱')).toHaveValue('49703878@qq.com')
  })
})
