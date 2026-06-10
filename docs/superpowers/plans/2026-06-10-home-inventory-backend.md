# Home Inventory Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted backend, admin page, and mobile API sync path so household inventory data is stored on the Ubuntu server instead of disappearing when the APK is uninstalled.

**Architecture:** Add a TypeScript Express API under `server/` backed by PostgreSQL and Docker Compose. Keep the existing React app as the mobile UI, add an `/admin` route for larger-screen management, and share the existing inventory domain types between client and server where practical.

**Tech Stack:** React, Vite, Capacitor, Node.js, TypeScript, Express, PostgreSQL, Docker Compose, Vitest.

---

## File Structure

- `server/package.json`: backend scripts and dependencies.
- `server/tsconfig.json`: backend TypeScript config.
- `server/src/index.ts`: Express app bootstrap and HTTP server.
- `server/src/config.ts`: environment parsing.
- `server/src/db.ts`: PostgreSQL pool and query helper.
- `server/src/errors.ts`: JSON API error helpers.
- `server/src/auth.ts`: password/session middleware.
- `server/src/schema.sql`: database schema.
- `server/src/seed.ts`: seed current sample inventory into PostgreSQL.
- `server/src/inventoryRepository.ts`: database reads/writes for homes, members, areas, locations, items, and movements.
- `server/src/routes/authRoutes.ts`: login/logout routes.
- `server/src/routes/inventoryRoutes.ts`: inventory, item, move, archive, and location routes.
- `server/src/routes/adminRoutes.ts`: admin summary route.
- `server/src/test/server.test.ts`: backend API integration tests.
- `src/api/client.ts`: frontend API client.
- `src/hooks/useInventorySync.ts`: app state and server synchronization.
- `src/admin/AdminApp.tsx`: admin dashboard and management page.
- `src/admin/AdminApp.css`: admin styling.
- `src/App.tsx`: replace in-memory-only mutations with sync hook.
- `src/main.tsx`: route `/admin` to admin UI, default route to mobile UI.
- `src/domain/types.ts`: add API input/output types used by client and server.
- `docker-compose.yml`: local/server service composition.
- `server/Dockerfile`: API container build.
- `deploy/nginx.conf`: reverse proxy config.
- `deploy/README.md`: Ubuntu deployment guide.
- `.env.example`: required environment variables.

---

### Task 1: Backend Project Scaffold

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/index.ts`
- Create: `server/src/config.ts`
- Create: `server/src/errors.ts`
- Modify: `package.json`

- [ ] **Step 1: Create backend package**

Create `server/package.json`:

```json
{
  "name": "home-inventory-api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "seed": "tsx src/seed.ts"
  },
  "dependencies": {
    "bcryptjs": "^3.0.2",
    "cors": "^2.8.5",
    "dotenv": "^17.2.3",
    "express": "^5.2.1",
    "pg": "^8.16.3",
    "zod": "^4.1.13"
  },
  "devDependencies": {
    "@types/cors": "^2.8.19",
    "@types/express": "^5.0.6",
    "@types/node": "^24.12.3",
    "@types/pg": "^8.15.6",
    "supertest": "^7.1.4",
    "tsx": "^4.21.0",
    "typescript": "~6.0.2",
    "vitest": "^4.1.8"
  }
}
```

- [ ] **Step 2: Create backend TypeScript config**

Create `server/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Add environment parser**

Create `server/src/config.ts`:

```ts
import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgres://inventory:inventory@localhost:5432/inventory'),
  SESSION_SECRET: z.string().min(16).default('dev-session-secret-change-me'),
  ADMIN_EMAIL: z.string().email().default('admin@example.com'),
  ADMIN_PASSWORD: z.string().min(8).default('admin12345'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
})

export const config = envSchema.parse(process.env)
```

- [ ] **Step 4: Add API error helpers**

Create `server/src/errors.ts`:

```ts
import type { NextFunction, Request, Response } from 'express'

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}

export function notFound(message = 'Resource not found') {
  return new ApiError('not_found', message, 404)
}

export function unauthorized(message = 'Authentication required') {
  return new ApiError('unauthorized', message, 401)
}

export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction) {
  if (error instanceof ApiError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } })
    return
  }

  console.error(error)
  response.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } })
}
```

- [ ] **Step 5: Add Express bootstrap**

Create `server/src/index.ts`:

