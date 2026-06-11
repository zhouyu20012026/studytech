import bcrypt from 'bcryptjs'
import { fileURLToPath } from 'node:url'
import { config } from './config.js'
import { migrate, pool } from './db.js'
import { createMembership } from './memberships.js'
import { initialInventory } from './seedData.js'

export async function seedDatabase(options: { closePool?: boolean } = {}) {
  const client = await pool.connect()

  try {
    await client.query('begin')

    await client.query('insert into homes (id, name, status, created_at) values ($1, $2, $3, now()) on conflict (id) do update set name = excluded.name, status = excluded.status', [
      initialInventory.home.id,
      initialInventory.home.name,
      'active',
    ])

    for (const member of initialInventory.members) {
      await client.query(
        'insert into members (id, home_id, name, role) values ($1, $2, $3, $4) on conflict (id) do update set name = excluded.name, role = excluded.role',
        [member.id, initialInventory.home.id, member.name, member.role],
      )
    }

    for (const area of initialInventory.areas) {
      await client.query(
        'insert into areas (id, home_id, name, sort_order) values ($1, $2, $3, $4) on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order',
        [area.id, initialInventory.home.id, area.name, area.sortOrder],
      )
    }

    for (const location of initialInventory.locations) {
      await client.query(
        'insert into locations (id, home_id, area_id, name, is_common) values ($1, $2, $3, $4, $5) on conflict (id) do update set area_id = excluded.area_id, name = excluded.name, is_common = excluded.is_common',
        [location.id, initialInventory.home.id, location.areaId, location.name, location.isCommon],
      )
    }

    for (const item of initialInventory.items) {
      await client.query(
        `insert into items (id, home_id, name, category, note, image_url, location_id, created_by, updated_by, created_at, updated_at, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         on conflict (id) do update set name = excluded.name, category = excluded.category, note = excluded.note, image_url = excluded.image_url, location_id = excluded.location_id, updated_by = excluded.updated_by, updated_at = excluded.updated_at, status = excluded.status`,
        [
          item.id,
          initialInventory.home.id,
          item.name,
          item.category ?? null,
          item.note ?? null,
          item.imageUrl ?? null,
          item.locationId,
          item.createdBy,
          item.updatedBy,
          item.createdAt,
          item.updatedAt,
          item.status,
        ],
      )
    }

    for (const movement of initialInventory.movements) {
      await client.query(
        `insert into movements (id, home_id, item_id, from_location_id, to_location_id, moved_by, moved_at, note)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (id) do nothing`,
        [
          movement.id,
          initialInventory.home.id,
          movement.itemId,
          movement.fromLocationId,
          movement.toLocationId,
          movement.movedBy,
          movement.movedAt,
          movement.note ?? null,
        ],
      )
    }

    const passwordHash = await bcrypt.hash(config.ADMIN_PASSWORD, 12)
    await client.query(
      `insert into users (id, email, password_hash, home_id, created_at, status, is_platform_admin, email_verified_at)
       values ($1, $2, $3, $4, now(), 'active', true, now())
       on conflict (id) do update set email = excluded.email, password_hash = excluded.password_hash,
         home_id = excluded.home_id, status = 'active', is_platform_admin = true,
         email_verified_at = coalesce(users.email_verified_at, now())`,
      ['user-admin', config.ADMIN_EMAIL, passwordHash, initialInventory.home.id],
    )

    await client.query('update homes set created_by_user_id = $1 where id = $2 and created_by_user_id is null', ['user-admin', initialInventory.home.id])
    await createMembership(client, {
      id: 'membership-admin',
      homeId: initialInventory.home.id,
      userId: 'user-admin',
      displayName: '管理员',
      role: 'owner',
    })

    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
    if (options.closePool !== false) {
      await pool.end()
    }
  }
}

async function main() {
  await migrate()
  await seedDatabase()
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
