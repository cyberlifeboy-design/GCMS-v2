# Deploying GCMS to Azure Container Apps

One image (root `Dockerfile`) runs both the API and the built React frontend from a
single Express process. Production dependencies: **Azure Database for PostgreSQL
Flexible Server**, **Azure Blob Storage**, and an **SMTP relay** (Azure Communication
Services or your O365 relay).

> **2026-09-12:** the dev environment actually deployed (`rg-gcms-dev-qc-001`) does not
> use Container Apps or Postgres — see the note at the top of
> `GCMS-Azure-Deployment-Runbook.md` and `GCMS-Azure-Deployment-Report.docx`/`.pdf` for
> what was really built (two App Services + MySQL, all private-endpoint networking).

> **Not yet live-verified.** This guide, the `Dockerfile`, the Postgres migration, the
> Azure Blob driver, and the SMTP driver were all written and reviewed in a sandbox with
> no Docker/Postgres/Azure access. Before trusting this in production, run through
> "First deploy" below end-to-end in a real subscription and report back anything that
> doesn't match.

## 1. Overview

```
┌─────────────────────────────┐
│  Azure Container App          │  <- this repo's root Dockerfile, one image
│  (Express: API + static SPA)  │
└───────┬───────────┬──────────┘
        │           │
   Postgres      Blob Storage
   Flexible       Storage
   Server        Account
```

## 2. Provision

All commands assume `az login` has run and a target subscription is set
(`az account set --subscription <id>`).

```bash
RG=gcms-rg
LOCATION=uaenorth       # pick the region closest to your users
ACR_NAME=gcmsacr$RANDOM
PG_NAME=gcms-pg-$RANDOM
STORAGE_NAME=gcmsstore$RANDOM
CAE_NAME=gcms-env

az group create -n $RG -l $LOCATION

# Container Registry
az acr create -n $ACR_NAME -g $RG --sku Basic --admin-enabled true

# PostgreSQL Flexible Server
az postgres flexible-server create \
  -n $PG_NAME -g $RG -l $LOCATION \
  --admin-user gcms_admin --admin-password '<STRONG_PASSWORD>' \
  --sku-name Standard_B1ms --tier Burstable --version 16 \
  --storage-size 32 --public-access 0.0.0.0-255.255.255.255   # tighten to Container Apps' outbound IPs, or use a private endpoint, before go-live
az postgres flexible-server db create -s $PG_NAME -g $RG -d gcms

# Storage Account + Blob container
az storage account create -n $STORAGE_NAME -g $RG -l $LOCATION --sku Standard_LRS
az storage container create --account-name $STORAGE_NAME -n gcms-uploads

# Log Analytics + Container Apps Environment
az monitor log-analytics workspace create -g $RG -n gcms-logs
LOG_ID=$(az monitor log-analytics workspace show -g $RG -n gcms-logs --query customerId -o tsv)
LOG_KEY=$(az monitor log-analytics workspace get-shared-keys -g $RG -n gcms-logs --query primarySharedKey -o tsv)
az containerapp env create -n $CAE_NAME -g $RG -l $LOCATION \
  --logs-workspace-id $LOG_ID --logs-workspace-key $LOG_KEY
```

## 3. Secrets & environment variables

Every env var this codebase reads (see `backend/.env.example` for the authoritative
list). Split into Container App **secrets** (`secretref:`) for anything sensitive, and
plain `--set-env-vars` for the rest:

