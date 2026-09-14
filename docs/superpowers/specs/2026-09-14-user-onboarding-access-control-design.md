# User Onboarding & Access Control — Design Spec

**Date:** 2026-09-14
**Status:** Approved for planning

## 1. Overview

GCMS currently has exactly one way to get a login: a SuperAdmin/Admin manually creates a `User` row via User Management, with a system-generated or chosen password, and never tells the person how to get in. There is no self-service path, no invitation path, and the login page's "Sign in with your SC/LOC account" button is a placeholder toast (`2026-09-08-pool-booking-system-design.md` explicitly deferred real Entra/Azure AD SSO).

This spec adds three ways for a field user (FA) to get an account, all converging on one venue-scoped approval workflow, plus real Microsoft Entra ID SSO:

1. **Self-service SSO request** — user clicks "Sign in with your SC/LOC account," authenticates with Microsoft, and — if no matching GCMS account exists — is dropped into a request form with their verified email locked, picks a venue + FA department, and submits.
2. **Invitation link** — Admin/SuperAdmin emails an invite link; opening it shows the same request form with the email locked from the invite instead of from SSO.
3. **Direct admin-created account** — Admin/SuperAdmin creates the account outright (existing flow), the user gets emailed their credentials, and must change their password on first login.

Paths 1 and 2 both produce an `AccessRequest` reviewed by the Admin assigned to that venue (or any SuperAdmin), exactly like the existing `CarRequest` review flow. Once approved, the resulting account signs in via Microsoft SSO. Path 3 is a direct local-password account.

## 2. Goals

- One shared request-and-approval pipeline for SSO/invite-originated accounts, scoped by venue the same way `CarRequest` already is (Admin sees only their own venue; SuperAdmin sees all).
- Real Microsoft Entra ID SSO: a public-client MSAL flow (no client secret), backend-verified via Microsoft's JWKS, matching an existing `User` by email/OID.
- Approved SSO/invite accounts are FA-role, tied to one department, and inherit the FA cart-access scoping that already exists in `fleet.controller.ts`/`fleet.service.ts` — no new authorization logic needed there.
- Admin-created accounts force a password change on first login.
- The Microsoft SSO wiring must work the moment Ahmed (IT admin) supplies `MSAL_TENANT_ID`/`MSAL_CLIENT_ID` as app settings — no code changes required at that point.

## 3. Non-Goals (out of scope for this pass)

