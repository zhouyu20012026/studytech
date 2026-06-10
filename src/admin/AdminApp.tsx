import { useEffect, useMemo, useState } from 'react'
import { apiClient } from '../api/client'
import { getLocationLabel, getMemberName } from '../domain/inventory'
import type { InventoryState } from '../domain/types'
import './AdminApp.css'

type AdminSummary = {
  activeItems: number
  archivedItems: number
  locations: number
  members: number
  recentMovements: InventoryState['movements']
}

export function AdminApp() {
  const [email, setEmail] = useState('admin@example.com')
  const [password, setPassword] = useState('admin12345')
  const [inventory, setInventory] = useState<InventoryState | null>(null)
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const activeItems = useMemo(() => inventory?.items.filter((item) => item.status === 'active') ?? [], [inventory])
  const recentMovements = summary?.recentMovements ?? inventory?.movements.slice(0, 8) ?? []

  async function load() {
    setLoading(true)
    setError(null)

    try {
      const [nextInventory, nextSummary] = await Promise.all([apiClient.getInventory(), apiClient.getAdminSummary()])
      setInventory(nextInventory)
      setSummary(nextSummary)
    } catch {
      setInventory(null)
      setSummary(null)
      setError('无法读取服务器数据，请先登录')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      await apiClient.login(email, password)
      await load()
    } catch {
      setError('登录失败，请检查邮箱和密码')
    } finally {
      setLoading(false)
    }
  }

  async function archive(itemId: string) {
    await apiClient.archiveItem(itemId)
    await load()
  }

  if (!inventory) {
    return (
      <main className="admin-shell">
        <form className="admin-login" onSubmit={login}>
          <h1>家庭物品后台</h1>
          {error && <p className="admin-error">{error}</p>}
          <label>
            邮箱
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            密码
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button type="submit" disabled={loading}>
            登录
          </button>
        </form>
      </main>
    )
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <span className="admin-kicker">后台管理</span>
          <h1>{inventory.home.name}后台</h1>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}>
          刷新
        </button>
      </header>

      <section className="admin-metrics" aria-label="库存指标">
        <article>
          <strong>{summary?.activeItems ?? 0}</strong>
          <span>在用物品</span>
        </article>
        <article>
          <strong>{summary?.archivedItems ?? 0}</strong>
          <span>已归档</span>
        </article>
        <article>
          <strong>{summary?.locations ?? 0}</strong>
          <span>位置</span>
        </article>
        <article>
          <strong>{summary?.members ?? 0}</strong>
          <span>成员</span>
        </article>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-title">
          <h2>物品管理</h2>
          <span>{activeItems.length} 件在用</span>
        </div>
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>名称</th>
                <th>类别</th>
                <th>位置</th>
                <th>更新人</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {activeItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.category ?? '-'}</td>
                  <td>{getLocationLabel(inventory, item.locationId)}</td>
                  <td>{getMemberName(inventory, item.updatedBy)}</td>
                  <td>
                    <button type="button" onClick={() => void archive(item.id)}>
                      归档
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-panel">
        <h2>最近移动</h2>
        <ul className="movement-list">
          {recentMovements.map((movement) => (
            <li key={movement.id}>
              <span>{getMemberName(inventory, movement.movedBy)}</span>
              <span>移动到 {getLocationLabel(inventory, movement.toLocationId)}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
