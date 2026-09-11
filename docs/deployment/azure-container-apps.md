# Deploying GCMS to Azure Container Apps

One image (root `Dockerfile`) runs both the API and the built React frontend from a
single Express process. Production dependencies: **Azure Database for PostgreSQL
Flexible Server**, **Azure Blob Storage**, and an **SMTP relay** (Azure Communication
Services or your O365 relay).

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
- **Frontend lint backlog:** `npm run lint` now runs (Phase 7 fixed the missing flat
  config) and reports ~58 pre-existing findings (empty catch blocks, missing
  `useEffect` deps, a few unused vars). Not fixed here — `npm run lint:strict` reproduces
  the original `--max-warnings 0` gate once that backlog is cleared.