- Building/registering the Entra ID App Registration itself — that's Ahmed's side; we only consume the Tenant ID + Client ID he provides.
- Letting the approving admin choose a role other than FA for SSO/invite-approved accounts (per your decision, always FA; role can still be changed afterward in User Management).
- Self-service password reset changes — existing forgot-password flow is untouched and remains local-password-only (SSO accounts don't have a usable password).
- Running the Azure `prisma db push` / image rebuild ourselves — same standing blocker as the rest of this project (no CLI access; needs a machine inside the VNet). This spec ends with documented next steps for that, not a completed deployment.

## 4. Data Model

### `User` — new fields

```prisma
authProvider       String    @default("local") // "local" | "microsoft"
microsoftOid       String?   @unique            // Entra object id, captured on first SSO login
mustChangePassword Boolean   @default(false)
```

`authProvider: "microsoft"` accounts get a random, never-shared `passwordHash` (bcrypt hash of a random 32-byte value) — local password login is rejected for these accounts with a message pointing them to the SSO button.

### New model: `AccessRequest`

```prisma
model AccessRequest {
  id             String    @id @default(cuid())
  requestNumber  Int       @unique @default(autoincrement())

  name           String
  email          String
  phone          String?

  stadiumId      String
  stadium        Stadium    @relation(fields: [stadiumId], references: [id])
  departmentId   String
  department     Department @relation(fields: [departmentId], references: [id])

  source         String     // "sso" | "invite"
  invitationId   String?
  invitation     Invitation? @relation(fields: [invitationId], references: [id])

  requestToken   String     @unique // public link for the confirmation page
  status         String     @default("Pending") // Pending, Approved, Rejected
  reviewedById   String?
  reviewedBy     User?      @relation("AccessRequestReviewer", fields: [reviewedById], references: [id])
  reviewedAt     DateTime?
  reviewNotes    String?    @db.Text

  createdUserId  String?    // set once approval creates the User

  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  @@index([status])
  @@index([stadiumId])
  @@index([departmentId])
  @@index([requestToken])
}
```

### New model: `Invitation`

```prisma
model Invitation {
  id            String    @id @default(cuid())
  email         String
  stadiumId     String?
  departmentId  String?
  invitedById   String
  invitedBy     User      @relation("InvitationInvitedBy", fields: [invitedById], references: [id])
  token         String    @unique
  status        String    @default("Pending") // Pending, Used, Revoked, Expired
  expiresAt     DateTime
  accessRequests AccessRequest[]
  createdAt     DateTime  @default(now())

  @@index([status])
  @@index([email])
}
```

`Notification.type` gains `AccessRequest`, `AccessRequestApproved`, `AccessRequestRejected` (string field, no enum migration needed — same pattern as existing types).

## 5. Backend

### New module: `access-requests` (mirrors `modules/requests`)

Public routes (no auth):
- `POST /api/v1/public/access-requests` — body `{ name, email, phone?, stadiumId, departmentId, invitationToken? }`. If `invitationToken` present, validates it (Pending, not expired), locks `email` to the invitation's email server-side (ignores/rejects a mismatched body email), marks the invitation `Used` on submit. Creates the `AccessRequest`, notifies venue-scoped Admins/SuperAdmins via `notificationService.createForRoles(..., stadiumId)` — same call shape `requestsService.createRequest` already uses.
- `GET /api/v1/public/access-requests/:token` — confirmation-page lookup.
- `GET /api/v1/public/invitations/:token` — validate an invite link before showing the form (returns email/venue/department to prefill, or an error if used/expired/revoked).

Reuses existing `GET /api/v1/public/stadiums` and `GET /api/v1/public/departments?stadiumId=`.

Authenticated routes, same RBAC shape as `requests.routes.ts`:
- `GET /api/v1/access-requests` — Admin filtered to `req.user.stadiumId`, SuperAdmin unfiltered.
- `GET /api/v1/access-requests/:id`
- `POST /api/v1/access-requests/:id/approve` — `{ reviewNotes? }`. Creates the `User` (`role: "FA"`, `authProvider: "microsoft"`, random unusable password hash, `stadiumId`/`departmentId` from the request, `mustChangePassword: false`), stamps `createdUserId`, emails the requester "you're approved — sign in with your SC/LOC account," in-app-notifies if they already had some other account (shouldn't normally happen).
- `POST /api/v1/access-requests/:id/reject` — `{ reviewNotes? }`, emails the requester with the reason.
- `DELETE /api/v1/access-requests/:id` — SuperAdmin only, same as `CarRequest`.

### New module: `invitations`

- `POST /api/v1/invitations` (Admin/SuperAdmin) — `{ email, stadiumId?, departmentId? }`, generates a token, 7-day `expiresAt`, emails the link `${FRONTEND_URL}/access-request?invite=<token>`.
- `GET /api/v1/invitations` (Admin/SuperAdmin) — list, venue-filtered for Admin same as everything else.
- `POST /api/v1/invitations/:id/revoke` (Admin/SuperAdmin).

### Auth module changes (`auth.service.ts`, `auth.controller.ts`, `auth.routes.ts`)

- `login()`: if `user.authProvider !== 'local'`, reject with a clear message ("This account signs in with your SC/LOC Microsoft account") instead of comparing passwords.
- `login()` response includes `mustChangePassword` so the frontend can force the change-password screen immediately after a successful local login.
- New `POST /api/v1/auth/microsoft` — body `{ idToken }`. Verifies the JWT against Microsoft's JWKS (`https://login.microsoftonline.com/<tenant>/discovery/v2.0/keys` via `jwks-rsa`), checking `iss`/`aud` (= `MSAL_CLIENT_ID`)/`tid` (= `MSAL_TENANT_ID`)/expiry. On success, extracts `email` (from `preferred_username`/`email` claim) and `oid`:
  - Existing `User` matched by `microsoftOid` or by `email` (backfilling `microsoftOid` on first match) who is active/not blocked → issue our normal access+refresh tokens, same shape as local login.
  - No match → `404` with `{ email, name }` from the verified token (never from client-supplied data) so the frontend can prefill the request form with a value it cannot tamper with.
  - `authProvider === 'local'` user matching that email → still allow linking (sets `authProvider: 'microsoft'`, `microsoftOid`) — supports a case where an admin-created local account belongs to someone who later gets SSO; not a path this spec drives traffic through, but shouldn't be dead-ended either.
- Env vars: `MSAL_TENANT_ID`, `MSAL_CLIENT_ID` (backend, for verification) — read at request time so an empty/missing value fails closed with a clear 503 ("Microsoft sign-in is not configured yet") rather than a confusing JWT error.

### `users.service.ts` changes (admin-created accounts, path 3)

- `create()` gains `mustChangePassword: true` by default when the caller doesn't supply a password (i.e., whenever a temp password was generated) and always emails the credentials (name, email, temp password, login URL) via `emailService` — mirrors the pattern of `forgotPassword`'s reset email, best-effort (failure logged, doesn't fail the create call).

## 6. Frontend

- **`LoginPage.tsx`**: the existing placeholder button becomes a real MSAL login trigger (`@azure/msal-browser` + `@azure/msal-react`, `PublicClientApplication` configured from `VITE_MSAL_CLIENT_ID`/`VITE_MSAL_TENANT_ID`, redirect URI `/auth/microsoft/callback` — the path Ahmed already has). If those env vars are unset, the button keeps today's "coming soon" toast instead of throwing. On successful MSAL login, POST the ID token to `/api/v1/auth/microsoft`:
  - `200` → store tokens, navigate in (same as local login), respecting `mustChangePassword`.
  - `404` → navigate to `/access-request` with `name`/`email` passed via route state (not query string, so they're not user-editable or bookmarkable-wrong).
- **New `/auth/microsoft/callback` route** — MSAL redirect handler (renders nothing but completes the MSAL redirect promise, then re-runs the same 200/404 handling above).
- **New `AccessRequestPage.tsx`** (public, `/access-request`, optional `?invite=` query param) — mirrors `PublicRequestPage.tsx`'s structure: name (prefilled/editable, or from invite — locked if invite specifies no name is collected, just email), email (read-only, sourced from SSO route-state or invite lookup — never a free-text field), phone, venue `<select>` (active stadiums), department `<select>` (active departments for the chosen venue, i.e. "FA" department list), submit → confirmation screen showing the request number + "you'll be notified once reviewed."
- **New `RequestConfirmationPage`-style route** `/access-request/confirm/:token` (same pattern as the existing `/request/confirm/:token`).
- **`RequestsManagementPage.tsx`**: add an "Account Access" tab (or a sibling page reusing its table/approve/reject dialog pattern) backed by `access-requests` endpoints — Admin sees only their venue, SuperAdmin sees all, same as today.
- **User Management page**: add an "Invite User" action opening a small dialog (email, optional venue/department) that calls `POST /api/v1/invitations`; add an "Invitations" list/tab to see pending/used/revoked/expired invites with a revoke action.
- **Forced password change**: after a local login response with `mustChangePassword: true`, route straight to a new `/force-change-password` screen (reuses the existing change-password endpoint/form fields) and block navigation elsewhere until it succeeds, then proceed to `/`.

## 7. Error handling

- Every email send in this feature (approval, rejection, invite, credentials) is best-effort: failures are logged, never block the underlying state change — matches the existing `requestsService`/`forgotPassword` pattern exactly.
- Submitting an `AccessRequest` against a venue/department that's since been deactivated is rejected with a 400 at submit time (re-validate `isActive` server-side, don't trust a stale dropdown).
- An invitation token that's expired/used/revoked returns a clear error from `GET /api/v1/public/invitations/:token` before the form even renders, rather than failing at submit.
- Double-submitting the same Microsoft account while a request is still Pending: `POST /api/v1/public/access-requests` checks for an existing Pending `AccessRequest` with that email and returns it instead of creating a duplicate.
- MSAL/token-verification failures (expired token, wrong tenant, clock skew) surface as a single generic "Sign-in failed, please try again" toast — no raw JWT error text reaches the browser.

## 8. Testing

- Backend: unit tests for `access-requests.service.ts` (create/approve/reject/venue-scoping, mirroring the existing `requests.service.ts` tests if present) and `invitations.service.ts` (token expiry/revoke/consume-once). A focused test for the JWKS-verification helper using a mocked signing key rather than hitting live Microsoft endpoints.
- Manual/local verification (no real Entra tenant available yet): exercise flows 2 and 3 fully end-to-end against local Docker Desktop stack; flow 1's request-form half can be exercised by hitting `/access-request` directly with route state, since the actual MSAL round-trip needs Ahmed's real Tenant/Client ID to test against. Document this gap plainly rather than claiming SSO is verified when it isn't.

## 9. Azure follow-up (not executed by this spec)

- New Prisma migration (this feature's schema changes) needs `prisma db push` from inside the VNet — same standing blocker as the existing pending migration; batch together.
- Two new app settings on `app-gcms-be-dev-qc-001` and the frontend: `MSAL_TENANT_ID`/`VITE_MSAL_TENANT_ID`, `MSAL_CLIENT_ID`/`VITE_MSAL_CLIENT_ID`, once Ahmed's App Registration exists.
- Image rebuild required (same ACR-build gap already documented for the pending Instant Booking/SSH/SMTP changes) — this feature's code lands in the same "committed and pushed, not yet deployed" bucket until that's resolved.