```bash
DB_URL="postgresql://gcms_admin:<STRONG_PASSWORD>@${PG_NAME}.postgres.database.azure.com:5432/gcms?sslmode=require"
STORAGE_CONN=$(az storage account show-connection-string --name $STORAGE_NAME -g $RG -o tsv)

az containerapp create \
  -n gcms -g $RG --environment $CAE_NAME \
  --image ${ACR_NAME}.azurecr.io/gcms:latest \
  --registry-server ${ACR_NAME}.azurecr.io \
  --target-port 3005 --ingress external \
  --min-replicas 1 --max-replicas 3 \
  --secrets \
    database-url="$DB_URL" \
    jwt-access-secret="$(openssl rand -base64 64)" \
    jwt-refresh-secret="$(openssl rand -base64 64)" \
    azure-storage-conn="$STORAGE_CONN" \
    smtp-pass='<YOUR_SMTP_PASSWORD>' \
  --env-vars \
    NODE_ENV=production \
    PORT=3005 \
    DATABASE_URL=secretref:database-url \
    JWT_ACCESS_SECRET=secretref:jwt-access-secret \
    JWT_REFRESH_SECRET=secretref:jwt-refresh-secret \
    JWT_EXPIRES_IN=7d \
    JWT_REFRESH_EXPIRES_IN=30d \
    CORS_ORIGIN=https://gcms.yourdomain.com \
    STORAGE_DRIVER=azure-blob \
    AZURE_STORAGE_CONNECTION_STRING=secretref:azure-storage-conn \
    AZURE_STORAGE_CONTAINER=gcms-uploads \
    EMAIL_DRIVER=smtp \
    SMTP_HOST=<your-relay-host> \
    SMTP_PORT=587 \
    SMTP_SECURE=false \
    SMTP_USER=<your-relay-user> \
    SMTP_PASS=secretref:smtp-pass \
    EMAIL_FROM="GCMS <noreply@yourdomain.com>" \
    LOG_LEVEL=info
```

(`az containerapp create` needs an image to already exist in ACR — do Step 4 first, then
this, or run `az containerapp update` with the same flags after an initial bare create.)

## 4. Build & push, ingress, TLS

```bash
az acr login -n $ACR_NAME
docker build -t ${ACR_NAME}.azurecr.io/gcms:$(git rev-parse --short HEAD) -t ${ACR_NAME}.azurecr.io/gcms:latest .
docker push ${ACR_NAME}.azurecr.io/gcms --all-tags

# Custom domain + managed TLS (after DNS CNAME points at the app's default *.azurecontainerapps.io hostname)
az containerapp hostname add -n gcms -g $RG --hostname gcms.yourdomain.com
az containerapp hostname bind -n gcms -g $RG --hostname gcms.yourdomain.com --environment $CAE_NAME
```

## 5. First deploy — migrate + seed

Run the migration and seed as a one-off job against the same image, before (or right
after) the app's first real revision goes live:

```bash
az containerapp job create -n gcms-migrate -g $RG --environment $CAE_NAME \
  --image ${ACR_NAME}.azurecr.io/gcms:latest \
  --trigger-type Manual --replica-timeout 300 \
  --secrets database-url="$DB_URL" \
  --env-vars DATABASE_URL=secretref:database-url \
  --command "npx" --args "prisma,migrate,deploy" \
  --workdir /app

az containerapp job start -n gcms-migrate -g $RG
```

Seed the first SuperAdmin the same way, swapping `--args` for the seed script
(`backend/package.json`'s `prisma:seed` script runs `tsx prisma/seed.ts` — the built
image has no `tsx`/dev deps, so run it via `node` against a pre-compiled seed, or run
`npx prisma db seed` from a machine with a network path to the database and the repo
checked out, pointed at `DATABASE_URL`). Either way, **rotate the seeded
`superadmin@gcms.com` / `Admin@2024!` password immediately** after first login.

## 6. Bringing local dev back up (this worktree needs a real Postgres now)

