import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Archive,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Home,
  MapPin,
  PackagePlus,
  Search,
  Settings2,
  Users,
} from 'lucide-react'
import './App.css'
import { getLocationLabel, getMemberName, getRecentActiveItems, searchItems } from './domain/inventory'
import type { CreateItemInput, InventoryState, Item, MoveItemInput } from './domain/types'
import { useInventorySync } from './hooks/useInventorySync'

type View = 'home' | 'add' | 'locations' | 'detail'

function App() {
  const { inventory, loading, error, createItem, moveItem, archiveItem } = useInventorySync()
  const [view, setView] = useState<View>('home')
  const [query, setQuery] = useState('')
  const [selectedItemId, setSelectedItemId] = useState('item-passport')
  const [foundCount, setFoundCount] = useState(0)

  const searchResults = useMemo(() => searchItems(inventory, query), [inventory, query])
  const recentItems = useMemo(() => getRecentActiveItems(inventory), [inventory])
  const selectedItem = inventory.items.find((item) => item.id === selectedItemId) ?? recentItems[0]
  const commonLocations = inventory.locations.filter((location) => location.isCommon)

  function openItem(itemId: string) {
    setSelectedItemId(itemId)
    setView('detail')
  }

  async function addItem(input: CreateItemInput) {
    const nextName = input.name.trim()
    await createItem({
      name: nextName,
      locationId: input.locationId,
      category: input.category?.trim() || undefined,
      note: input.note?.trim() || undefined,
    })
    setQuery(nextName)
    setView('home')
  }

  async function moveSelectedItem(toLocationId: string) {
    if (!selectedItem) {
      return
    }

    await moveItem(selectedItem.id, { toLocationId } satisfies MoveItemInput)
  }

  async function archiveSelectedItem() {
    if (!selectedItem) {
      return
    }

    await archiveItem(selectedItem.id)
    setView('home')
  }

  return (
    <main className="app-shell">
      <section className="phone-frame" aria-label="找物助手原型">
        <header className="app-header">
          <button className="brand-button" type="button" onClick={() => setView('home')}>
            <span className="brand-mark">
              <Home size={18} aria-hidden="true" />
            </span>
            <span>
              <strong>{inventory.home.name}</strong>
              <small>{inventory.members.length} 位成员共享</small>
            </span>
          </button>
          <button className="icon-button" type="button" aria-label="家庭成员">
            <Users size={19} aria-hidden="true" />
          </button>
        </header>
        {(loading || error) && (
          <div className={error ? 'sync-banner error' : 'sync-banner'} role="status" aria-live="polite">
            {error ?? '正在同步服务器数据…'}
          </div>
        )}

        {view === 'home' && (
          <HomeView
            commonLocations={commonLocations}
            foundCount={foundCount}
            inventory={inventory}
            query={query}
            recentItems={recentItems}
            results={searchResults}
            onAdd={() => setView('add')}
            onFound={() => setFoundCount((count) => count + 1)}
            onOpenItem={openItem}
            onQueryChange={setQuery}
            onShowLocations={() => setView('locations')}
          />
        )}

        {view === 'add' && (
          <AddItemView
            inventory={inventory}
            onCancel={() => setView('home')}
            onSave={addItem}
          />
        )}

        {view === 'locations' && (
          <LocationsView inventory={inventory} onDone={() => setView('home')} />
        )}

        {view === 'detail' && selectedItem && (
          <DetailView
            inventory={inventory}
            item={selectedItem}
            onArchive={archiveSelectedItem}
            onBack={() => setView('home')}
            onMove={moveSelectedItem}
          />
        )}
      </section>
    </main>
  )
}

