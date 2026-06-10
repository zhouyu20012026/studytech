import { describe, expect, it } from 'vitest'
import { moveItem, searchItems } from './inventory'
import type { InventoryState } from './types'

const state: InventoryState = {
  home: {
    id: 'home-1',
    name: '周家',
  },
  members: [
    { id: 'u-1', name: '妈妈', role: 'admin' },
    { id: 'u-2', name: '爸爸', role: 'member' },
  ],
  areas: [
    { id: 'area-bedroom', name: '卧室', sortOrder: 1 },
    { id: 'area-living', name: '客厅', sortOrder: 2 },
  ],
  locations: [
    {
      id: 'loc-nightstand',
      areaId: 'area-bedroom',
      name: '床头柜第一层',
      isCommon: true,
    },
    {
      id: 'loc-tv',
      areaId: 'area-living',
      name: '电视柜左抽屉',
      isCommon: true,
    },
  ],
  items: [
    {
      id: 'item-passport',
      name: '护照',
      category: '证件',
      note: '蓝色文件袋里',
      locationId: 'loc-nightstand',
      createdBy: 'u-1',
      updatedBy: 'u-1',
      createdAt: '2026-06-01T09:00:00.000Z',
      updatedAt: '2026-06-09T20:30:00.000Z',
      status: 'active',
    },
    {
      id: 'item-cable',
      name: '充电线',
      category: '电子配件',
      note: '黑色 Type-C 备用线',
      locationId: 'loc-tv',
      createdBy: 'u-2',
      updatedBy: 'u-2',
      createdAt: '2026-06-02T09:00:00.000Z',
      updatedAt: '2026-06-03T20:30:00.000Z',
      status: 'active',
    },
  ],
  movements: [],
}

describe('inventory search', () => {
  it('matches item names, notes, categories, and locations with strongest results first', () => {
    expect(searchItems(state, '护照')[0].item.id).toBe('item-passport')
    expect(searchItems(state, '蓝色文件袋')[0].item.id).toBe('item-passport')
    expect(searchItems(state, '电子')[0].item.id).toBe('item-cable')
    expect(searchItems(state, '电视柜')[0].item.id).toBe('item-cable')
  })
})

describe('item movement', () => {
  it('updates current location and records who moved the item', () => {
    const nextState = moveItem(state, {
      itemId: 'item-passport',
      toLocationId: 'loc-tv',
      movedBy: 'u-2',
      movedAt: '2026-06-10T08:00:00.000Z',
      note: '临时拿到客厅使用',
    })

    expect(nextState.items.find((item) => item.id === 'item-passport')).toMatchObject({
      locationId: 'loc-tv',
      updatedBy: 'u-2',
      updatedAt: '2026-06-10T08:00:00.000Z',
    })
    expect(nextState.movements).toHaveLength(1)
    expect(nextState.movements[0]).toMatchObject({
      itemId: 'item-passport',
      fromLocationId: 'loc-nightstand',
      toLocationId: 'loc-tv',
      movedBy: 'u-2',
      movedAt: '2026-06-10T08:00:00.000Z',
      note: '临时拿到客厅使用',
    })
  })
})