```ts
import cors from 'cors'
import express from 'express'
import { config } from './config.js'
import { errorHandler } from './errors.js'

export function createApp() {
  const app = express()

  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }))
  app.use(express.json({ limit: '1mb' }))

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true })
  })

  app.use(errorHandler)

  return app
}

if (process.env.NODE_ENV !== 'test') {
  createApp().listen(config.PORT, () => {
    console.log(`Home inventory API listening on ${config.PORT}`)
  })
}
```

- [ ] **Step 6: Add root scripts**

Modify the root `package.json` scripts:

```json
{
  "server:dev": "npm --prefix server run dev",
  "server:build": "npm --prefix server run build",
  "server:test": "npm --prefix server run test",
  "server:seed": "npm --prefix server run seed"
}
```

Keep existing scripts and add these keys inside the existing `scripts` object.

- [ ] **Step 7: Install backend dependencies**

Run:

```bash
npm install --prefix server
```

Expected: `server/package-lock.json` is created.

- [ ] **Step 8: Verify backend scaffold**

Run:

```bash
npm run server:build
```

Expected: TypeScript compiles with no errors.

- [ ] **Step 9: Commit**

Run:

```bash
git add package.json server/package.json server/package-lock.json server/tsconfig.json server/src
git commit -m "feat: scaffold inventory api"
```

---

### Task 2: Database Schema and Seed Data

**Files:**
- Create: `server/src/schema.sql`
- Create: `server/src/db.ts`
- Create: `server/src/seed.ts`
- Create: `.env.example`

- [ ] **Step 1: Add PostgreSQL schema**

Create `server/src/schema.sql`:

```sql
create table if not exists homes (
  id text primary key,
  name text not null
);

create table if not exists members (
  id text primary key,
  home_id text not null references homes(id) on delete cascade,
  name text not null,
  role text not null check (role in ('admin', 'member'))
);

create table if not exists areas (
  id text primary key,
  home_id text not null references homes(id) on delete cascade,
  name text not null,
  sort_order integer not null
);

create table if not exists locations (
  id text primary key,
  home_id text not null references homes(id) on delete cascade,
  area_id text not null references areas(id) on delete cascade,
  name text not null,
  is_common boolean not null default false
);

create table if not exists items (
  id text primary key,
  home_id text not null references homes(id) on delete cascade,
  name text not null,
  category text,
  note text,
  image_url text,
  location_id text not null references locations(id),
  created_by text not null references members(id),
  updated_by text not null references members(id),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  status text not null check (status in ('active', 'archived', 'lost'))
);

create table if not exists movements (
  id text primary key,
  home_id text not null references homes(id) on delete cascade,
  item_id text not null references items(id) on delete cascade,
  from_location_id text not null references locations(id),
  to_location_id text not null references locations(id),
  moved_by text not null references members(id),
  moved_at timestamptz not null,
  note text
);

create table if not exists users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  home_id text not null references homes(id) on delete cascade,
  created_at timestamptz not null
);

create table if not exists sessions (
  token_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null
);
```

- [ ] **Step 2: Add database helper**

Create `server/src/db.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'
import { config } from './config.js'

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL })

export async function query<T>(text: string, values: unknown[] = []) {
  const result = await pool.query<T>(text, values)
  return result
}

export async function migrate() {
  const currentFile = fileURLToPath(import.meta.url)
  const schemaPath = path.join(path.dirname(currentFile), 'schema.sql')
  const schema = await readFile(schemaPath, 'utf8')
  await pool.query(schema)
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
```

- [ ] **Step 3: Add environment example**

Create `.env.example`:

```dotenv
PORT=4000
DATABASE_URL=postgres://inventory:inventory@localhost:5432/inventory
SESSION_SECRET=replace-with-a-long-random-secret
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin12345
CORS_ORIGIN=http://localhost:5173
VITE_API_BASE_URL=http://localhost:4000
```

- [ ] **Step 4: Add seed script**

Create `server/src/seed.ts`:

