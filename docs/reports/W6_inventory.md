# W6 Inventory Report

Date: 2026-05-31

## Scope

W6 phase 1 only:

- Inventory admin scaffold.
- Make admin install, start, login, and call local server `3100`.
- Do not implement conversation/workorder business pages.

## Inv Task 1: Admin Directory And Dependencies

Admin directory exists at:

```text
/Users/caihongyang/vscode/chatsift/admin
```

Files under `admin/src`:

```text
src/App.vue
src/api/ai.js
src/api/auth.js
src/api/columnPrefs.js
src/api/configs.js
src/api/dashboard.js
src/api/devices.js
src/api/keywordReplies.js
src/api/knowledge.js
src/api/logs.js
src/api/menus.js
src/api/pages.js
src/api/platforms.js
src/api/plugin-update.js
src/api/plugins.js
src/api/roles.js
src/api/stats.js
src/api/users.js
src/assets/hero.png
src/assets/vite.svg
src/assets/vue.svg
src/components/HelloWorld.vue
src/layouts/MainLayout.vue
src/main.js
src/router/index.js
src/stores/user.js
src/utils/request.js
src/views/Dashboard.vue
src/views/Login.vue
src/views/Menus.vue
src/views/Platforms.vue
src/views/Plugins.vue
src/views/Roles.vue
src/views/Users.vue
```

Build tool:

```text
Vite + Vue 3
```

Key dependencies:

```text
@element-plus/icons-vue
axios
element-plus
pinia
vue
vue-router
@vitejs/plugin-vue
vite
```

Scripts:

```text
npm run dev
npm run build
npm run preview
```

`npm install` result:

```text
added 87 packages
found 0 vulnerabilities
```

## Inv Task 2: Axios Base URL

`admin/src/utils/request.js`:

```js
const request = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 10000,
})
```

Original state:

- No `.env*` file existed in `admin/`.
- Dev mode would fall back to `/api`, which points to the Vite origin, not the chatsift server.

Fix applied:

```text
admin/.env.development
VITE_API_URL=http://127.0.0.1:3100/api
```

Verification from served dev module:

```text
import.meta.env.VITE_API_URL = "http://127.0.0.1:3100/api"
```

Token handling:

- `localStorage.token`
- `localStorage.refreshToken`
- `Authorization: Bearer <token>` request header
- automatic refresh through `/auth/refresh`

## Inv Task 3: Router And Login State

Store:

```text
admin/src/stores/user.js
```

Login state:

- `token` loaded from `localStorage.token`
- `refreshToken` loaded from `localStorage.refreshToken`
- `userInfo` loaded from `localStorage.userInfo`
- `isLoggedIn = !!token`

Router guard:

- `requiresAuth` routes redirect unauthenticated users to `/login`.
- Logged-in users visiting `/login` are redirected to `/dashboard`.
- Non-super users are checked against `routePermMap`.

Original route migration debt:

`src/router/index.js` referenced missing views:

```text
src/views/Devices.vue
src/views/Logs.vue
src/views/Messages.vue
src/views/runtime/RuntimeDashboard.vue
src/views/runtime/Batches.vue
src/views/runtime/BatchTrace.vue
src/views/runtime/Sessions.vue
src/views/runtime/SessionDetail.vue
```

These unresolved imports made Vite dependency scan fail.

Fix applied:

- Removed the missing route imports from the router.
- Kept only routes backed by existing view files:
  - `/dashboard`
  - `/users`
  - `/plugins`
  - `/myplugins` redirect
  - `/platforms`
  - `/roles`
  - `/menus`

## Inv Task 4: Views, Layout, Menu

Existing migrated pages:

```text
Dashboard.vue
Login.vue
Menus.vue
Platforms.vue
Plugins.vue
Roles.vue
Users.vue
```

Layout:

```text
admin/src/layouts/MainLayout.vue
```

Menu behavior:

- MainLayout loads menu from `GET /api/menus/tree`.
- Menu is rendered from DB data.
- Current DB menu includes future W6+ entries:
  - 会话中心
  - 线索中心
  - 工单中心
  - 运营分析
  - 系统设置

Important for W6 phase 2:

