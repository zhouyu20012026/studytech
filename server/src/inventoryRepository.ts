import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { notFound } from './errors.js'

type ItemStatus = 'active' | 'archived' | 'lost'

type InventoryHome = { id: string; name: string }
type InventoryMember = { id: string; name: string; role: 'admin' | 'member' }
type InventoryArea = { id: string; name: string; sortOrder: number }
type InventoryLocation = { id: string; areaId: string; name: string; isCommon: boolean }
type InventoryItem = {
  id: string
  name: string
  category: string | null
  note: string | null
  imageUrl: string | null
  locationId: string
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  status: ItemStatus
}
type InventoryMovement = {
  id: string
  itemId: string
  fromLocationId: string
  toLocationId: string
  movedBy: string
  movedAt: string
  note: string | null
}

export async function getInventory(homeId: string) {
  const [home, members, areas, locations, items, movements] = await Promise.all([
    query<InventoryHome>('select id, name from homes where id = $1', [homeId]),
    query<InventoryMember>(
      `with membership_members as (
         select id, display_name as name, case when role = 'member' then 'member' else 'admin' end as role
           from home_memberships
          where home_id = $1 and status = 'active'
       ),
       legacy_actor_members as (
         select members.id, members.name, members.role
           from members
          where members.home_id = $1
            and members.id in (
              select created_by from items where home_id = $1
              union
              select updated_by from items where home_id = $1
              union
              select moved_by from movements where home_id = $1
            )
            and not exists (select 1 from membership_members where membership_members.id = members.id)
       )
       select id, name, role from membership_members
       union all
       select id, name, role from legacy_actor_members
       order by name`,
      [homeId],
    ),
    query<InventoryArea>('select id, name, sort_order as "sortOrder" from areas where home_id = $1 order by sort_order', [homeId]),
    query<InventoryLocation>('select id, area_id as "areaId", name, is_common as "isCommon" from locations where home_id = $1 order by name', [homeId]),
    query<InventoryItem>(
      `select id, name, category, note, image_url as "imageUrl", location_id as "locationId",
        created_by as "createdBy", updated_by as "updatedBy", created_at as "createdAt",
        updated_at as "updatedAt", status
       from items where home_id = $1 order by updated_at desc`,
      [homeId],
    ),
    query<InventoryMovement>(
      `select id, item_id as "itemId", from_location_id as "fromLocationId",
        to_location_id as "toLocationId", moved_by as "movedBy", moved_at as "movedAt", note
       from movements where home_id = $1 order by moved_at desc`,
      [homeId],
    ),
  ])

  if (!home.rows[0]) {
    throw notFound('Home not found')
  }

  return {
    home: home.rows[0],
    members: members.rows,
    areas: areas.rows,
    locations: locations.rows,
    items: items.rows,
    movements: movements.rows,
  }
}

export async function createItem(
  homeId: string,
  input: { name: string; locationId: string; category?: string; note?: string; memberId: string },
) {
  const now = new Date().toISOString()
  await query(
    `insert into items (id, home_id, name, category, note, image_url, location_id, created_by, updated_by, created_at, updated_at, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $9, 'active')`,
    [`item-${randomUUID()}`, homeId, input.name, input.category ?? null, input.note ?? null, null, input.locationId, input.memberId, now],
  )
  return getInventory(homeId)
}

export async function moveItem(
  homeId: string,
  itemId: string,
  input: { toLocationId: string; note?: string; memberId: string },
) {
  const current = await query<{ locationId: string }>(
    'select location_id as "locationId" from items where id = $1 and home_id = $2',
    [itemId, homeId],
  )
  const item = current.rows[0]
  if (!item) {
    throw notFound('Item not found')
  }

  const now = new Date().toISOString()
  await query(
    'update items set location_id = $1, updated_by = $2, updated_at = $3 where id = $4 and home_id = $5',
    [input.toLocationId, input.memberId, now, itemId, homeId],
  )

  if (item.locationId !== input.toLocationId) {
    await query(
      `insert into movements (id, home_id, item_id, from_location_id, to_location_id, moved_by, moved_at, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [`move-${randomUUID()}`, homeId, itemId, item.locationId, input.toLocationId, input.memberId, now, input.note ?? null],
    )
  }

  return getInventory(homeId)
}

export async function archiveItem(homeId: string, itemId: string, memberId: string) {
  const result = await query(
    'update items set status = $1, updated_by = $2, updated_at = now() where id = $3 and home_id = $4',
    ['archived', memberId, itemId, homeId],
  )

  if (result.rowCount === 0) {
    throw notFound('Item not found')
  }

  return getInventory(homeId)
}

export async function createLocation(homeId: string, input: { areaId: string; name: string; isCommon: boolean }) {
  await query(
    'insert into locations (id, home_id, area_id, name, is_common) values ($1, $2, $3, $4, $5)',
    [`loc-${randomUUID()}`, homeId, input.areaId, input.name, input.isCommon],
  )
  return getInventory(homeId)
}

export async function getAdminSummary(homeId: string) {
  const inventory = await getInventory(homeId)
  return {
    activeItems: inventory.items.filter((item) => item.status === 'active').length,
    archivedItems: inventory.items.filter((item) => item.status === 'archived').length,
    locations: inventory.locations.length,
    members: inventory.members.length,
    recentMovements: inventory.movements.slice(0, 8),
  }
}
