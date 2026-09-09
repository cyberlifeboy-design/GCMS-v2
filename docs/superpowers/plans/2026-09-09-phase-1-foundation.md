# Phase 1 — Foundation / Quick Wins — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix logout so it returns to the login page with a full reload, put the "Submit a Request" / "Bookings" actions on the login page as side-by-side buttons, and make venue scoping on every dashboard/report endpoint consistent and enforced server-side.

**Architecture:** Extract the "which stadium is this user allowed to see" decision into one pure function (`resolveStadiumScope`) in the reports module, unit-test it, then replace the ~15 copy-pasted inline `if (role === 'Admin')` blocks in `reports.controller.ts` with calls to it — also covering the endpoints that currently do no scoping at all, and adding `FA` (own-venue) handling. Frontend changes are small and presentational: `authStore.logout()` gets a hard redirect; `LoginPage` swaps two stacked text links for a two-button row; `DashboardPage` already hides the venue picker for Admin/FA and only needs a scope-label check.

**Tech Stack:** TypeScript, Express, Prisma, Zustand, React, Vite, Tailwind, vitest (added here for the first time).

**Spec:** `docs/superpowers/specs/2026-09-09-gcms-pool-and-production-design.md` (Phase 1 is §5; cross-cutting NFRs are §2a).

## Global Constraints

- **Roles** (exact strings): `SuperAdmin`, `Admin`, `FA`, `Observer`, `Contracts`, `MaintenanceTeam`.
- **Venue scoping rule:** `Admin` → forced to `req.user.stadiumId`, any client `stadiumId` ignored. `FA` → forced to `req.user.stadiumId`. `SuperAdmin` / `Observer` / `Contracts` / `MaintenanceTeam` → may see all venues, optional `stadiumId` filter honoured.
- **Responsive:** new/changed UI must work at 375px, 768px, 1280px; no horizontal body scroll at 320px.
- **Bug-free:** `npx tsc --noEmit` and `npx eslint <touched files>` pass clean for every file touched; no new unexplained `any`; every new endpoint error path returns typed JSON, never a stack trace.
- **Commits:** one commit per task, conventional-commit style, footer:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj
  ```
- **Dev servers:** backend `cd backend && npm run dev` (port 3005), frontend `cd frontend && npm run dev` (port 3000). Seeded logins: `superadmin@gcms.com` / `Admin@2024!`, `admin@gcms.com` / `Admin@2024!` (Admin, venue-scoped).
- **Testing reality:** the repo currently has no test runner wired up and no integration/browser harness. This plan adds vitest for backend *unit* logic (Task 1) and uses precise manual verification for HTTP/UI behaviour. A full integration/e2e harness is Phase 7 scope, not this plan.

---

## File Structure

**Created:**
- `backend/vitest.config.ts` — vitest config (unit tests only, node env).
- `backend/src/modules/reports/reports.scope.ts` — pure `resolveStadiumScope()` helper + `ScopeUser` type.
- `backend/src/modules/reports/reports.scope.test.ts` — unit tests for the helper.

**Modified:**
- `backend/src/modules/reports/reports.controller.ts` — replace every inline Admin-scoping block with `resolveStadiumScope(...)`; add scoping to handlers that currently pass `{}`; add `FA` handling.
- `backend/src/modules/reports/reports.routes.ts` — add `Contracts`, `MaintenanceTeam` to the read/export route role lists.
- `backend/package.json` — `test` script runs vitest once (`vitest run`); add `test:watch`.
- `frontend/src/stores/authStore.ts` — `logout()` hard-redirects to `/login`.
- `frontend/src/components/auth/ProtectedRoute.tsx` — guard the redirect so it doesn't loop when already on `/login`.
- `frontend/src/pages/LoginPage.tsx` — replace the two stacked `<Link>`s with a side-by-side two-button row.
- `frontend/src/pages/DashboardPage.tsx` — verify/repair the "showing scope" label for Admin/FA (no picker).

---

## Task 1: Backend vitest + `resolveStadiumScope` pure function (TDD)

**Files:**
- Create: `backend/vitest.config.ts`
- Create: `backend/src/modules/reports/reports.scope.ts`
- Test: `backend/src/modules/reports/reports.scope.test.ts`
- Modify: `backend/package.json` (scripts)

**Interfaces:**
- Consumes: nothing (leaf utility).
- Produces:
  ```ts
  export type ScopeRole =
    | 'SuperAdmin' | 'Admin' | 'FA' | 'Observer' | 'Contracts' | 'MaintenanceTeam';

  export interface ScopeUser {
    role: ScopeRole | string;
    stadiumId?: string | null;
  }

  /**
   * Resolve which stadium a report/dashboard query may read.
   * - Admin & FA: always their own stadiumId; the requested value is ignored.
   *   If such a user has no stadiumId, returns '__none__' (a sentinel that
   *   callers pass to the service to force an empty result set).
   * - SuperAdmin / Observer / Contracts / MaintenanceTeam: the requested
   *   stadiumId if provided and non-empty, otherwise undefined (all venues).
   * Never throws.
   */
  export function resolveStadiumScope(
    user: ScopeUser | undefined,
    requestedStadiumId: unknown,
  ): string | undefined;

  export const NO_STADIUM_SENTINEL = '__none__';
  ```

- [ ] **Step 1: Add vitest config**

Create `backend/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});
```

- [ ] **Step 2: Point package.json scripts at vitest run**

In `backend/package.json` `scripts`, change:

```json
"test": "cross-env NODE_ENV=test vitest run",
"test:watch": "cross-env NODE_ENV=test vitest",
```

- [ ] **Step 3: Write the failing test**

Create `backend/src/modules/reports/reports.scope.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveStadiumScope, NO_STADIUM_SENTINEL } from './reports.scope';

