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
  const [email, setEmail] = useState(() => import.meta.env.VITE_ADMIN_EMAIL ?? 'admin@example.com')
  const [password, setPassword] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showReset, setShowReset] = useState(false)
  const [securityLogs, setSecurityLogs] = useState<Array<{ id: string; eventType: string; outcome: string; createdAt: string }>>([])
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
      const [nextInventory, nextSummary, nextLogs] = await Promise.all([apiClient.getInventory(), apiClient.getAdminSummary(), apiClient.getSecurityLogs().catch(() => [])])
      setInventory(nextInventory)
      setSummary(nextSummary)
      setSecurityLogs(nextLogs)
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

  async function requestReset() {
    setError(null)
    await apiClient.forgotPassword(email)
    setShowReset(true)
  }

  async function resetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    try {
      await apiClient.resetPassword(email, resetCode, newPassword)
      setShowReset(false)
      setPassword('')
      setNewPassword('')
      setResetCode('')
      setError('密码已重置，请使用新密码登录')
    } catch {
      setError('验证码无效或新密码不符合要求')
    }
  }

  async function archive(itemId: string) {
    await apiClient.archiveItem(itemId)
    await load()
  }

  if (!inventory) {
    return (
      <main className="admin-shell">
        <form className="admin-login" onSubmit={showReset ? resetPassword : login}>
          <h1>后台安全登录</h1>
          {error && <p className="admin-error">{error}</p>}
          <label>
            邮箱
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          {showReset ? (
            <>
              <label>
                邮箱验证码
                <input value={resetCode} onChange={(event) => setResetCode(event.target.value)} />
              </label>
              <label>
                新密码
                <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              </label>
              <button type="submit" disabled={loading}>重置密码</button>
            </>
          ) : (
            <>
              <label>
                密码
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
              <button type="submit" disabled={loading}>登录</button>
            </>
          )}
          <button type="button" className="admin-link-button" onClick={() => void requestReset()}>忘记密码</button>
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
        <h2>安全日志</h2>
        <ul className="movement-list">
          {securityLogs.slice(0, 8).map((log) => (
            <li key={log.id}>
              <span>{log.eventType}</span>
              <span>{log.outcome}</span>
            </li>
          ))}
        </ul>
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
