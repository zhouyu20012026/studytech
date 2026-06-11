import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../api/client'
import { initialInventory } from '../domain/sampleData'
import { useInventorySync } from './useInventorySync'

vi.mock('../api/client', () => ({
  apiClient: {
    login: vi.fn(),
    getInventory: vi.fn(),
    createItem: vi.fn(),
    moveItem: vi.fn(),
    archiveItem: vi.fn(),
    hasToken: vi.fn(),
    registerStart: vi.fn(),
    registerVerify: vi.fn(),
    getMe: vi.fn(),
  },
}))

describe('useInventorySync', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(apiClient.hasToken).mockReturnValue(false)
    vi.mocked(apiClient.getInventory).mockRejectedValue(new Error('Authentication required'))
  })

  it('requires manual login when there is no saved session', async () => {
    const { result } = renderHook(() => useInventorySync())

    await waitFor(() => expect(result.current.authRequired).toBe(true))
    await waitFor(() => expect(result.current.error).toBe('请先登录后同步服务器数据'))

    expect(result.current.inventory.home.name).toBe(initialInventory.home.name)
    expect(apiClient.login).not.toHaveBeenCalled()
  })

  it('logs in manually and refreshes server inventory', async () => {
    vi.mocked(apiClient.login).mockResolvedValue({
      token: 'test-token',
      user: { id: 'user-admin', email: '49703878@qq.com', homeId: 'home-1' },
      activeHome: { id: 'home-1', name: '周家' },
      membership: { id: 'membership-admin', homeId: 'home-1', displayName: '管理员', role: 'owner' },
    })
    vi.mocked(apiClient.getInventory).mockResolvedValue(initialInventory)
    const { result } = renderHook(() => useInventorySync())

    await waitFor(() => expect(result.current.authRequired).toBe(true))

    await act(async () => {
      await result.current.login('49703878@qq.com', 'new-password-123')
    })

    expect(apiClient.login).toHaveBeenCalledWith('49703878@qq.com', 'new-password-123')
    expect(result.current.authRequired).toBe(false)
    expect(result.current.error).toBeNull()
    expect(localStorage.getItem('home_inventory_cache:home-1')).toBeTruthy()
  })
})