```ts
import bcrypt from 'bcryptjs'
import { config } from './config.js'
import { migrate, pool } from './db.js'

const initialInventory = {
  home: { id: 'home-1', name: '周家' },
  members: [
    { id: 'u-mom', name: '妈妈', role: 'admin' },
    { id: 'u-dad', name: '爸爸', role: 'member' },
    { id: 'u-me', name: '我', role: 'member' },
  ],
  areas: [
    { id: 'area-entry', name: '玄关', sortOrder: 1 },
    { id: 'area-living', name: '客厅', sortOrder: 2 },
    { id: 'area-bedroom', name: '卧室', sortOrder: 3 },
    { id: 'area-balcony', name: '阳台', sortOrder: 4 },
  ],
  locations: [
    { id: 'loc-shoe', areaId: 'area-entry', name: '鞋柜第一层', isCommon: true },
    { id: 'loc-tv', areaId: 'area-living', name: '电视柜左抽屉', isCommon: true },
    { id: 'loc-sofa', areaId: 'area-living', name: '沙发旁小柜', isCommon: false },
    { id: 'loc-nightstand', areaId: 'area-bedroom', name: '床头柜第一层', isCommon: true },
    { id: 'loc-wardrobe', areaId: 'area-bedroom', name: '衣柜上层收纳盒', isCommon: false },
    { id: 'loc-balcony-cabinet', areaId: 'area-balcony', name: '储物柜上层', isCommon: true },
  ],
  items: [
    {
      id: 'item-passport',
      name: '护照',
      category: '证件',
      note: '蓝色文件袋里，和户口本放一起',
      locationId: 'loc-nightstand',
      createdBy: 'u-mom',
      updatedBy: 'u-mom',
      createdAt: '2026-06-01T09:00:00.000Z',
      updatedAt: '2026-06-09T20:30:00.000Z',
      status: 'active',
    },
    {
      id: 'item-key',
      name: '备用钥匙',
      category: '钥匙',
      note: '小铁盒里',
      locationId: 'loc-shoe',
      createdBy: 'u-dad',
      updatedBy: 'u-dad',
      createdAt: '2026-06-03T18:10:00.000Z',
      updatedAt: '2026-06-08T21:00:00.000Z',
      status: 'active',
    }
  ],
  movements: [
    {
      id: 'move-passport-1',
      itemId: 'item-passport',
      fromLocationId: 'loc-tv',
      toLocationId: 'loc-nightstand',
      movedBy: 'u-mom',
      movedAt: '2026-06-09T20:30:00.000Z',
      note: '整理证件时集中到卧室',
    },
  ],
}

async function seed() {
  await migrate()
  const client = await pool.connect()

  try {
    await client.query('begin')
    await client.query('insert into homes (id, name) values ($1, $2) on conflict (id) do update set name = excluded.name', [
      initialInventory.home.id,
      initialInventory.home.name,
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
        `insert into items (id, home_id, name, category, note, location_id, created_by, updated_by, created_at, updated_at, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         on conflict (id) do update set name = excluded.name, category = excluded.category, note = excluded.note, location_id = excluded.location_id, updated_by = excluded.updated_by, updated_at = excluded.updated_at, status = excluded.status`,
        [
          item.id,
          initialInventory.home.id,
          item.name,
          item.category,
          item.note,
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
          movement.note,
        ],
      )
    }

    const passwordHash = await bcrypt.hash(config.ADMIN_PASSWORD, 12)
    await client.query(
      `insert into users (id, email, password_hash, home_id, created_at)
       values ($1, $2, $3, $4, now())
       on conflict (email) do update set password_hash = excluded.password_hash`,
      ['user-admin', config.ADMIN_EMAIL, passwordHash, initialInventory.home.id],
    )

    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

seed().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 5: Verify schema through Docker PostgreSQL**

Run:

```bash
docker run --name inventory-plan-postgres -e POSTGRES_USER=inventory -e POSTGRES_PASSWORD=inventory -e POSTGRES_DB=inventory -p 5432:5432 -d postgres:16
npm run server:seed
docker rm -f inventory-plan-postgres
```

Expected: seed command exits with code 0.

- [ ] **Step 6: Commit**

Run:

```bash
git add .env.example server/src/schema.sql server/src/db.ts server/src/seed.ts
git commit -m "feat: add inventory database schema"
```

---

### Task 3: Authentication and Inventory API

**Files:**
- Create: `server/src/auth.ts`
- Create: `server/src/inventoryRepository.ts`
- Create: `server/src/routes/authRoutes.ts`
- Create: `server/src/routes/inventoryRoutes.ts`
- Create: `server/src/routes/adminRoutes.ts`
- Modify: `server/src/index.ts`
- Create: `server/src/test/server.test.ts`

- [ ] **Step 1: Add authentication middleware**

Create `server/src/auth.ts`:

```ts
import { randomBytes, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { NextFunction, Request, Response } from 'express'
import { config } from './config.js'
import { hashToken, query } from './db.js'
import { unauthorized } from './errors.js'

export interface AuthUser {
  id: string
  email: string
  homeId: string
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash)
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex')
  const tokenHash = hashToken(`${token}:${config.SESSION_SECRET}`)
  await query(
    'insert into sessions (token_hash, user_id, expires_at, created_at) values ($1, $2, now() + interval \'30 days\', now())',
    [tokenHash, userId],
  )
  return token
}

export async function revokeSession(token: string) {
  const tokenHash = hashToken(`${token}:${config.SESSION_SECRET}`)
  await query('delete from sessions where token_hash = $1', [tokenHash])
}

export function constantTimeToken(value: string, expected: string) {
  const valueBuffer = Buffer.from(value)
  const expectedBuffer = Buffer.from(expected)
  return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer)
}