`prisma/schema.prisma` targets `postgresql` as of this phase — SQLite `dev.db` no longer
works. `docker-compose.yml` at the repo root already has a `postgres` service for this:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
# backend/.env: DATABASE_URL="postgresql://gcms_user:<DB_PASSWORD>@localhost:5431/gcms?schema=public"
cd backend
npx prisma migrate deploy
npx tsx prisma/seed.ts
npm run dev
```

## 7. Running the workflow test

`backend/src/modules/maintenance/maintenance.workflow.test.ts` mounts the full app and
wipes tables in `beforeEach` — never point it at the dev or prod database.

```bash
# stand up a throwaway Postgres (reuse the docker-compose one, or a fresh container)
docker run --rm -d --name gcms-test-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=gcms_test -p 5433:5432 postgres:16-alpine
cd backend
DATABASE_URL="postgresql://postgres:test@localhost:5433/gcms_test" npx prisma migrate deploy
DATABASE_URL="postgresql://postgres:test@localhost:5433/gcms_test" npm run test:workflow
docker rm -f gcms-test-pg   # discard the throwaway database afterward
```

## 8. Operations

- **Logs:** `az containerapp logs show -n gcms -g $RG --follow` streams stdout — the app
  logs structured JSON in production (see `backend/src/config/logger.ts`), queryable in
  the Log Analytics workspace created in Step 2.
- **Scaling:** `az containerapp update -n gcms -g $RG --min-replicas 2 --max-replicas 5`
  (add `--scale-rule-name http-rule --scale-rule-type http --scale-rule-http-concurrency 50`
  for HTTP-concurrency-based autoscale).
- **Rollback:** `az containerapp revision list -n gcms -g $RG -o table`, then
  `az containerapp ingress traffic set -n gcms -g $RG --revision-weight <prior-revision>=100`
  to shift all traffic back to a known-good revision without a new deploy.
- **Postgres backup/restore:** Flexible Server takes automated backups by default;
  `az postgres flexible-server restore -n <new-name> -g $RG --source-server $PG_NAME --restore-time <ISO8601>`
  for point-in-time restore.
- **Blob backup:** enable soft-delete and versioning on the storage account
  (`az storage account blob-service-properties update --account-name $STORAGE_NAME --enable-delete-retention true --delete-retention-days 14 --enable-versioning true`).

## 9. Go-live checklist

- [ ] All secrets set via `secretref:` (not plain env vars) for anything sensitive.
- [ ] `prisma migrate deploy` applied to the production database.
- [ ] Seed SuperAdmin created and its password rotated.
- [ ] `CORS_ORIGIN` matches the real production domain (not a wildcard, not localhost).
- [ ] Custom domain bound with managed TLS.
- [ ] `GET /api/v1/health` and `GET /api/v1/health/ready` both return 200.
- [ ] `STORAGE_DRIVER=azure-blob` and `EMAIL_DRIVER=smtp` explicitly set (not left on
      local/dev defaults).
- [ ] A real email send through the SMTP relay succeeded (e.g. trigger a maintenance
      "Email report" or a warning notice and confirm delivery).
- [ ] Logs are visible in the Log Analytics workspace.
- [ ] `npm audit fix` run in a working environment and the result reviewed (see §11 —
      could not run in this sandbox).

## 10. Known follow-ups (deferred out of this phase)

- **JSON-as-`String` columns** (`grantedPages`, `exportPreferences`, `photosUrls`,
  `additionalDrivers`, handover T&C checkboxes, `Announcement.targetUserIds`) were left
  as Prisma `String` rather than converted to `Json` — the spec allows this ("where
  safe; otherwise leave as `String` and note it"). Converting them is a real but
  separate piece of work touching `JSON.parse`/`JSON.stringify` call sites across 8+
  modules; do it as its own reviewed change, not bundled into a deploy.
- **Full Docker/Postgres/Azure live verification never ran in this sandbox** (no Docker
  available). `docker build`, `docker run`, `prisma migrate deploy` against a real
  Postgres, the `azure-blob` storage branch, and a real SMTP relay send are all
  written-and-reviewed only. Treat "First deploy" (Section 5) as the first real test.
- **Frontend lint backlog — resolved to 0 errors.** A follow-up codebase audit (see
  §11) fixed all 29 lint *errors* (empty catch blocks, a Rules-of-Hooks violation, an
  empty interface). 24 `react-hooks/exhaustive-deps` *warnings* remain, reviewed and
  left as-is (see §11) — `npm run lint:strict` will still fail on them since it uses
  `--max-warnings 0`; use `npm run lint` (the default, warnings allowed) day to day.

## 11. Codebase audit (2026-09-11)

A full-codebase review pass (correctness, security, performance, UX) on top of Phase 7.
Everything below was verified via `tsc --noEmit`, `vitest run`, `npm run build`, and
`npm run lint` in this sandbox — same Docker/Postgres/Azure caveat as §10 applies to
anything that needs live infrastructure.

**Fixed:**
- A real Rules-of-Hooks crash risk in `PoolBookingRequestPage` (hooks called after a
  conditional early return) — split into two components so each calls its own hooks
  unconditionally.
- ~10 empty `catch {}` blocks in `ReportsPage`/`DashboardPage` that silently swallowed
  API failures, leaving the UI stuck on an empty state with no explanation. Now surfaced
  via `toast.error(...)`, matching the pattern already used across the rest of the app.
  Blocking `alert('Export failed')` calls in `ReportsPage`'s 5 export handlers replaced
  with the same toast pattern.
- All 5 `multer` upload configs (fleet bulk-import, handover/incident/maintenance
  photos, settings branding logos) accepted **any** file type — only a size limit was
  enforced. Added `backend/src/middleware/uploadFilters.ts` restricting photo/logo
  uploads to JPEG/PNG/WebP/GIF and the bulk-import endpoint to xlsx/xls/csv, closing a
  stored-content risk (an uploaded HTML/SVG file being served back through the storage
  proxy route).
- Frontend lint errors: 29 → 0 (see §10's updated bullet above).
- `DashboardPage`'s JS chunk (443KB / 117KB gzipped, dominated by `recharts`) split into
  cacheable vendor chunks via `vite.config.ts` `manualChunks` — Dashboard's own chunk is
  now 28.5KB / 7KB gzipped. Same total bytes on a cold load; better caching across
  deploys since vendor code no longer changes hash when app code does.
- Login page given a real visual pass (gradient background, card shadow, a branded icon
  badge in the default/no-custom-logo state) — purely visual, branding overrides
  unchanged.

**Reviewed and found sound (no change needed):**
- XSS: the one `dangerouslySetInnerHTML` use (`RichContent`, rendering admin-authored
  rich text) is safe because `backend/src/middleware/sanitize.middleware.ts` runs
  DOMPurify over every request body/query/params globally before anything is persisted.
- JWT secrets: `backend/src/config/auth.ts` throws on boot in production if
  `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` are unset (dev-only fallback otherwise).
- Rate limiting: `authLimiter` (5/15min in prod) is wired to `/login`,
  `/forgot-password`, and `/reset-password`; `apiLimiter` (100/min) is global.
- No raw SQL string interpolation (`$queryRaw` is used once, for a parameterized
  `SELECT 1` health check — not user input).
- Role/privilege-escalation guards in `users.controller.ts` are real and specific (an
  `Admin` cannot change a user's role, can only create/manage `FA`-role users, etc.) —
  not just route-level `requireRole`.

**Known, accepted design trade-off (not changed):**
- The storage proxy (`GET /api/v1/storage/:bucket/:filename`) has no authentication —
  it relies on filenames being unguessable UUIDs, not a real ACL. This is intentional:
  the `branding` bucket is genuinely public (shown to anonymous visitors on the public
  booking/confirmation pages), and URLs for `signatures`/`incident-photos`/
  `maintenance-photos` are returned as plain `<img src>` paths with no way for a browser
  to attach an Authorization header — retrofitting real per-bucket auth means either
  cookie-based sessions or short-lived signed URLs, a larger change than this pass
  should make blind. Flagging it here as a deliberate next-hardening candidate, not a
  silent gap.

**Dependency vulnerabilities — found, not auto-fixed in this sandbox:**
`npm audit` (backend, production deps) reports 30 known vulnerabilities (2 critical, 15
high, 13 moderate). `npm audit fix` could not be run here — this sandbox's npm 10.9.8
hits a reproducible arborist bug (`Cannot read properties of null (reading 'edgesOut')`)
resolving `vitest`'s optional peer dependencies, on both `npm install` and
`npm audit fix`; confirmed by deleting and restoring `node_modules`/`package-lock.json`
twice. **Package-lock.json in this repo is unchanged** (restored via `git checkout` +
`npm ci` after each failed attempt) — `tsc`/tests were re-verified clean afterward.
Run this in a normal environment before the next deploy:

```bash
cd backend
npm audit fix                 # non-breaking: body-parser, brace-expansion, dompurify,
                               # express-rate-limit, fast-xml-parser (critical), ip-address,
                               # lodash, minimatch, minio, morgan, nanoid, path-to-regexp,
                               # query-string, resend, stream-json, svix, tmp, undici
