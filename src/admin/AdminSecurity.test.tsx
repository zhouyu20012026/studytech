import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
})
