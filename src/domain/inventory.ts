import type { InventoryState, Item, ItemSearchResult, Location } from './types'

export function getAreaName(state: InventoryState, areaId: string): string {
  return state.areas.find((area) => area.id === areaId)?.name ?? '未知区域'
}

export function getLocation(state: InventoryState, locationId: string): Location | undefined {
  return state.locations.find((location) => location.id === locationId)
}

export function getLocationLabel(state: InventoryState, locationId: string): string {
  const location = getLocation(state, locationId)

  if (!location) {
    return '位置已归档'
  }

  return `${getAreaName(state, location.areaId)} - ${location.name}`
}

export function getMemberName(state: InventoryState, memberId: string): string {
  return state.members.find((member) => member.id === memberId)?.name ?? '未知成员'
}

export function getRecentActiveItems(state: InventoryState, count = 4): Item[] {
  return [...state.items]
    .filter((item) => item.status === 'active')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, count)
}

export function searchItems(state: InventoryState, query: string): ItemSearchResult[] {
  const normalized = normalize(query)

  if (!normalized) {
    return getRecentActiveItems(state, 8).map((item) => ({
      item,
      score: 1,
      matchedBy: ['最近更新'],
    }))
  }

  return state.items
    .filter((item) => item.status === 'active')
    .map((item) => scoreItem(state, item, normalized))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || b.item.updatedAt.localeCompare(a.item.updatedAt))
}

export function moveItem(
  state: InventoryState,
  input: {
    itemId: string
    toLocationId: string
    movedBy: string
    movedAt: string
    note?: string
  },
): InventoryState {
  const item = state.items.find((candidate) => candidate.id === input.itemId)

  if (!item) {
    return state
  }

  if (item.locationId === input.toLocationId) {
    return {
      ...state,
      items: state.items.map((candidate) =>
        candidate.id === item.id
          ? {
              ...candidate,
              updatedBy: input.movedBy,
              updatedAt: input.movedAt,
            }
          : candidate,
      ),
    }
  }

  const movement = {
    id: `move-${input.itemId}-${input.movedAt}`,
    itemId: input.itemId,
    fromLocationId: item.locationId,
    toLocationId: input.toLocationId,
    movedBy: input.movedBy,
    movedAt: input.movedAt,
    note: input.note,
  }

  return {
    ...state,
    items: state.items.map((candidate) =>
      candidate.id === item.id
        ? {
            ...candidate,
            locationId: input.toLocationId,
            updatedBy: input.movedBy,
            updatedAt: input.movedAt,
          }
        : candidate,
    ),
    movements: [movement, ...state.movements],
  }
}

function scoreItem(state: InventoryState, item: Item, query: string): ItemSearchResult {
  const location = getLocation(state, item.locationId)
  const areaName = location ? getAreaName(state, location.areaId) : ''
  const fields = [
    { label: '名称', value: item.name, weight: 80 },
    { label: '备注', value: item.note ?? '', weight: 48 },
    { label: '类别', value: item.category ?? '', weight: 40 },
    { label: '位置', value: location?.name ?? '', weight: 36 },
    { label: '区域', value: areaName, weight: 28 },
  ]

  return fields.reduce<ItemSearchResult>(
    (result, field) => {
      const value = normalize(field.value)

      if (!value) {
        return result
      }

      if (value === query) {
        return {
          ...result,
          score: result.score + field.weight + 20,
          matchedBy: [...result.matchedBy, field.label],
        }
      }

      if (value.includes(query)) {
        return {
          ...result,
          score: result.score + field.weight,
          matchedBy: [...result.matchedBy, field.label],
        }
      }

      if (query.includes(value) && value.length >= 2) {
        return {
          ...result,
          score: result.score + Math.round(field.weight * 0.65),
          matchedBy: [...result.matchedBy, field.label],
        }
      }

      return result
    },
    { item, score: 0, matchedBy: [] },
  )
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