npm audit                     # re-check what's left
```

The remaining findings need a deliberate major-version bump, reviewed and tested on its
own (not blindly `--force`d):
- `xlsx` — **no fix available upstream** (prototype pollution + ReDoS in SheetJS); no
  action possible until the maintainer ships one or the codebase moves off `xlsx`.
- `bcrypt` → 6.0.0 (major) — used for password hashing; re-test login/password-reset
  fully after bumping.
- `exceljs` → 3.4.0 (npm reports this as the fix target, which is a *downgrade* from the
  current `^4.4.0` — verify report/export output before adopting; may be an npm
  resolver quirk worth re-checking independently).
- `express` → 5.2.1 (major) — routing/middleware API changes; needs its own test pass
  across all ~20 route modules, not a drive-by bump.
- `nodemailer` → 10.0.7 (major) — re-test SMTP + Resend email sending after bumping.
- `pptxgenjs` → 1.1.5 (npm's reported fix target, also a downgrade from `^4.0.1`) — same
  caveat as `exceljs`; verify PPTX label export still works before adopting.

## 12. Session update (2026-09-12)

Feature work landed on top of Phase 7, still within the same deployment shape (no new
managed resources, no breaking env var renames):

- **Fleet Management**: assigning a Focal Point now auto-syncs the cart's `departmentId`
  from that user's own department (`fleet.service.ts`); the assignment-matrix query now
  actually returns FA department data (it silently didn't before).
- **Pool status**: pool carts now display a distinct "Pool" status everywhere instead of
  borrowing "Available"/"Assigned"; Fleet Management's per-venue card shows a pool-car
  count.
- **Pool booking reminders + extensions** (new): an in-process poller in `server.ts`
  (60s interval, `POOL_REMINDER_MINUTES_BEFORE`, default 30) notifies the FA and venue
  Admin/SuperAdmin as a booking's return time approaches, and again once if it passes
  unreturned. FAs can request an extension; only Admin/SuperAdmin can approve it
  (`POST/PATCH /pool-booking-requests/:id/extension`). The poller is safe under multiple
  Container Apps replicas — each tick claims a row with a conditional `updateMany`
  before notifying, so only one replica ever sends a given reminder.
- **Handover Cycle**: "Carts Awaiting Handover Form" now renders above "Handback
  Requests" (previously reversed); the handover form's duplicated header block was
  removed, and Serial Number / FA Code are now genuinely system-fetched read-only
  fields (previously blank on a brand-new form since the cart record was never actually
  loaded client-side) — fixed by fetching the Fleet record directly (`GET /fleet/:id`,
  now also returning `accreditationNumber`) when a form doesn't exist yet.
- **Incident Report** (new): `Incident` gained `formData` (JSON, the full
  template-matched form), `formSignatureData`/`formSignedAt`/`formSignedById`, and
  `escalatedToContracts`/`escalatedToMaintenance`/`escalatedAt`. New endpoints
  `PATCH /incidents/:id/form`, `POST /incidents/:id/form/sign`,
  `POST /incidents/:id/escalate` (notifies the Contracts/Maintenance roles via
  `notificationService.createForRoles`). The incident PDF (`pdf.service.ts`) now renders
  every template field when present.
- **Warning Tickets**: the existing 3-level warning/block system is now driven by a
  16-violation catalog (`frontend/src/lib/ticketCatalog.ts`) matching the LOC's
  documented ticket criteria, surfaced as "Issue a Ticket" in the Incidents UI. No
  backend/schema change — same `Warning` model and `/warnings` endpoints as before.
- **Login page**: restyled to match the organization's other SC/LOC portals (gradient
  theme, layout, button styling) — static asset/branding change only, no auth behavior
  change. The Microsoft sign-in button is still a placeholder (`toast.info(...)`); no
  OAuth route exists yet.
- **Migrations**: `20260912173213_incident_form_and_ticket_fields`,
  `20260912173805_pool_booking_reminders_and_extensions` — both additive-only, applied
  automatically by `prisma migrate deploy` (Section 5) with no manual data backfill
  needed.
- **New env var**: `POOL_REMINDER_MINUTES_BEFORE` (optional, default `30`) — see the
  entry added inline near `LOG_LEVEL` above and in `backend/.env.example`.