- Some menu entries exist in DB but their Vue pages/routes are not implemented yet.
- Stage 2 should either add the real pages/routes or sync menu visibility/routes.

## Inv Task 5: Start And Login

Commands:

```text
cd /Users/caihongyang/vscode/chatsift/admin
npm install
npm run dev -- --host 127.0.0.1
```

Dev server:

```text
http://127.0.0.1:5173/
```

Note:

- Port `5173` was also occupied by `/Users/caihongyang/vscode/chat_rpa/admin` on IPv6.
- chatsift admin successfully listened on `127.0.0.1:5173`.

Backend server:

```text
http://127.0.0.1:3100
```

Started with:

```text
PORT=3100
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=chatsift
JWT_SECRET=chatsift-v1-local-0b7b3c7a88d84d8b9c8d3e2c0f4a6b91
ANALYZER_ENABLED=true
```

HTTP login verification:

```text
POST http://127.0.0.1:3100/api/auth/login
username=admin
password=admin123
```

Result:

```text
HTTP 200
code=0
hasToken=true
user=admin
```

Browser verification:

- User opened `http://127.0.0.1:5173/login`.
- Login with `admin / admin123` succeeded.
- Browser landed on `http://127.0.0.1:5173/dashboard`.
- Dashboard rendered with account `admin` and role `超级管理员`.

Open UI issue:

- After login, the page is visually covered by a gray mask and clicks do not operate normally.
- Chrome accessibility tree shows admin page content loaded and focusable.
- Vite dev server logs show Vue warnings only, no runtime error.
- This looks like a page-level overlay/interceptor, possibly from an external browser extension or stale overlay, but it is not fully identified yet.
- This remains an unresolved phase-1 UI operability issue.

## Inv Task 6: Backend CORS

Current backend CORS:

```js
app.use(cors())
```

Verification:

```text
OPTIONS /api/auth/login
Origin: http://127.0.0.1:5173

HTTP 204
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE
Access-Control-Allow-Headers: content-type,authorization
```

No backend CORS change was needed.

## API Connectivity To 3100

Authenticated API checks with admin token:

```text
GET /api/menus/tree          -> 200
GET /api/platforms?enabled=1 -> 200
GET /api/v1/conversations    -> 200
GET /api/v1/workorders       -> 200
POST /api/v1/events/batch    -> 200
```

Known old-admin endpoint issue:

```text
GET /api/dashboard/stats -> 500
```

Server error:

```text
Table 'chatsift.message_logs' doesn't exist
```

Cause:

- `server/src/controllers/dashboardController.js` still queries old `message_logs`.
- W1-W5 chatsift schema uses `messages`.
- This is a backend/dashboard migration debt and was not changed in phase 1.

## Fixes Applied

Admin-only fixes:

| File | Fix |
| --- | --- |
| `admin/.env.development` | Added `VITE_API_URL=http://127.0.0.1:3100/api` |
| `admin/src/router/index.js` | Removed routes pointing to missing view files |
| `admin/src/directives/perm.js` | Restored missing `v-perm` directive |
| `admin/src/style.css` | Restored missing global style |
| `admin/public/logo.png` | Restored missing logo asset |

Backend changes:

```text
None
```

## Build Verification

```text
npm run build
```

Result:

```text
✓ built in 1.02s
```

Warnings:

- Rolldown ignored `/* #__PURE__ */` comments from `@vueuse/core`.
- Main chunk is larger than 500 kB.

These are build warnings, not blockers for phase 1.

## Admin Runability Conclusion

Current status:

| Item | Result |
| --- | --- |
| `npm install` | Pass |
| `npm run dev` | Pass |
| `npm run build` | Pass |
| Login API to 3100 | Pass |
| Browser login | Pass |
| Authenticated `/api/v1` call to 3100 | Pass |
| CORS 5173 -> 3100 | Pass |
| Dashboard stats | Fails because old table `message_logs` is missing |
| UI click operability after login | Blocked by unresolved gray mask |

Recommendation before W6 phase 2:

- Resolve the gray mask / click-blocking issue first.
- Decide whether W6 phase 2 should also migrate dashboard stats from old `message_logs` to W1-W5 `messages`, or leave dashboard for W9 as originally planned.
