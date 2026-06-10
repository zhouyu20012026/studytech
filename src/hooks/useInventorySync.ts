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

function getBootstrapCredentials() {
  const email = import.meta.env.VITE_ADMIN_EMAIL as string | undefined
  const password = import.meta.env.VITE_ADMIN_PASSWORD as string | undefined

  if (!email || !password) {
    return null
  }

  return { email, password }
}

export function useInventorySync() {
  const [inventory, setInventory] = useState<InventoryState>(() => readCachedInventory())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const ensureSession = useCallback(async () => {
    const bootstrapCredentials = getBootstrapCredentials()

    if (localStorage.getItem('home_inventory_token')) {
      return
    }

    if (bootstrapCredentials) {
      await apiClient.login(bootstrapCredentials.email, bootstrapCredentials.password)
      return
    }

    throw new Error('Missing bootstrap credentials')
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      await ensureSession()
      const nextInventory = await apiClient.getInventory()
      setInventory(nextInventory)
      persistInventory(nextInventory)
    } catch {
      setError('无法连接服务器，正在显示本机缓存')
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

  return { inventory, loading, error, refresh, createItem, moveItem, archiveItem }
}