function HomeView(props: {
  commonLocations: InventoryState['locations']
  foundCount: number
  inventory: InventoryState
  query: string
  recentItems: Item[]
  results: ReturnType<typeof searchItems>
  onAdd: () => void
  onFound: () => void
  onOpenItem: (itemId: string) => void
  onQueryChange: (query: string) => void
  onShowLocations: () => void
}) {
  const visibleItems = props.query ? props.results.map((result) => result.item) : props.recentItems

  return (
    <div className="screen">
      <section className="hero-panel">
        <p className="eyebrow">家庭找物助手</p>
        <h1>记录一次，全家都能找</h1>
        <div className="search-box">
          <Search size={20} aria-hidden="true" />
          <input
            aria-label="搜索物品"
            placeholder="找什么东西？比如 护照、蓝色袋子"
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
          />
        </div>
        <div className="hero-actions">
          <button className="primary-button" type="button" onClick={props.onAdd}>
            <PackagePlus size={18} aria-hidden="true" />
            记一个东西
          </button>
          <button className="secondary-button" type="button" onClick={props.onShowLocations}>
            <Settings2 size={18} aria-hidden="true" />
            家里的位置
          </button>
        </div>
      </section>

      <section className="summary-grid" aria-label="家庭概览">
        <Metric label="已记录" value={`${props.inventory.items.filter((item) => item.status === 'active').length}`} />
        <Metric label="常用位置" value={`${props.commonLocations.length}`} />
        <Metric label="已找到" value={`${props.foundCount}`} />
      </section>

      <section className="section-block">
        <div className="section-title">
          <h2>{props.query ? '搜索结果' : '最近更新'}</h2>
          <span>{visibleItems.length} 个</span>
        </div>
        {visibleItems.length > 0 ? (
          <div className="item-list">
            {visibleItems.map((item) => (
              <ItemRow
                inventory={props.inventory}
                item={item}
                key={item.id}
                onFound={props.onFound}
                onOpen={() => props.onOpenItem(item.id)}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Boxes size={34} aria-hidden="true" />
            <strong>没找到相关物品</strong>
            <p>可以试试更短的词，比如“证件”，或者现在把它记下来。</p>
            <button className="secondary-button" type="button" onClick={props.onAdd}>
              新增这个物品
            </button>
          </div>
        )}
      </section>

      <section className="section-block">
        <div className="section-title">
          <h2>常用位置</h2>
          <span>快速选择</span>
        </div>
        <div className="location-chips">
          {props.commonLocations.map((location) => (
            <button className="location-chip" key={location.id} type="button">
              <MapPin size={15} aria-hidden="true" />
              {getLocationLabel(props.inventory, location.id)}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function AddItemView(props: {
  inventory: InventoryState
  onCancel: () => void
  onSave: (input: CreateItemInput) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [locationId, setLocationId] = useState(props.inventory.locations[0]?.id ?? '')
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!name.trim() || !locationId) {
      return
    }

    setSaving(true)
    try {
      await props.onSave({
        name: name.trim(),
        locationId,
        category: category.trim() || undefined,
        note: note.trim() || undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="screen form-screen" onSubmit={submit}>
      <div className="page-heading">
        <p className="eyebrow">新增物品</p>
        <h1>只填名称和位置就能保存</h1>
      </div>

      <label className="field">
        <span>物品名称</span>
        <input
          autoFocus
          placeholder="比如：护照、钥匙、充电线"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label className="field">
        <span>放在哪里</span>
        <select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
          {props.inventory.locations.map((location) => (
            <option key={location.id} value={location.id}>
              {getLocationLabel(props.inventory, location.id)}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>类别，可选</span>
        <input
          placeholder="证件、药品、电子配件"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        />
      </label>

      <label className="field">
        <span>备注，可选</span>
        <textarea
          placeholder="比如：蓝色文件袋里、小铁盒里"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      <div className="button-row sticky-actions">
        <button className="secondary-button" type="button" onClick={props.onCancel}>
          取消
        </button>
        <button className="primary-button" disabled={!name.trim() || saving} type="submit">
          保存位置
        </button>
      </div>
    </form>
  )
}

function LocationsView(props: { inventory: InventoryState; onDone: () => void }) {
  const sortedAreas = [...props.inventory.areas].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div className="screen">
      <div className="page-heading compact">
        <p className="eyebrow">位置体系</p>
        <h1>家里的位置</h1>
        <p>第一版只保留“区域 + 位置点”，让全家能说清楚东西在哪。</p>
      </div>

      <div className="location-tree">
        {sortedAreas.map((area) => (
          <section className="area-group" key={area.id}>
            <h2>{area.name}</h2>
            {props.inventory.locations
              .filter((location) => location.areaId === area.id)
              .map((location) => (
                <div className="location-row" key={location.id}>
                  <MapPin size={17} aria-hidden="true" />
                  <span>{location.name}</span>
                  {location.isCommon && <small>常用</small>}
                </div>
              ))}
          </section>
        ))}
      </div>

      <button className="primary-button full-width" type="button" onClick={props.onDone}>
        完成
      </button>
    </div>
  )
}

function DetailView(props: {
  inventory: InventoryState
  item: Item
  onArchive: () => Promise<void>
  onBack: () => void
  onMove: (toLocationId: string) => Promise<void>
}) {
  const movements = props.inventory.movements.filter((movement) => movement.itemId === props.item.id)

  return (
    <div className="screen">
      <button className="text-button" type="button" onClick={props.onBack}>
        返回首页
      </button>
      <section className="detail-hero">
        <span className="item-initial">{props.item.name.slice(0, 1)}</span>
        <div>
          <p className="eyebrow">{props.item.category ?? '未分类'}</p>
          <h1>{props.item.name}</h1>
          <p>{props.item.note ?? '暂无备注'}</p>
        </div>
      </section>

      <section className="location-card">
        <span>当前位置</span>
        <strong>{getLocationLabel(props.inventory, props.item.locationId)}</strong>
        <small>
          {getMemberName(props.inventory, props.item.updatedBy)} 更新于{' '}
          {formatDate(props.item.updatedAt)}
        </small>
      </section>

      <section className="section-block no-padding">
        <div className="section-title padded">
          <h2>移动到新位置</h2>
          <span>自动留痕</span>
        </div>
        <div className="move-grid">
          {props.inventory.locations.map((location) => (
            <button
              className={location.id === props.item.locationId ? 'move-option active' : 'move-option'}
              key={location.id}
              type="button"
              onClick={() => void props.onMove(location.id)}
            >
              <MapPin size={16} aria-hidden="true" />
              {getLocationLabel(props.inventory, location.id)}
            </button>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-title">
          <h2>位置记录</h2>
          <span>{movements.length} 条</span>
        </div>
        {movements.length > 0 ? (
          <div className="timeline">
            {movements.map((movement) => (
              <div className="timeline-row" key={movement.id}>
                <Clock3 size={16} aria-hidden="true" />
                <p>
                  {getMemberName(props.inventory, movement.movedBy)} 把它从{' '}
                  {getLocationLabel(props.inventory, movement.fromLocationId)} 移到{' '}
                  {getLocationLabel(props.inventory, movement.toLocationId)}
                  <small>{formatDate(movement.movedAt)}</small>
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">还没有移动记录。</p>
        )}
      </section>

      <button className="danger-button full-width" type="button" onClick={() => void props.onArchive()}>
        <Archive size={17} aria-hidden="true" />
        归档这个物品
      </button>
    </div>
  )
}

function ItemRow(props: {
  inventory: InventoryState
  item: Item
  onFound: () => void
  onOpen: () => void
}) {
  return (
    <article className="item-row">
      <button className="item-main" type="button" onClick={props.onOpen}>
        <span className="item-initial small">{props.item.name.slice(0, 1)}</span>
        <span>
          <strong>{props.item.name}</strong>
          <small>{getLocationLabel(props.inventory, props.item.locationId)}</small>
          {props.item.note && <em>{props.item.note}</em>}
        </span>
      </button>
      <div className="item-actions">
        <button className="found-button" type="button" onClick={props.onFound}>
          <CheckCircle2 size={16} aria-hidden="true" />
          我找到了
        </button>
        <button className="icon-button ghost" type="button" aria-label={`查看${props.item.name}`} onClick={props.onOpen}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </article>
  )
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="metric">
      <strong>{props.value}</strong>
      <span>{props.label}</span>
    </div>
  )
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default App