export async function requireAuth(request: Request, _response: Response, next: NextFunction) {
  const header = request.header('authorization')
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''

  if (!token) {
    next(unauthorized())
    return
  }

  const tokenHash = hashToken(`${token}:${config.SESSION_SECRET}`)
  const result = await query<AuthUser & { expiresAt: string }>(
    `select users.id, users.email, users.home_id as "homeId", sessions.expires_at as "expiresAt"
     from sessions
     join users on users.id = sessions.user_id
     where sessions.token_hash = $1 and sessions.expires_at > now()`,
    [tokenHash],
  )

  const user = result.rows[0]
  if (!user) {
    next(unauthorized('Invalid or expired session'))
    return
  }

  request.user = user
  next()
}
```

- [ ] **Step 2: Add inventory repository**

Create `server/src/inventoryRepository.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { notFound } from './errors.js'

export async function getInventory(homeId: string) {
  const [home, members, areas, locations, items, movements] = await Promise.all([
    query<{ id: string; name: string }>('select id, name from homes where id = $1', [homeId]),
    query('select id, name, role from members where home_id = $1 order by name', [homeId]),
    query('select id, name, sort_order as "sortOrder" from areas where home_id = $1 order by sort_order', [homeId]),
    query('select id, area_id as "areaId", name, is_common as "isCommon" from locations where home_id = $1 order by name', [homeId]),
    query(
      `select id, name, category, note, image_url as "imageUrl", location_id as "locationId",
        created_by as "createdBy", updated_by as "updatedBy", created_at as "createdAt",
        updated_at as "updatedAt", status
       from items where home_id = $1 order by updated_at desc`,
      [homeId],
    ),
    query(
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
    `insert into items (id, home_id, name, category, note, location_id, created_by, updated_by, created_at, updated_at, status)
     values ($1, $2, $3, $4, $5, $6, $7, $7, $8, $8, 'active')`,
    [`item-${randomUUID()}`, homeId, input.name, input.category ?? null, input.note ?? null, input.locationId, input.memberId, now],
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
```

- [ ] **Step 3: Add auth routes**

Create `server/src/routes/authRoutes.ts`:

```ts
import { Router } from 'express'
import { z } from 'zod'
import { createSession, requireAuth, revokeSession, verifyPassword } from '../auth.js'
import { query } from '../db.js'
import { unauthorized } from '../errors.js'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const authRoutes = Router()

authRoutes.post('/login', async (request, response, next) => {
  try {
    const input = loginSchema.parse(request.body)
    const result = await query<{ id: string; email: string; passwordHash: string; homeId: string }>(
      'select id, email, password_hash as "passwordHash", home_id as "homeId" from users where email = $1',
      [input.email],
    )
    const user = result.rows[0]

    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw unauthorized('Invalid email or password')
    }

    const token = await createSession(user.id)
    response.json({ token, user: { id: user.id, email: user.email, homeId: user.homeId } })
  } catch (error) {
    next(error)
  }
})

authRoutes.post('/logout', requireAuth, async (request, response, next) => {
  try {
    const header = request.header('authorization')
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
    await revokeSession(token)
    response.status(204).send()
  } catch (error) {
    next(error)
  }
})
```

- [ ] **Step 4: Add inventory and admin routes**

Create route files that call repository functions:

```ts
// server/src/routes/inventoryRoutes.ts
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth.js'
import { archiveItem, createItem, createLocation, getInventory, moveItem } from '../inventoryRepository.js'

export const inventoryRoutes = Router()
inventoryRoutes.use(requireAuth)

inventoryRoutes.get('/inventory', async (request, response, next) => {
  try {
    response.json(await getInventory(request.user!.homeId))
  } catch (error) {
    next(error)
  }
})

inventoryRoutes.post('/items', async (request, response, next) => {
  try {
    const input = z.object({
      name: z.string().min(1),
      locationId: z.string().min(1),
      category: z.string().optional(),
      note: z.string().optional(),
    }).parse(request.body)
    response.status(201).json(await createItem(request.user!.homeId, { ...input, memberId: 'u-me' }))
  } catch (error) {
    next(error)
  }
})

inventoryRoutes.post('/items/:id/move', async (request, response, next) => {
  try {
    const input = z.object({ toLocationId: z.string().min(1), note: z.string().optional() }).parse(request.body)
    response.json(await moveItem(request.user!.homeId, request.params.id, { ...input, memberId: 'u-me' }))
  } catch (error) {
    next(error)
  }
})

inventoryRoutes.post('/items/:id/archive', async (request, response, next) => {
  try {
    response.json(await archiveItem(request.user!.homeId, request.params.id, 'u-me'))
  } catch (error) {
    next(error)
  }
})

inventoryRoutes.post('/locations', async (request, response, next) => {
  try {
    const input = z.object({
      areaId: z.string().min(1),
      name: z.string().min(1),
      isCommon: z.boolean().default(false),
    }).parse(request.body)
    response.status(201).json(await createLocation(request.user!.homeId, input))
  } catch (error) {
    next(error)
  }
})
```

```ts
// server/src/routes/adminRoutes.ts
import { Router } from 'express'
import { requireAuth } from '../auth.js'
import { getAdminSummary } from '../inventoryRepository.js'

export const adminRoutes = Router()
adminRoutes.use(requireAuth)

adminRoutes.get('/summary', async (request, response, next) => {
  try {
    response.json(await getAdminSummary(request.user!.homeId))
  } catch (error) {
    next(error)
  }
})
```

- [ ] **Step 5: Wire routes into Express**

Modify `server/src/index.ts`:

```ts
import { adminRoutes } from './routes/adminRoutes.js'
import { authRoutes } from './routes/authRoutes.js'
import { inventoryRoutes } from './routes/inventoryRoutes.js'

app.use('/api/auth', authRoutes)
app.use('/api', inventoryRoutes)
app.use('/api/admin', adminRoutes)
```

- [ ] **Step 6: Add API tests**

Create `server/src/test/server.test.ts`:

```ts
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../index.js'
import { migrate } from '../db.js'

describe('inventory api', () => {
  const app = createApp()
  let token = ''

  beforeAll(async () => {
    await migrate()
  })

  it('returns health status', async () => {
    const response = await request(app).get('/api/health')
    expect(response.status).toBe(200)
    expect(response.body.ok).toBe(true)
  })

  it('rejects inventory requests without a session', async () => {
    const response = await request(app).get('/api/inventory')
    expect(response.status).toBe(401)
  })

  it('logs in with the seeded admin user', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'admin12345' })
    expect(response.status).toBe(200)
    expect(response.body.token).toEqual(expect.any(String))
    token = response.body.token
  })

  it('returns inventory for authenticated users', async () => {
    const response = await request(app).get('/api/inventory').set('Authorization', `Bearer ${token}`)
    expect(response.status).toBe(200)
    expect(response.body.home.name).toBe('周家')
    expect(response.body.items.length).toBeGreaterThan(0)
  })

  it('creates, moves, and archives an item', async () => {
    const createResponse = await request(app)
      .post('/api/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '测试物品', locationId: 'loc-shoe', category: '测试', note: '自动测试创建' })
    expect(createResponse.status).toBe(201)
    const createdItem = createResponse.body.items.find((item: { name: string }) => item.name === '测试物品')
    expect(createdItem).toBeTruthy()

    const moveResponse = await request(app)
      .post(`/api/items/${createdItem.id}/move`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toLocationId: 'loc-tv', note: '自动测试移动' })
    expect(moveResponse.status).toBe(200)
    expect(moveResponse.body.items.find((item: { id: string }) => item.id === createdItem.id).locationId).toBe('loc-tv')

    const archiveResponse = await request(app)
      .post(`/api/items/${createdItem.id}/archive`)
      .set('Authorization', `Bearer ${token}`)
    expect(archiveResponse.status).toBe(200)
    expect(archiveResponse.body.items.find((item: { id: string }) => item.id === createdItem.id).status).toBe('archived')
  })
})
```

Before running this test, run `npm run server:seed` against the same `DATABASE_URL` so the admin user exists.

- [ ] **Step 7: Verify API**

Run:

```bash
npm run server:build
npm run server:test
```

Expected: TypeScript build succeeds and tests pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add server/src
git commit -m "feat: add authenticated inventory api"
```

