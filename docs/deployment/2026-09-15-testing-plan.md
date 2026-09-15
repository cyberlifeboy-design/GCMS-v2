# GCMS Dev Environment — Post-Migration Testing Plan (2026-09-15)

**Target:** `https://app-gcms-fe-dev-qc-001-hvdabbawhjcnfhc0.qatarcentral-01.azurewebsites.net`

The Azure dev migration (App Service ×2 + MySQL, Entra ID SSO) is code-complete and
deployed — see `GCMS-Azure-Deployment-Runbook.md`'s status banner for the full deployment
history. This doc is the checklist for the next phase: functional/UAT testing of what's
now live. Nothing here is a deployment step; if a check below fails, log it as a bug, not
a redeploy trigger, unless the failure is clearly infrastructure (500s, timeouts, DB
connection errors).

> **Cache tip:** if a page looks stale (old logo, missing "Track a request" link, old
> "Coming soon" SSO placeholder), hard-refresh (Ctrl+Shift+R) before assuming it's a bug —
> `index.html` has no explicit `Cache-Control` header yet, so browsers occasionally serve
> a cached pre-rebuild copy. See the runbook's status banner for the permanent fix (add a
> no-cache header in `frontend/Dockerfile`'s nginx template).

## 1. New: Microsoft SSO / Access Control (untested end-to-end — priority)

- [ ] **SSO login round-trip.** From `/login`, click "Sign in with your SC/LOC account"
      with a real `@sc.qa`/LOC Entra account. Expect: redirect to
      `login.microsoftonline.com` → Microsoft login → redirect back to
      `/auth/microsoft/callback` → landed in the app, logged in.
      - First-time SSO user with no matching GCMS account: confirm the app's actual
        behavior (should route to `/access-request` or show a clear message, not a raw
        error — check `MicrosoftCallbackPage.tsx` if the behavior is unclear).
      - Existing user whose email matches an Entra account: confirm they land logged in
        without needing a password.
- [ ] **Access Request flow** (`/access-request`, reachable directly with no prior
      state). Submit a request (name, email, justification). Confirm:
      - Request appears in the **Account Access** admin page (`/access-requests`,
        SuperAdmin/Admin nav item).
      - Approving a request creates a real user and sends an invitation/notification.
      - Rejecting a request is reflected correctly, requester not left in limbo.
- [ ] **Invitation flow.** From Account Access page, invite a new user by email. Confirm:
      - Invitation email is sent (SMTP is configured on the backend — check Settings →
        Email tab if it doesn't arrive, or check spam).
      - The invite link (`/invite/<token>`) lets the invitee set a password and creates
        their account with the right role/department.
      - An expired or already-used token shows a clear error, not a crash.
- [ ] **Forced password change.** Create a user via invite or admin-create; confirm they
      are forced to change their password on first login before reaching the dashboard.
- [ ] **Account Access admin page** — full CRUD/oversight: list pending requests, list
      sent invitations, resend/revoke an invitation, filter/search.

## 2. Regression: existing features (confirm nothing broke)

Run through each briefly — these were all working pre-migration, just re-confirm on the
live Azure environment specifically (local Docker Desktop testing already covered them):

- [ ] **Fleet** (`/fleet`) — list/filter/create/edit/delete a cart, bulk import/export,
      assign FA, pool toggle, report maintenance.
- [ ] **Fleet Management** (`/fleet-management`) — assignment matrix, bulk assign/unassign,
      assignment history, pool cars tab.
- [ ] **Bookings** (`/bookings`) — scheduled and instant pool bookings, approval flow,
      handover/handback PDFs.
- [ ] **Maintenance** (`/maintenance`) — report → resolve flow, photo attachments, PDF
      report with embedded photos.
- [ ] **Departments** (`/departments`) — per-venue activate/deactivate, focal point
      assignment.
- [ ] **Incidents** (`/incidents`) — ticket creation/escalation, PDF email on escalation.
- [ ] **Reports** (`/reports`) — Excel/PDF exports render correctly with real seeded data.
- [ ] **Settings** (`/settings`) — SMTP tab shows configured values (password masked),
      "Send Test Email" works.
- [ ] **Notifications** (`/notifications`) — in-app + email notifications fire for the
      above flows.
- [ ] **Public pages** (no login): `/book-pool`, `/request` (car request), `/request/track`.

## 3. Known non-blocking issues (don't re-report these as new bugs)

- `index.html` browser-caching quirk (see cache tip above) — cosmetic, not a data issue.
- `GET /health/ready` on the backend returns an unexpected payload shape (flagged in the
  original Azure deployment report, not yet fixed) — use `GET /health` or
  `GET /api/v1/health` instead when checking liveness.
- `npm audit` has open findings (some need a reviewed major-version bump) — see
  `README.md`'s pre-production checklist; not a functional blocker for dev testing.
- The provisioned Key Vault (`rg-gcms-dev-qc-001`) is unused — no action needed for
  testing.

## 4. Access & credentials for testing

- Use your own SC/LOC Microsoft account for SSO testing (§1).
- For email/password login testing, use an account seeded/created during this migration —
  **do not use the old published `superadmin@gcms.com` / `Admin@2024!` from the repo docs**,
  it's expected to be rotated (confirmed rejecting login as of 2026-09-15) and is
  documented in the repo's own README as a *local dev* default, not a real credential.
  Ask Ahmed for current Azure dev admin credentials, or create your own account via the
  Access Request flow (§1) — a good first test in itself.

## 5. Reporting results

Log findings against this checklist (a copy in the Obsidian vault's GCMS project note, or
directly as GitHub issues on `cyberlifeboy-design/GCMS-v2`) — group by section number so
it's clear whether something is a new-feature bug (§1, likely real) vs. a regression (§2,
likely environment-specific) vs. already-known (§3, skip).
