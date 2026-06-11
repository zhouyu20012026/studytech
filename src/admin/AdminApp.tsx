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

type HomeMember = {
  id: string
  displayName: string
  email: string
  role: string
  status: string
  createdAt: string
}

export function AdminApp() {
  const [email, setEmail] = useState(() => import.meta.env.VITE_ADMIN_EMAIL ?? 'admin@example.com')
  const [password, setPassword] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showReset, setShowReset] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [members, setMembers] = useState<HomeMember[]>([])
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member')
  const [inviteMaxUses, setInviteMaxUses] = useState(1)
  const [inviteDays, setInviteDays] = useState(1)
  const [inviteCode, setInviteCode] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [locationAreaId, setLocationAreaId] = useState('')
  const [locationName, setLocationName] = useState('')
  const [locationDescription, setLocationDescription] = useState('')
  const [inventory, setInventory] = useState<InventoryState | null>(null)
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const activeItems = useMemo(() => inventory?.items.filter((item) => item.status === 'active') ?? [], [inventory])
  const recentMovements = summary?.recentMovements ?? inventory?.movements.slice(0, 8) ?? []

  async function load(options: { afterLogin?: boolean } = {}) {
    setLoading(true)
    setError(null)

    try {
      const nextInventory = await apiClient.getInventory()
      setLocationAreaId((current) => current || nextInventory.areas[0]?.id || '')
      const [nextSummary, nextMembers] = await Promise.all([
        apiClient.getAdminSummary(),
        apiClient.getHomeMembers(nextInventory.home.id).catch(() => []),
      ])
      setInventory(nextInventory)
      setSummary(nextSummary)
      setMembers(nextMembers)
    } catch {
      setInventory(null)
      setSummary(null)
      setMembers([])
      setError(options.afterLogin ? '登录成功，但后台数据读取失败，请稍后刷新或联系管理员' : '无法读取服务器数据，请先登录')
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
      await load({ afterLogin: true })
    } catch {
      setError('登录失败，请检查邮箱和密码')
    } finally {
      setLoading(false)
    }
  }

  async function requestReset() {
    setError(null)
    setNotice(null)
    setLoading(true)

    try {
      await apiClient.forgotPassword(email)
      setShowReset(true)
      setNotice('验证码已发送，请查看邮箱')
    } catch {
      setError('验证码发送失败，请检查发信邮箱 SMTP 授权码')
    } finally {
      setLoading(false)
    }
  }

  async function resetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (newPassword.length < 12) {
      setError('新密码至少需要 12 位')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致')
      return
    }

    try {
      await apiClient.resetPassword(email, resetCode, newPassword)
      setShowReset(false)
      setPassword('')
      setNewPassword('')
      setConfirmPassword('')
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

  async function saveMember(member: HomeMember) {
    if (!inventory) {
      return
    }
    await apiClient.updateHomeMember(inventory.home.id, member.id, { displayName: member.displayName, role: member.role as 'admin' | 'member' })
    await load()
  }

  async function disableMember(memberId: string) {
    if (!inventory) {
      return
    }
    await apiClient.disableHomeMember(inventory.home.id, memberId)
    await load()
  }

  async function createCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!categoryName.trim()) {
      return
    }
    const nextInventory = await apiClient.createCategory({ name: categoryName.trim() })
    setInventory(nextInventory)
    setCategoryName('')
  }

  async function createLocation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!locationAreaId || !locationName.trim()) {
      return
    }
    const nextInventory = await apiClient.createLocation({
      areaId: locationAreaId,
      name: locationName.trim(),
      description: locationDescription.trim() || undefined,
      isCommon: true,
    })
    setInventory(nextInventory)
    setLocationName('')
    setLocationDescription('')
  }

  async function createInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!inventory) {
      return
    }

    setInviteCode('')
    const response = await apiClient.createInvitation(inventory.home.id, {
      role: inviteRole,
      expiresInDays: inviteDays,
      maxUses: inviteMaxUses,
    })
    setInviteCode(response.code)
  }

  if (!inventory) {
    return (
      <main className="admin-shell">
        <form className="admin-login" onSubmit={showReset ? resetPassword : login}>
          <h1>后台安全登录</h1>
          {error && <p className="admin-error">{error}</p>}
          {notice && <p className="admin-notice">{notice}</p>}
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
              <p className="admin-help">至少 12 位，建议包含字母和数字。</p>
              <label>
                确认新密码
                <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
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
                      隐藏
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-title">
          <h2>成员与邀请</h2>
          <span>{members.length} 个账号</span>
        </div>
        <div className="admin-split">
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>昵称</th>
                  <th>邮箱</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <input
                        aria-label={`昵称-${member.email}`}
                        value={member.displayName}
                        onChange={(event) => setMembers((current) => current.map((next) => (next.id === member.id ? { ...next, displayName: event.target.value } : next)))}
                      />
                    </td>
                    <td>{member.email}</td>
                    <td>
                      {member.role === 'owner' ? (
                        'owner'
                      ) : (
                        <select
                          aria-label={`角色-${member.email}`}
                          value={member.role}
                          onChange={(event) => setMembers((current) => current.map((next) => (next.id === member.id ? { ...next, role: event.target.value } : next)))}
                        >
                          <option value="member">member</option>
                          <option value="admin">admin</option>
                        </select>
                      )}
                    </td>
                    <td>{member.status}</td>
                    <td>
                      <button type="button" onClick={() => void saveMember(member)} disabled={member.role === 'owner'}>
                        保存
                      </button>
                      <button type="button" className="danger-inline" onClick={() => void disableMember(member.id)} disabled={member.role === 'owner' || member.status === 'disabled'}>
                        禁用
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form className="invite-form" onSubmit={createInvitation}>
            <h3>创建邀请码</h3>
            <label>
              角色
              <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as 'admin' | 'member')}>
                <option value="member">成员</option>
                <option value="admin">管理员</option>
              </select>
            </label>
            <label>
              邀请码有效期
              <input type="number" min={1} max={30} value={inviteDays} onChange={(event) => setInviteDays(Number(event.target.value))} />
            </label>
            <p className="admin-help">默认 1 天，仅限制邀请码使用时间；成员加入后长期有效，可在成员管理中禁用。</p>
            <label>
              可用次数
              <input type="number" min={1} max={100} value={inviteMaxUses} onChange={(event) => setInviteMaxUses(Number(event.target.value))} />
            </label>
            <button type="submit">生成邀请码</button>
            {inviteCode && <output className="invite-code">{inviteCode}</output>}
          </form>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-title">
          <h2>类别与位置</h2>
          <span>{inventory.categories?.filter((category) => category.status === 'active').length ?? 0} 个类别 / {inventory.locations.length} 个位置</span>
        </div>
        <div className="admin-split">
          <form className="invite-form" onSubmit={createCategory}>
            <h3>新增物品类别</h3>
            <label>
              类别名称
              <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
            </label>
            <button type="submit">保存类别</button>
            <ul className="compact-list">
              {(inventory.categories ?? []).map((category) => <li key={category.id}>{category.name}</li>)}
            </ul>
          </form>
          <form className="invite-form" onSubmit={createLocation}>
            <h3>新增位置</h3>
            <label>
              区域
              <select value={locationAreaId} onChange={(event) => setLocationAreaId(event.target.value)}>
                {inventory.areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
              </select>
            </label>
            <label>
              位置名称
              <input value={locationName} onChange={(event) => setLocationName(event.target.value)} />
            </label>
            <label>
              位置描述
              <input value={locationDescription} onChange={(event) => setLocationDescription(event.target.value)} />
            </label>
            <button type="submit">保存位置</button>
          </form>
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