---

### Task 4: Frontend API Sync

**Files:**
- Create: `src/api/client.ts`
- Create: `src/hooks/useInventorySync.ts`
- Modify: `src/domain/types.ts`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Add shared API types**

Modify `src/domain/types.ts`:

```ts
export interface CreateItemInput {
  name: string
  locationId: string
  category?: string
  note?: string
}

export interface MoveItemInput {
  toLocationId: string
  note?: string
}

export interface LoginResponse {
  token: string
  user: {
    id: string
    email: string
    homeId: string
  }
}
```

- [ ] **Step 2: Add API client**

Create `src/api/client.ts`:

```ts
import type { CreateItemInput, InventoryState, LoginResponse, MoveItemInput } from '../domain/types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'
const tokenKey = 'home_inventory_token'

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(tokenKey)
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    throw new Error(errorBody?.error?.message ?? 'Request failed')
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export const apiClient = {
  async login(email: string, password: string) {
    const response = await requestJson<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    localStorage.setItem(tokenKey, response.token)
    return response
  },
  logout() {
    localStorage.removeItem(tokenKey)
  },
  getInventory() {
    return requestJson<InventoryState>('/api/inventory')
  },
  createItem(input: CreateItemInput) {
    return requestJson<InventoryState>('/api/items', { method: 'POST', body: JSON.stringify(input) })
  },
  moveItem(itemId: string, input: MoveItemInput) {
    return requestJson<InventoryState>(`/api/items/${itemId}/move`, { method: 'POST', body: JSON.stringify(input) })
  },
  archiveItem(itemId: string) {
    return requestJson<InventoryState>(`/api/items/${itemId}/archive`, { method: 'POST' })
  },
  getAdminSummary() {
    return requestJson<{
      activeItems: number
      archivedItems: number
      locations: number
      members: number
      recentMovements: InventoryState['movements']
    }>('/api/admin/summary')
  },
}
```

