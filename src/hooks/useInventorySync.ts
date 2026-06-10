import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '../api/client'
import { initialInventory } from '../domain/sampleData'
import type { CreateItemInput, InventoryState, MoveItemInput } from '../domain/types'

const cacheKey = 'home_inventory_cache'

function readCachedInventory(): InventoryState {
  const cached = localStorage.getItem(cacheKey)

  if (!cached) {
    return initialInventory
  }

  try {
    return JSON.parse(cached) as InventoryState
  } catch {
    return initialInventory
  }
}

function persistInventory(nextInventory: InventoryState) {
  localStorage.setItem(cacheKey, JSON.stringify(nextInventory))
}

export function useInventorySync() {
  const [inventory, setInventory] = useState<InventoryState>(() => readCachedInventory())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [authRequired, setAuthRequired] = useState(() => !apiClient.hasToken())

  const ensureSession = useCallback(async () => {
    if (apiClient.hasToken()) {
      setAuthRequired(false)
      return
    }

    setAuthRequired(true)
    throw new Error('Authentication required')
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      await ensureSession()
      const nextInventory = await apiClient.getInventory()
      setInventory(nextInventory)
      persistInventory(nextInventory)
      setAuthRequired(false)
    } catch (error) {
      if (error instanceof Error && error.message === 'Authentication required') {
        setAuthRequired(true)
        setError('请先登录后同步服务器数据')
      } else {
        setError('无法连接服务器，正在显示本机缓存')
      }
    } finally {
      setLoading(false)
    }
  }, [ensureSession])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function createItem(input: CreateItemInput) {
    try {
      setError(null)
      await ensureSession()
      const nextInventory = await apiClient.createItem(input)
      setInventory(nextInventory)
      persistInventory(nextInventory)
      return nextInventory
    } catch (error) {
      setError('无法保存到服务器，正在显示本机缓存')
      throw error
    }
  }

  async function moveItem(itemId: string, input: MoveItemInput) {
    try {
      setError(null)
      await ensureSession()
      const nextInventory = await apiClient.moveItem(itemId, input)
      setInventory(nextInventory)
      persistInventory(nextInventory)
      return nextInventory
    } catch (error) {
      setError('无法保存到服务器，正在显示本机缓存')
      throw error
    }
  }

  async function archiveItem(itemId: string) {
    try {
      setError(null)
      await ensureSession()
      const nextInventory = await apiClient.archiveItem(itemId)
      setInventory(nextInventory)
      persistInventory(nextInventory)
      return nextInventory
    } catch (error) {
      setError('无法保存到服务器，正在显示本机缓存')
      throw error
    }
  }

  async function login(email: string, password: string) {
    setLoading(true)
    setError(null)

    try {
      await apiClient.login(email, password)
      setAuthRequired(false)
      const nextInventory = await apiClient.getInventory()
      setInventory(nextInventory)
      persistInventory(nextInventory)
    } catch (error) {
      setAuthRequired(true)
      setError(error instanceof Error && error.message === 'captcha_required' ? '请先在后台完成验证码登录' : '登录失败，请检查邮箱和密码')
      throw error
    } finally {
      setLoading(false)
    }
  }

  return { inventory, loading, error, authRequired, login, refresh, createItem, moveItem, archiveItem }
}
