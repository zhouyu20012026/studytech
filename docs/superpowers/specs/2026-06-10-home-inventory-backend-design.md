# Home Inventory Backend Design

## Goal

Build a deployable backend system for the home inventory app so household item data survives app uninstall, can sync across phones, and can be managed from a web admin page.

## Recommended Approach

Use a self-hosted single-service backend on the user's Ubuntu Aliyun server.

- API: Node.js, TypeScript, Express
- Database: PostgreSQL
- Admin UI: React route inside the existing Vite app
- Mobile app: existing Capacitor APK consumes the API
- Deployment: Docker Compose with API, PostgreSQL, and Nginx
- File uploads: local server storage first, with a clean path to Aliyun OSS later

This keeps the first production version understandable and deployable while still leaving room for growth.

## Product Scope

The first backend-backed version supports:

- A household with members, areas, locations, items, and movement history.
- Persistent item creation, archive, move, search, and list operations.
- A web admin page for managing items, locations, members, and recent movements.
- Basic login using a shared admin account for the first version.
- Server-side storage so uninstalling the APK does not delete data.

Out of scope for the first version:

- Multi-household SaaS billing.
- Complex per-item permission rules.
- Realtime collaboration.
- Push notifications.
- Full Aliyun OSS integration.

## Architecture

The system has three runtime surfaces:

1. Mobile app

The existing Capacitor APK loads the React app. Instead of relying on in-memory sample data, it calls the API for inventory data and submits item changes to the server.

2. API server

The API owns persistence, authentication, validation, and business rules. It exposes JSON endpoints under `/api`.

3. Admin web page

The admin page is served by the same Vite app and uses the same API. It gives the household owner a larger-screen management view.

## Data Model

PostgreSQL tables:

- `homes`: household records.
- `members`: household members and roles.
- `areas`: high-level zones such as entryway, living room, bedroom.
- `locations`: physical places inside areas.
- `items`: tracked objects.
- `movements`: item location history.
- `users`: login accounts.
- `sessions`: issued session tokens.

The current frontend `InventoryState` shape remains the client-facing API contract for the first iteration. This lets the existing app migrate without a large rewrite.

## API Design

Core endpoints:

- `POST /api/auth/login`: issue a session token.
- `POST /api/auth/logout`: revoke current session.
- `GET /api/inventory`: return the full household inventory state.
- `POST /api/items`: create an item.
- `PATCH /api/items/:id`: edit item metadata.
- `POST /api/items/:id/move`: move an item and append movement history.
- `POST /api/items/:id/archive`: archive an item.
- `POST /api/locations`: create a location.
- `PATCH /api/locations/:id`: update a location.
- `GET /api/admin/summary`: dashboard counts and recent movements.

Errors return JSON with `{ "error": { "code": "...", "message": "..." } }`.

## Admin UI

The admin page lives at `/admin`.

Main sections:

- Dashboard: item count, archived count, location count, member count, recent movements.
- Items: search, edit, move, archive.
- Locations: manage areas and specific storage locations.
- Members: view members and roles.
- Settings: API address and login status for local development.

The admin UI should be quiet and operational rather than marketing-like: compact tables, filters, edit forms, and clear status states.

## Mobile App Changes

The app keeps its current home/search/detail/add flows but loads data from the backend.

Client behavior:

- On app start, fetch `/api/inventory`.
- If offline or API fails, show a clear connection error and keep the last successfully loaded data in local storage.
- On create, move, or archive, call the API and refresh local state from the server response.
- Keep the sample data as seed data for local development and initial database seeding.

## Deployment

The Ubuntu server runs:

- `app-api`: Node.js API container.
- `postgres`: PostgreSQL container with persistent volume.
- `nginx`: reverse proxy for API and admin web assets.

Suggested public routes:

- `https://your-domain.com/`: app/admin web build.
- `https://your-domain.com/admin`: admin page.
- `https://your-domain.com/api`: backend API.

The first deployment can use server IP and HTTP. A real deployment should add a domain and HTTPS certificate.

## Security

First version:

- Password hashed with bcrypt.
- Session token stored server-side.
- API endpoints require a valid session except login and health check.
- CORS restricted to configured app/admin origins.
- `.env` holds database password, session secret, and admin bootstrap password.

Later improvements:

- Per-member login.
- Role-based permissions.
- Audit export.
- Aliyun OSS signed upload URLs.

## Testing

Backend tests:

- Inventory fetch returns seeded data.
- Item creation persists to database.
- Moving an item updates current location and writes movement history.
- Archiving an item removes it from active search.
- Unauthorized requests fail.

Frontend tests:

- API client maps backend data into existing app state.
- App shows connection error when backend is unavailable.
- Admin dashboard renders summary data.

Deployment verification:

- `docker compose up -d` starts all services.
- `GET /api/health` returns ok.
- Admin page can log in and view seeded items.
- Android debug APK can fetch server inventory when configured with the API URL.

## Implementation Order

1. Add backend project structure and database schema.
2. Add seed data based on the current frontend sample data.
3. Implement API authentication and inventory endpoints.
4. Add frontend API client and replace in-memory mutations with server calls.
5. Add `/admin` page for management.
6. Add Docker Compose and deployment documentation.
7. Rebuild the APK after the app points to the backend API.

## Open Decisions

- Domain name and final HTTPS setup can wait until the server is ready.
- File uploads should start as local disk storage; move to Aliyun OSS when item photos become important.
- The first version uses one admin account, then expands to family member accounts after the core sync path works.
