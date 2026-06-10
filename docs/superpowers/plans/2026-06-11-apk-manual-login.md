# APK Manual Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Android APK so it syncs against the public server without embedding any admin password in the client bundle.

**Architecture:** The mobile app should keep the local inventory cache, but it must ask the user to sign in on first launch or after session loss. The server should accept Capacitor origins for cookie-based auth, and Android should allow HTTP to the server IP while the backend still stays on the existing `studytech-api` service.

**Tech Stack:** React, Vite, Capacitor, TypeScript, Express, systemd, Nginx.

---

### Task 1: Replace bootstrap password with manual mobile login

**Files:**
- Modify: `src/hooks/useInventorySync.ts`
- Modify: `src/App.tsx`
- Modify: `src/api/client.ts`
- Test: `src/hooks/useInventorySync.test.ts`
- Test: `src/App.login.test.tsx`

- [ ] **Step 1: Write the failing test**

Create a hook test that renders `useInventorySync`, simulates a missing token plus a 401 from `getInventory`, and expects `authRequired` to become `true` while the cached inventory remains available.

Create a component test that renders `App`, mocks the hook to report `authRequired: true`, and expects a visible login form with the email field prefilled from `VITE_ADMIN_EMAIL`.

- [ ] **Step 2: Run test to verify it fails**

Run:
`npm test -- src/hooks/useInventorySync.test.ts src/App.login.test.tsx`

Expected: FAIL because `authRequired` and the login form do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Remove `VITE_ADMIN_PASSWORD` bootstrap login from `useInventorySync`. Add:

```ts
const [authRequired, setAuthRequired] = useState(true)

async function login(email: string, password: string, captcha?: string) {
  await apiClient.login(email, password, captcha)
  setAuthRequired(false)
  await refresh()
}
```

In `App.tsx`, render a compact login section when `authRequired` is true. Keep the cached inventory path intact for offline viewing.

- [ ] **Step 4: Run test to verify it passes**

Run:
`npm test -- src/hooks/useInventorySync.test.ts src/App.login.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useInventorySync.ts src/App.tsx src/api/client.ts src/hooks/useInventorySync.test.ts src/App.login.test.tsx
git commit -m "feat: require manual login in apk"
```

### Task 2: Allow mobile app traffic to reach the API

**Files:**
- Modify: `server/src/config.ts`
- Modify: `server/src/index.ts`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `server/src/test/server.test.ts`

- [ ] **Step 1: Write the failing test**

Add a server test that confirms `CORS_ORIGIN` can contain multiple comma-separated origins and that a Capacitor origin such as `capacitor://localhost` is accepted.

- [ ] **Step 2: Run test to verify it fails**

Run:
`npm run server:test -- src/test/server.test.ts`

Expected: FAIL because the CORS layer still reads only one origin string.

- [ ] **Step 3: Write minimal implementation**

Parse `CORS_ORIGIN` into an allow list, trim entries, and use a CORS origin callback. Add `android:usesCleartextTraffic="true"` to the Android application manifest so the WebView can talk to `http://8.148.10.44:4000`.

- [ ] **Step 4: Run test to verify it passes**

Run:
`npm run server:test -- src/test/server.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/config.ts server/src/index.ts android/app/src/main/AndroidManifest.xml server/src/test/server.test.ts
git commit -m "feat: allow capacitor api access"
```

### Task 3: Rebuild the APK against the public server

**Files:**
- Modify: `.env.production` or build-time env for the APK
- Modify: generated Android assets via `npm run cap:sync`

- [ ] **Step 1: Build the web bundle for the public API**

Run:
`VITE_API_BASE_URL=http://8.148.10.44:4000 npm run build`

Expected: `dist/` is rebuilt with the public API base URL.

- [ ] **Step 2: Sync Capacitor and build the APK**

Run:
`VITE_API_BASE_URL=http://8.148.10.44:4000 npm run cap:sync`

Then:
`cd android && ./gradlew assembleDebug`

Expected: a new debug APK under `android/app/build/outputs/apk/debug/`.

- [ ] **Step 3: Verify the package**

Confirm the APK no longer contains `VITE_ADMIN_PASSWORD`, and confirm the app opens the login form and can reach the API after signing in with the server account.