- [ ] **Step 3: Add inventory sync hook**

Create `src/hooks/useInventorySync.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '../api/client'
import { initialInventory } from '../domain/sampleData'
import type { CreateItemInput, InventoryState, MoveItemInput } from '../domain/types'

const cacheKey = 'home_inventory_cache'

export function useInventorySync() {
  const [inventory, setInventory] = useState<InventoryState>(() => {
    const cached = localStorage.getItem(cacheKey)
    return cached ? JSON.parse(cached) as InventoryState : initialInventory
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const nextInventory = await apiClient.getInventory()
      setInventory(nextInventory)
      localStorage.setItem(cacheKey, JSON.stringify(nextInventory))
    } catch {
      setError('无法连接服务器，正在显示本机缓存')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function createItem(input: CreateItemInput) {
    const nextInventory = await apiClient.createItem(input)
    setInventory(nextInventory)
    localStorage.setItem(cacheKey, JSON.stringify(nextInventory))
  }

  async function moveItem(itemId: string, input: MoveItemInput) {
    const nextInventory = await apiClient.moveItem(itemId, input)
    setInventory(nextInventory)
    localStorage.setItem(cacheKey, JSON.stringify(nextInventory))
  }

  async function archiveItem(itemId: string) {
    const nextInventory = await apiClient.archiveItem(itemId)
    setInventory(nextInventory)
    localStorage.setItem(cacheKey, JSON.stringify(nextInventory))
  }

  return { inventory, loading, error, refresh, createItem, moveItem, archiveItem }
}
```

- [ ] **Step 4: Replace in-memory app mutations**

