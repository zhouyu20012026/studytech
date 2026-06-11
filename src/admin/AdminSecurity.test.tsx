import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../api/client'
import { AdminApp } from './AdminApp'

vi.mock('../api/client', () => ({
  apiClient: {
    login: vi.fn(),
    getInventory: vi.fn(),
    getAdminSummary: vi.fn(),
    archiveItem: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    changePassword: vi.fn(),
    logoutAll: vi.fn(),
    getSecurityLogs: vi.fn(),
    getHomeMembers: vi.fn(),
    createInvitation: vi.fn(),
  },
}))

describe('AdminApp security controls', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  beforeEach(() => {
    vi.mocked(apiClient.getInventory).mockRejectedValue(new Error('Authentication required'))
    vi.mocked(apiClient.getSecurityLogs).mockResolvedValue([])
    vi.mocked(apiClient.getHomeMembers).mockResolvedValue([])
  })

  it('shows secure login and forgot-password entry points', async () => {
    render(<AdminApp />)

    expect(await screen.findByRole('heading', { name: '后台安全登录' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '忘记密码' })).toBeInTheDocument()
  })

  it('shows a visible message when forgot-password email fails', async () => {
    const user = userEvent.setup()
    vi.mocked(apiClient.forgotPassword).mockRejectedValue(new Error('SMTP failed'))

    render(<AdminApp />)

    await screen.findByRole('heading', { name: '后台安全登录' })
    await user.click(screen.getByRole('button', { name: '忘记密码' }))

    expect(await screen.findByText('验证码发送失败，请检查发信邮箱 SMTP 授权码')).toBeInTheDocument()
  })

  it('explains password requirements and requires matching confirmation', async () => {
    const user = userEvent.setup()
    vi.mocked(apiClient.forgotPassword).mockResolvedValue({ ok: true })

    render(<AdminApp />)

    await screen.findByRole('heading', { name: '后台安全登录' })
    await user.click(screen.getByRole('button', { name: '忘记密码' }))

    expect(await screen.findByText('至少 12 位，建议包含字母和数字。')).toBeInTheDocument()

    await user.type(screen.getByLabelText('邮箱验证码'), '123456')
    await user.type(screen.getByLabelText('新密码'), 'short')
    await user.type(screen.getByLabelText('确认新密码'), 'short')
    await user.click(screen.getByRole('button', { name: '重置密码' }))

    expect(await screen.findByText('新密码至少需要 12 位')).toBeInTheDocument()
    expect(apiClient.resetPassword).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText('新密码'))
    await user.clear(screen.getByLabelText('确认新密码'))
    await user.type(screen.getByLabelText('新密码'), 'new-password-123')
    await user.type(screen.getByLabelText('确认新密码'), 'new-password-456')
    await user.click(screen.getByRole('button', { name: '重置密码' }))

    expect(await screen.findByText('两次输入的新密码不一致')).toBeInTheDocument()
    expect(apiClient.resetPassword).not.toHaveBeenCalled()
  })
})