describe('resolveStadiumScope', () => {
  it('forces Admin to their own stadium and ignores the requested value', () => {
    expect(resolveStadiumScope({ role: 'Admin', stadiumId: 'S1' }, 'S2')).toBe('S1');
  });

  it('forces FA to their own stadium and ignores the requested value', () => {
    expect(resolveStadiumScope({ role: 'FA', stadiumId: 'S9' }, undefined)).toBe('S9');
  });

  it('returns the NONE sentinel for an Admin with no stadium', () => {
    expect(resolveStadiumScope({ role: 'Admin', stadiumId: null }, 'S2')).toBe(NO_STADIUM_SENTINEL);
  });

  it('lets SuperAdmin see all venues when no stadium requested', () => {
    expect(resolveStadiumScope({ role: 'SuperAdmin' }, undefined)).toBeUndefined();
    expect(resolveStadiumScope({ role: 'SuperAdmin' }, '')).toBeUndefined();
  });

  it('honours the requested stadium for SuperAdmin / Observer / Contracts / MaintenanceTeam', () => {
    for (const role of ['SuperAdmin', 'Observer', 'Contracts', 'MaintenanceTeam']) {
      expect(resolveStadiumScope({ role }, 'S3')).toBe('S3');
    }
  });

  it('ignores non-string requested values for privileged roles', () => {
    expect(resolveStadiumScope({ role: 'Observer' }, ['S3'] as unknown)).toBeUndefined();
    expect(resolveStadiumScope({ role: 'Observer' }, 123 as unknown)).toBeUndefined();
  });

  it('never throws on undefined user', () => {
    expect(resolveStadiumScope(undefined, 'S1')).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run the test, verify it fails**

Run: `cd backend && npx vitest run src/modules/reports/reports.scope.test.ts`
Expected: FAIL — `Cannot find module './reports.scope'`.

- [ ] **Step 5: Implement the helper**

Create `backend/src/modules/reports/reports.scope.ts`:

```ts
export type ScopeRole =
  | 'SuperAdmin' | 'Admin' | 'FA' | 'Observer' | 'Contracts' | 'MaintenanceTeam';

export interface ScopeUser {
  role: ScopeRole | string;
  stadiumId?: string | null;
}

/** Passed to the service to force an empty result set. */
export const NO_STADIUM_SENTINEL = '__none__';

const VENUE_LOCKED_ROLES = new Set(['Admin', 'FA']);

export function resolveStadiumScope(
  user: ScopeUser | undefined,
  requestedStadiumId: unknown,
): string | undefined {
  if (!user) return undefined;

  if (VENUE_LOCKED_ROLES.has(user.role)) {
    return user.stadiumId ? user.stadiumId : NO_STADIUM_SENTINEL;
  }

  // Privileged roles: honour an explicit, non-empty string filter only.
  if (typeof requestedStadiumId === 'string' && requestedStadiumId.trim() !== '') {
    return requestedStadiumId;
  }
  return undefined;
}
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `cd backend && npx vitest run src/modules/reports/reports.scope.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no new errors from the two new files.

- [ ] **Step 8: Commit**

```bash
git add backend/vitest.config.ts backend/package.json \
  backend/src/modules/reports/reports.scope.ts \
  backend/src/modules/reports/reports.scope.test.ts
git commit -m "test: add vitest + resolveStadiumScope helper for report venue scoping"
```

---

## Task 2: Apply `resolveStadiumScope` across reports.controller + widen route roles

**Files:**
- Modify: `backend/src/modules/reports/reports.controller.ts`
- Modify: `backend/src/modules/reports/reports.routes.ts`

**Interfaces:**
- Consumes: `resolveStadiumScope`, `NO_STADIUM_SENTINEL` from Task 1.
- Produces: no new exports; behaviour change only. After this task every handler in
  `reports.controller.ts` that reads a `stadiumId` derives it via
  `resolveStadiumScope(req.user, req.query.stadiumId)`, and passes the value straight to
  the service (the service already treats `undefined` as "all"; `'__none__'` yields no rows
  because no stadium has that id).

- [ ] **Step 1: Import the helper**

At the top of `backend/src/modules/reports/reports.controller.ts`, add:

```ts
import { resolveStadiumScope } from './reports.scope';
```

- [ ] **Step 2: Replace every inline Admin-scoping block**

For each handler listed below, delete the local pattern:

```ts
let filterStadiumId = stadiumId;
if (req.user?.role === 'Admin') {
    filterStadiumId = req.user.stadiumId;
}
```

and the simpler `if (req.user?.role === 'Admin') { stadiumId = req.user.stadiumId || undefined; }`,
replacing it with **exactly this call expression** (so the Step 5 grep matches):

```ts
const filterStadiumId = resolveStadiumScope(req.user, req.query.stadiumId);
```

Do not pass a pre-destructured local — always `req.query.stadiumId` as the second arg.

Then make sure the handler passes `filterStadiumId` (not the raw `stadiumId`) into its
`reportsService.*` call. Handlers to update (search each `static async` name):

- `getFaAuditTrail` (currently mutates `stadiumId`) — pass `stadiumId: filterStadiumId`.
- `getUtilization`
- `getActiveCarsUsage`
- `exportFleetOverview`
- `getDepartmentReports`
- `exportDepartmentReport`
- `getUserReports`
- `exportUserReport`
- `exportUserReportPdf`
- `exportLabelsDocx`
- `exportLabelsPdf`
- `exportLabelsPptx`
- `getStadiumReports` / `exportStadiumReport` / `exportStadiumReportPdf` — if these
  intentionally aggregate all venues for privileged users, still call
  `resolveStadiumScope` so an `Admin`/`FA` is limited to their row.

- [ ] **Step 3: Add scoping to the handlers that currently pass `{}`**

These call the service with no stadium filter at all — add the same
`const filterStadiumId = resolveStadiumScope(req.user, req.query.stadiumId);` and thread it
through:

- `exportAuditLogs` → `getAuditLogs({ stadiumId: filterStadiumId })` (extend the service
  call sig if it ignores unknown keys it is a no-op; if the service signature is strict,
  pass it only when the service supports it — check `reports.service.ts` `getAuditLogs`
  and add a `stadiumId?` filter there if absent, filtering audit rows by the acting
  stadium where the model allows; if `AuditLog` has no stadium link, leave `exportAuditLogs`
  unscoped and add a code comment saying audit export is SuperAdmin/Observer-only by route).
- `exportHandoverLogs` → `getHandoverReports({ stadiumId: filterStadiumId })`
- `exportMaintenanceLogs` → `getMaintenanceReports({ stadiumId: filterStadiumId })`
- `exportActivityTimeline` → thread `filterStadiumId` into its service call.
- `exportFullReport` → thread `filterStadiumId` into each aggregated service call
  (`getDashboardStats({ stadiumId: filterStadiumId })`, etc.).

For any service method that genuinely has no stadium dimension, add a one-line comment
explaining why it stays unscoped rather than silently leaving it.

- [ ] **Step 4: Widen route roles**

In `backend/src/modules/reports/reports.routes.ts`, add `'Contracts', 'MaintenanceTeam'`
to the `requireRole(...)` list on the **read and export** routes they should reach
(everything except `/audit`, which stays `requireRole('SuperAdmin', 'Observer')`):
`/fa-trail`, `/utilization`, `/active-usage`, `/handover/export`, `/maintenance/export`,
`/fleet/export`, `/activity/export`, `/full`, `/stadiums`, `/stadiums/export`,
`/stadiums/export/pdf`, `/departments`, `/departments/export`, `/users`, `/users/export`,
`/users/export/pdf`, `/labels/docx`, `/labels/pptx`, `/labels/pdf`.

- [ ] **Step 5: Static verification — no inline scoping left**

Run:
```bash
cd backend && grep -n "role === 'Admin'" src/modules/reports/reports.controller.ts
```
Expected: no matches for venue-scoping blocks (a match is only acceptable if it is clearly
unrelated to stadium filtering — review each).

Run:
```bash
cd backend && grep -c "resolveStadiumScope(req.user, req.query.stadiumId)" src/modules/reports/reports.controller.ts
```
Expected: count ≥ 15.

- [ ] **Step 6: Typecheck + lint**

Run: `cd backend && npx tsc --noEmit && npx eslint src/modules/reports/reports.controller.ts src/modules/reports/reports.routes.ts`
Expected: clean.

- [ ] **Step 7: Manual HTTP verification against the dev server**

Start the backend (`cd backend && npm run dev`). In a second shell:

```bash
# get tokens
SA=$(curl -s -X POST localhost:3005/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"superadmin@gcms.com","password":"Admin@2024!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
AD=$(curl -s -X POST localhost:3005/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@gcms.com","password":"Admin@2024!"}'      | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')

# SuperAdmin: all venues
curl -s localhost:3005/api/v1/reports/utilization -H "Authorization: Bearer $SA" | head -c 200; echo
# Admin: own venue only
curl -s localhost:3005/api/v1/reports/utilization -H "Authorization: Bearer $AD" | head -c 200; echo
# Admin trying to override the scope — must return the SAME numbers as the line above
curl -s "localhost:3005/api/v1/reports/utilization?stadiumId=ANY_OTHER_ID" -H "Authorization: Bearer $AD" | head -c 200; echo
```
Expected: the two Admin responses are byte-identical; the SuperAdmin response differs
(covers more venues). Record the three outputs in the task notes.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/reports/reports.controller.ts backend/src/modules/reports/reports.routes.ts
git commit -m "fix: enforce venue scoping consistently on all report endpoints (Admin/FA locked, Contracts/MaintenanceTeam allowed)"
```

---

## Task 3: Logout returns to the login page with a full reload

**Files:**
- Modify: `frontend/src/stores/authStore.ts:115-119`
- Modify: `frontend/src/components/auth/ProtectedRoute.tsx:12-21`

**Interfaces:**
- Consumes: nothing new.
- Produces: `logout()` still has signature `() => void` but now, after clearing state,
  navigates the browser to `/login` via a full document load (`window.location.assign`).
  Safe to call when already unauthenticated / already on `/login` (no reload loop).

- [ ] **Step 1: Update `logout()` in `authStore.ts`**

Replace the `logout` implementation (currently lines 115-119) with:

```ts
logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set({ user: null, isAuthenticated: false });
    // Full document load so no in-memory state (React Query caches, component
    // state) survives. Guard against a reload loop when already on /login.
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.assign('/login');
    }
},
```

- [ ] **Step 2: Prevent the mount-time `logout()` in ProtectedRoute from looping**

In `frontend/src/components/auth/ProtectedRoute.tsx`, the mount effect calls `logout()`
when there is no token. With Step 1 that now triggers a redirect. That is the desired
behaviour, but ensure the "no token" branch does not *also* try to render `<Navigate>`
into a redirect race. Change the no-token branch (currently lines 16-21) to:

```ts
const token = localStorage.getItem('accessToken');
if (!token || !isAuthenticated || !user) {
    logout();          // clears state; redirects unless already on /login
    setVerified(false); // render <Navigate to="/login"> as the in-SPA fallback
    return;
}
```

(That is the existing code — confirm no change needed beyond Step 1. If `logout()` from
Step 1 is in place, being on `/login` already makes `window.location.assign` a no-op and
`<Navigate to="/login" replace>` is harmless.)

- [ ] **Step 3: Manual verification**

Rebuild is automatic (vite HMR). In the browser:
1. Log in as `superadmin@gcms.com`. Navigate to `/reports`.
2. Click the user menu → Logout.
   Expected: browser does a full load and lands on `/login`; URL is `/login`; the page
   is the login screen; no console errors.
3. Press the browser Back button.
   Expected: you are NOT returned into the app (ProtectedRoute bounces back to `/login`).
4. Reload `/login` directly.
   Expected: no redirect loop, page renders once.

- [ ] **Step 4: Typecheck + lint**

Run: `cd frontend && npx tsc --noEmit && npx eslint src/stores/authStore.ts src/components/auth/ProtectedRoute.tsx`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/authStore.ts frontend/src/components/auth/ProtectedRoute.tsx
git commit -m "fix: logout returns to /login with a full page reload"
```

---

## Task 4: Login page — "Submit a Request" / "Bookings" as side-by-side buttons

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx:101-108`

**Interfaces:**
- Consumes: existing `Button` from `@/components/ui/button`, `Link` from `react-router-dom`
  (both already imported in this file).
- Produces: no exports; the two navigation actions render as an equal-width two-button row
  (Request left, Bookings right) that stacks vertically below ~380px.

- [ ] **Step 1: Replace the stacked links block**

In `frontend/src/pages/LoginPage.tsx`, replace the current block (lines 101-108):

```tsx
<div className="mt-4 flex flex-col items-center gap-2 text-sm">
    <Link to="/request" className="text-primary hover:underline font-medium">
        Submit a Request
    </Link>
    <Link to="/book-pool" className="text-primary hover:underline font-medium">
        Bookings
    </Link>
</div>
```

with:

```tsx
<div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
    <Button asChild variant="secondary" className="w-full">
        <Link to="/request">Submit a Request</Link>
    </Button>
    <Button asChild variant="secondary" className="w-full">
        <Link to="/book-pool">Bookings</Link>
    </Button>
</div>
```

If `Button` does not support `asChild` in this codebase (check
`frontend/src/components/ui/button.tsx` for a `Slot`/`asChild` prop), use instead:

```tsx
<div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
    <Button type="button" variant="secondary" className="w-full" onClick={() => navigate('/request')}>
        Submit a Request
    </Button>
    <Button type="button" variant="secondary" className="w-full" onClick={() => navigate('/book-pool')}>
        Bookings
    </Button>
</div>
```

(`navigate` is already defined in this component.)

- [ ] **Step 2: Manual verification (incl. responsive)**

In the browser at `/login`:
1. Desktop (1280px): the two buttons sit side by side, equal width, filling the card;
   Request on the left, Bookings on the right.
2. Tablet (768px): still side by side.
3. Phone (375px): buttons stack vertically, each full width, still tappable (min 40px tall).
4. Click each button → lands on `/request` and `/book-pool` respectively.
5. No horizontal scrollbar on the page at 320px.

- [ ] **Step 3: Typecheck + lint**

Run: `cd frontend && npx tsc --noEmit && npx eslint src/pages/LoginPage.tsx`
Expected: clean. (If `Link` becomes unused after choosing the `navigate` variant, remove
it from the import to satisfy eslint.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/LoginPage.tsx
git commit -m "feat: login page shows Request and Bookings as side-by-side buttons"
```

---

## Task 5: Dashboard scope label for Admin / FA

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx` (header/scope-label area, ~lines 386-417 and the FA block ~90-130)

**Interfaces:**
- Consumes: existing `user` from `useAuthStore`, existing `isAdmin` boolean.
- Produces: no exports. The dashboard header shows an explicit, correct scope label and
  never renders a venue picker for `Admin` or `FA`.

- [ ] **Step 1: Confirm current behaviour**

Read `frontend/src/pages/DashboardPage.tsx`. Confirm:
- `isAdmin` (`user?.role === 'Admin'`) hides the `<Select>` venue filter (it does today —
  the filter is guarded by `!isAdmin`).
- `user?.role === 'FA'` renders the separate `FADashboard` with no picker (it does today).

If both hold, the only change is the label wording in Step 2. If either regressed, restore
the `!isAdmin` guard on the `<Select>` and the `role === 'FA'` early return.

- [ ] **Step 2: Make the scope label explicit**

In the dashboard header where the venue name is shown (around line 396-403), ensure the
label reads:
- `Admin`: `Showing: <user.stadium.name>` (their venue) — no "All Venues" option anywhere.
- `FA`: `Showing: your activity — <user.stadium.name>`.
- others: `Showing: All Venues` or `Showing: <selected venue>` when the filter is set.

Concretely, replace the ternary that computes the shown venue text with:

```tsx
{isAdmin
    ? `Showing: ${user?.stadium?.name ?? 'My Venue'}`
    : stadiumFilter
        ? `Showing: ${stadiums.find(s => s.id === stadiumFilter)?.name ?? 'Selected venue'}`
        : 'Showing: All Venues'}
```

and in `FADashboard` header add near the existing `Venue:` line:

```tsx
<p className="text-xs text-muted-foreground">Showing: your activity</p>
```

- [ ] **Step 3: Manual verification**

1. Log in as `admin@gcms.com`. Dashboard header says `Showing: <that venue>`; there is no
   venue dropdown anywhere on the page; numbers match the Task 2 curl output for the Admin
   token.
2. Log in as `superadmin@gcms.com`. Venue dropdown is present; default label
   `Showing: All Venues`; picking a venue updates the label and the stats.
3. Resize to 375px: header and stat cards reflow to a single column, no horizontal scroll.

- [ ] **Step 4: Typecheck + lint**

Run: `cd frontend && npx tsc --noEmit && npx eslint src/pages/DashboardPage.tsx`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx
git commit -m "fix: dashboard shows an explicit venue scope label for Admin and FA"
```

---

## Phase 1 Done-When

- `cd backend && npm test` passes (the `reports.scope` suite).
- An `Admin` token cannot widen its report/dashboard scope via `?stadiumId=`; a
  `SuperAdmin` can; `Contracts` / `MaintenanceTeam` can call the report read/export routes.
- Logging out from anywhere produces a full reload to `/login` and the Back button does not
  re-enter the app.
- `/login` shows Request + Bookings as a side-by-side button row that stacks on phones.
- The dashboard shows a correct, explicit scope label and no venue picker for Admin/FA.
- `npx tsc --noEmit` clean in both `backend/` and `frontend/`; `eslint` clean on all
  touched files.

## Self-Review Notes

- **Spec coverage:** §5.1 → Task 3; §5.2 → Task 4; §5.3 → Tasks 1, 2 (backend) + Task 5
  (frontend). §2a responsiveness is checked in Tasks 4 and 5 manual steps.
- **Deferred within spec bounds:** §5.3 says "audit *every* dashboard/report endpoint" —
  Task 2 covers the `reports` module, which is where all dashboard/report endpoints live.
  If a dashboard-feeding endpoint exists in another module (e.g. `handover/pool-dashboard`),
  scoping it is picked up in Phase 2 where that endpoint is actually modified.
- **No automated HTTP/UI tests:** deliberate — no harness exists; Phase 7 adds one. Manual
  steps here are explicit and reproducible.