Modify `src/App.tsx` so it uses `useInventorySync()` instead of `useState(initialInventory)`. Keep search, selected item, and view state local. Change `addItem`, `moveSelectedItem`, and `archiveSelectedItem` to call the hook methods.

- [ ] **Step 5: Verify frontend**

Run:

```bash
npm test
npm run build
```

Expected: tests and production build pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add src package.json package-lock.json
git commit -m "feat: sync mobile app with inventory api"
```

---

### Task 5: Admin Web Page

**Files:**
- Create: `src/admin/AdminApp.tsx`
- Create: `src/admin/AdminApp.css`
- Modify: `src/main.tsx`
- Modify: `src/api/client.ts`

- [ ] **Step 1: Add admin API methods**

Add `apiClient.getAdminSummary()` and login helpers to `src/api/client.ts`.

- [ ] **Step 2: Add admin UI**

Create `src/admin/AdminApp.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { apiClient } from '../api/client'
import { getLocationLabel, getMemberName } from '../domain/inventory'
import type { InventoryState } from '../domain/types'
import './AdminApp.css'

export function AdminApp() {
  const [email, setEmail] = useState('admin@example.com')
  const [password, setPassword] = useState('admin12345')
  const [inventory, setInventory] = useState<InventoryState | null>(null)
  const [summary, setSummary] = useState<{ activeItems: number; archivedItems: number; locations: number; members: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const activeItems = useMemo(() => inventory?.items.filter((item) => item.status === 'active') ?? [], [inventory])

  async function load() {
    setError(null)
    try {
      const [nextInventory, nextSummary] = await Promise.all([apiClient.getInventory(), apiClient.getAdminSummary()])
      setInventory(nextInventory)
      setSummary(nextSummary)
    } catch {
      setError('无法读取服务器数据，请先登录')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function login(event: React.FormEvent) {
    event.preventDefault()
    await apiClient.login(email, password)
    await load()
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
          <label>邮箱<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button type="submit">登录</button>
        </form>
      </main>
    )
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <h1>{inventory.home.name}后台</h1>
        <button type="button" onClick={() => void load()}>刷新</button>
      </header>

      <section className="admin-metrics">
        <article><strong>{summary?.activeItems ?? 0}</strong><span>在用物品</span></article>
        <article><strong>{summary?.archivedItems ?? 0}</strong><span>已归档</span></article>
        <article><strong>{summary?.locations ?? 0}</strong><span>位置</span></article>
        <article><strong>{summary?.members ?? 0}</strong><span>成员</span></article>
      </section>

      <section className="admin-panel">
        <h2>物品管理</h2>
        <table>
          <thead><tr><th>名称</th><th>类别</th><th>位置</th><th>更新人</th><th>操作</th></tr></thead>
          <tbody>
            {activeItems.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.category ?? '-'}</td>
                <td>{getLocationLabel(inventory, item.locationId)}</td>
                <td>{getMemberName(inventory, item.updatedBy)}</td>
                <td><button type="button" onClick={() => void archive(item.id)}>归档</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="admin-panel">
        <h2>最近移动</h2>
        <ul className="movement-list">
          {inventory.movements.slice(0, 8).map((movement) => (
            <li key={movement.id}>{getMemberName(inventory, movement.movedBy)} 移动到 {getLocationLabel(inventory, movement.toLocationId)}</li>
          ))}
        </ul>
      </section>
    </main>
  )
}
```

- [ ] **Step 3: Add admin styles**

Create `src/admin/AdminApp.css`:

```css
.admin-shell {
  min-height: 100vh;
  background: #f6f7f9;
  color: #172033;
  padding: 24px;
}

.admin-header,
.admin-metrics,
.admin-panel,
.admin-login {
  width: min(1120px, 100%);
  margin: 0 auto 16px;
}

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.admin-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.admin-metrics article,
.admin-panel,
.admin-login {
  background: #fff;
  border: 1px solid #dde2ea;
  border-radius: 8px;
  padding: 16px;
}

.admin-metrics strong {
  display: block;
  font-size: 28px;
}

.admin-panel table {
  width: 100%;
  border-collapse: collapse;
}

.admin-panel th,
.admin-panel td {
  border-bottom: 1px solid #e5e9f0;
  padding: 10px;
  text-align: left;
}

.admin-login {
  margin-top: 80px;
  max-width: 380px;
  display: grid;
  gap: 12px;
}

.admin-login label {
  display: grid;
  gap: 6px;
}

.admin-login input {
  height: 40px;
  border: 1px solid #cfd7e3;
  border-radius: 6px;
  padding: 0 10px;
}

.admin-error {
  color: #b42318;
}

.movement-list {
  margin: 0;
  padding-left: 18px;
}

@media (max-width: 760px) {
  .admin-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

- [ ] **Step 4: Route `/admin` to admin UI**

Modify `src/main.tsx`:

```tsx
const isAdminRoute = window.location.pathname.startsWith('/admin')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdminRoute ? <AdminApp /> : <App />}
  </StrictMode>,
)
```

- [ ] **Step 5: Verify admin page build**

Run:

```bash
npm run build
```

Expected: Vite build succeeds.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/admin src/main.tsx src/api/client.ts
git commit -m "feat: add inventory admin page"
```

---

### Task 6: Docker and Ubuntu Deployment

**Files:**
- Create: `server/Dockerfile`
- Create: `docker-compose.yml`
- Create: `deploy/nginx.conf`
- Create: `deploy/README.md`
- Modify: `.gitignore`

- [ ] **Step 1: Add API Dockerfile**

Create `server/Dockerfile`:

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY src/schema.sql ./dist/schema.sql
EXPOSE 4000
CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Add Docker Compose**

Create `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: inventory
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-inventory}
      POSTGRES_DB: inventory
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  api:
    build:
      context: ./server
    restart: unless-stopped
    environment:
      PORT: 4000
      DATABASE_URL: postgres://inventory:${POSTGRES_PASSWORD:-inventory}@postgres:5432/inventory
      SESSION_SECRET: ${SESSION_SECRET}
      ADMIN_EMAIL: ${ADMIN_EMAIL}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
      CORS_ORIGIN: ${CORS_ORIGIN:-http://localhost:5173}
    depends_on:
      - postgres
    ports:
      - "4000:4000"

volumes:
  postgres-data:
```

- [ ] **Step 3: Add Nginx config**

Create `deploy/nginx.conf` with reverse proxy from `/api` to `api:4000` and static frontend serving from `/usr/share/nginx/html`.

- [ ] **Step 4: Add deployment guide**

Create `deploy/README.md` with commands:

```bash
git clone git@github.com:zhouyu20012026/studytech.git
cd studytech
cp .env.example .env
docker compose up -d --build
docker compose exec api npm run seed
curl http://localhost:4000/api/health
```

Include notes for Aliyun firewall ports `80`, `443`, and optional `4000`.

- [ ] **Step 5: Verify Docker config syntax**

Run:

```bash
docker compose config
```

Expected: compose file renders without errors.

- [ ] **Step 6: Commit**

Run:

```bash
git add server/Dockerfile docker-compose.yml deploy .gitignore
git commit -m "feat: add docker deployment"
```

---

### Task 7: APK Rebuild and Release Handoff

**Files:**
- Modify: `capacitor.config.ts`
- Modify: `README.md`

- [ ] **Step 1: Document API URL for APK builds**

Add README instructions for setting `VITE_API_BASE_URL` before building:

```bash
VITE_API_BASE_URL=http://YOUR_SERVER_IP:4000 npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

- [ ] **Step 2: Rebuild Android debug APK**

Run:

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_SDK_ROOT=/Users/zhouyu/Library/Android/sdk
VITE_API_BASE_URL=http://YOUR_SERVER_IP:4000 npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

Expected: `android/app/build/outputs/apk/debug/app-debug.apk` exists.

- [ ] **Step 3: Verify final project**

Run:

```bash
npm test
npm run build
npm run server:build
```

Expected: all commands pass.

- [ ] **Step 4: Commit and push**

Run:

```bash
git add README.md capacitor.config.ts
git commit -m "docs: add apk backend build instructions"
git push
```

---

## Execution Notes

- Prefer implementing Task 1 through Task 3 first. Those prove server-side persistence.
- Use the current `src/domain/sampleData.ts` as the canonical seed reference, but keep the server seed file standalone so Docker can seed without compiling the frontend.
- The plan intentionally starts with a single admin account. Family member accounts can be added after the data sync path works.
- Keep generated outputs out of git: `node_modules`, `dist`, Android build folders, APKs, and `.env`.
