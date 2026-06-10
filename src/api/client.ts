import type { CreateItemInput, InventoryState, LoginResponse, MoveItemInput } from '../domain/types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'
const tokenKey = 'home_inventory_token'

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(tokenKey)
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    const message = errorBody?.error?.message ?? 'Request failed'
    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export const apiClient = {
  async login(email: string, password: string, captcha?: string) {
    const response = await requestJson<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, captcha }),
    })
    localStorage.setItem(tokenKey, response.token)
    return response
  },
  logout() {
    localStorage.removeItem(tokenKey)
  },
  hasToken() {
    return Boolean(localStorage.getItem(tokenKey))
  },
  getInventory() {
    return requestJson<InventoryState>('/api/inventory')
  },
  createItem(input: CreateItemInput) {
    return requestJson<InventoryState>('/api/items', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  moveItem(itemId: string, input: MoveItemInput) {
    return requestJson<InventoryState>(`/api/items/${itemId}/move`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  archiveItem(itemId: string) {
    return requestJson<InventoryState>(`/api/items/${itemId}/archive`, {
      method: 'POST',
    })
  },
  forgotPassword(email: string) {
    return requestJson<{ ok: boolean }>('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })
  },
  resetPassword(email: string, code: string, password: string) {
    return requestJson<{ ok: boolean }>('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ email, code, password }) })
  },
  changePassword(currentPassword: string, password: string) {
    return requestJson<{ ok: boolean }>('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, password }) })
  },
  logoutAll() {
    return requestJson<void>('/api/auth/logout-all', { method: 'POST' })
  },
  getSecurityLogs() {
    return requestJson<Array<{ id: string; email: string | null; eventType: string; outcome: string; ip: string | null; createdAt: string }>>('/api/admin/security/logs')
  },
  getAdminSummary() {
    return requestJson<{
      activeItems: number
      archivedItems: number
      locations: number
      members: number
      recentMovements: InventoryState['movements']
    }>('/api/admin/summary')
  },
}
