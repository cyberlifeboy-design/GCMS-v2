# GCMS - Golf Cart Management System
## Full System Workflow Documentation

**Repository:** O96a/GCMS  
**Generated:** 2026-03-21 | **Last major update:** 2026-09-12  
**Status:** Production-ready — Azure migration in progress, see `docs/deployment/GCMS-Azure-Deployment-Runbook.md`

> **Note:** Sections 3, 5, 8 and 12 below (roles, fleet status flow, ports, feature
> flags) predate several phases of work and have been corrected as of 2026-09-12.
> Sections 10 ("Known Issues") and 11 ("Test Credentials") are historical — check
> `docs/superpowers/plans/` for the current phase-by-phase status instead of trusting
> those two sections at face value.

---

## 1. System Overview

**GCMS** is a Golf Cart Management System for multi-venue sports events. It manages a fleet of golf carts with:
- Check-in/Check-out tracking
- Issue reporting & maintenance
- Role-based access control (RBAC)
- Multi-stadium support
- Real-time utilization reporting

---

## 2. Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Node.js + Express + TypeScript |
| **Database** | PostgreSQL (via Prisma ORM) |
| **Storage** | MinIO (photos & branding) |
| **Frontend** | React 18 + Vite + Tailwind CSS + Zustand |
| **Auth** | JWT (access + refresh tokens) |
| **Ports** | Backend: 3005, Frontend (Vite dev): 3000 |

---

## 3. User Roles (RBAC)

| Role | Permissions |
|------|-------------|
| **SuperAdmin** | Full system access — all venues, users, settings, stadiums |
| **Admin** | Own venue only — manage FA users, fleet, view reports, sign handover/incident forms, approve pool extensions |
| **FA (Fleet Attendant)** | Check in/out assigned carts, report issues, request pool booking extensions |
| **Observer** | Read-only — view everything across all venues |
| **Contracts** | Receives incident escalations for contract/legal follow-up |
| **MaintenanceTeam** | Receives incident escalations and maintenance workflow tasks |

---

## 4. Database Models

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Stadium   │────<│    Fleet    │>────│    User     │
│             │     │   (Carts)   │     │  (FA/Admin) │
└─────────────┘     └──────┬──────┘     └──────┬──────┘
                          │                   │
                          │                   │
                    ┌─────┴─────┐       ┌─────┴─────┐
                    │ HandoverLog│       │MaintenanceLog
                    └───────────┘       └───────────┘
                          │                   │
                    ┌─────┴─────┐       ┌─────┴─────┐
                    │  AuditLog │       │ Notification│
                    └───────────┘       └───────────┘
```

### Core Entities

| Model | Purpose |
|-------|---------|
| **Stadium** | Venue/location with fleet and users |
| **Department** | Sub-entity within stadium, has focal point |
| **Fleet** | Golf cart with carNumber, type, status, assignment |
| **User** | System user with role-based permissions |
| **HandoverLog** | Check-in/out events with condition notes |
| **MaintenanceLog** | Issue reports with photos, status tracking |
| **CarRequest** | Public request form for departments |
| **Notification** | System alerts for users |
| **Announcement** | Scheduled/push announcements |
| **SystemSettings** | Global config, branding, feature toggles |

---

## 5. Fleet Status Flow

```
                    ┌──────────────────┐
                    │   Available      │ ← Initial state
                    └────────┬─────────┘
                             │
                     FA checks out
                             │
                             ▼
                    ┌──────────────────┐
                    │   Dispatched     │ ← Assigned to FA
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
         Check in       Issue reported   Timeout
              │              │              │
              ▼              ▼              ▼
        ┌─────────┐  ┌──────────────┐  ┌─────────┐
        │Available│  │Under Maint. │  │Dispatched│
        └─────────┘  └──────┬───────┘  └─────────┘
                            │
                      Issue resolved
                            │
                            ▼
                      ┌───────────┐
                      │ Available │
                      └───────────┘
```

> **Correction (2026-09-12):** the diagram above is the original Phase 1 design and is
> no longer accurate. The actual `Fleet.status` values in use today are: `Available`,
> `Assigned` (Focal Point set, handover not yet signed), `Active` (handover complete,
> in service), `Dispatched` (checked in for a usage session), `Returned` (checked out,
> awaiting handback), `HandbackPending` (handback requested, awaiting Admin sign-off),
> `Under Maintenance`, and `Retired`. Pool carts (`Fleet.isPool = true`) display as a
> distinct **Pool** status in the UI regardless of the underlying value, since they have
> no dedicated Focal Point. See Section 15 below for the pool booking and handover
> workflows that actually drive these transitions.

### Cart Types
- **Cargo** — Cargo/utility cart
- **Accessibility** — Accessible cart
- **6-Seater** — Passenger cart
- **4-Seater** — Standard passenger cart

---

## 6. Core Workflows

### 6.1 Authentication Flow

```
┌─────────────┐    POST /auth/login    ┌─────────────┐
│   User      │ ──────────────────────▶│   Backend   │
│  (Frontend) │                        │             │
└─────────────┘                        └──────┬──────┘
       │                                      │
       │                              Verify credentials
       │                                      │
       │                              Generate JWT
       │                                      │
       │◀───────── access + refresh ──────────┤
       │           tokens (JSON)              │
       │                                      │
       │      Store in Zustand                │
       │      (persistent storage)            │
       │                                      │
       │      Axios interceptor adds          │
       │      Authorization header             │
       └──────────────────────────────────────┘
```

### 6.2 Fleet Management Flow

```
SuperAdmin/Admin:
┌──────────────────────────────────────────────────────┐
│  1. Create Stadium(s)                                │
│  2. Create Departments (optional)                    │
│  3. Create Fleet (add carts)                         │
│     - carNumber, carType, stadiumId                 │
│     - Optional: assign to department                 │
│  4. Bulk Import via XLSX                             │
│  5. Assign FA users to specific carts                │
└──────────────────────────────────────────────────────┘

FA User:
┌──────────────────────────────────────────────────────┐
│  1. View "My Assigned Carts" only                   │
│  2. Cannot create/delete carts                      │
│  3. Can only interact with assigned fleet           │
└──────────────────────────────────────────────────────┘
```

### 6.3 Handover Flow (Check-out/Check-in)

```
FA checks out cart:
┌─────────────────────────────────────────────────────────┐
│  1. FA selects available cart                           │
│  2. Opens check-out modal                               │
│  3. Enters condition notes (optional)                   │
│  4. POST /handover/checkout                             │
│     - fleetId, userId, conditionNotes                   │
│  5. System:                                             │
│     - Fleet.status → "Dispatched"                      │
│     - Creates HandoverLog (action: CheckedOut)         │
│  6. Cart now shows as "Dispatched"                      │
└─────────────────────────────────────────────────────────┘

FA checks in cart:
┌─────────────────────────────────────────────────────────┐
│  1. FA selects dispatched cart                          │
│  2. Opens check-in modal                                │
│  3. Reports condition + any issues                      │
│  4. If issue reported:                                  │
│     - Creates MaintenanceLog (status: Open)            │
│     - Fleet.status → "Under Maintenance"                │
│  5. If no issue:                                        │
│     - Fleet.status → "Available"                        │
│  6. Creates HandoverLog (action: CheckedIn)             │
└─────────────────────────────────────────────────────────┘
```

### 6.4 Maintenance Flow

```
Issue Reported (from Check-in or Direct Report):
┌─────────────────────────────────────────────────────────┐
│  1. FA/Admin creates issue report                       │
│     - fleetId, issueDescription, photos[]              │
│  2. POST /maintenance                                   │
│  3. System:                                             │
│     - MaintenanceLog created (status: Open)            │
│     - Photos uploaded to MinIO                          │
│     - Fleet.status → "Under Maintenance"               │
│  4. Notification sent to Admin                          │
└─────────────────────────────────────────────────────────┘

Admin Resolves Issue:
┌─────────────────────────────────────────────────────────┐
│  1. Admin views open issues                             │
│  2. Updates status: InProgress or Resolved             │
│  3. Adds resolution notes                                │
│  4. If Resolved:                                        │
│     - MaintenanceLog.status → "Resolved"                │
│     - Fleet.status → "Available"                        │
│     - resolvedAt timestamp set                          │
└─────────────────────────────────────────────────────────┘
```

### 6.5 Car Request Flow (Public)

```
Department Lead (external):
┌─────────────────────────────────────────────────────────┐
│  1. Receives unique request link                        │
│  2. Fills form:                                         │
│     - requesterName, email, phone                      │
│     - departmentId                                      │
│     - cart quantities (2/4/6-seater, cargo, etc.)       │
│  3. POST /requests/public/:token                        │
│  4. CarRequest created (status: Pending)               │
└─────────────────────────────────────────────────────────┘

Admin Reviews:
┌─────────────────────────────────────────────────────────┐
│  1. Admin views pending requests                        │
│  2. Approves or rejects                                 │
│  3. Adds review notes                                   │
│  4. Notification sent to requester                      │
└─────────────────────────────────────────────────────────┘
```

---

## 7. API Endpoints Summary

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Login with email/password |
| POST | `/auth/logout` | Logout user |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/register` | Register new user (SuperAdmin only) |

### Fleet
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/fleet` | List all carts (filtered by role) |
| POST | `/fleet` | Create new cart |
| PUT | `/fleet/:id` | Update cart |
| DELETE | `/fleet/:id` | Delete cart |
| POST | `/fleet/bulk` | Bulk import carts |
| PUT | `/fleet/:id/assign` | Assign FA to cart |

### Handover
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/handover` | List handover logs |
| POST | `/handover/checkout` | Check out a cart |
| POST | `/handover/checkin` | Check in a cart |
| GET | `/handover/active` | Get active handovers |
| GET | `/handover/history` | Get handover history |

### Maintenance
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/maintenance` | List maintenance logs |
| POST | `/maintenance` | Report issue |
| PUT | `/maintenance/:id` | Update status |
| GET | `/maintenance/export` | Export to CSV |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users` | List users |
| POST | `/users` | Create user |
| PUT | `/users/:id` | Update user |
| PUT | `/users/:id/status` | Toggle active status |
| POST | `/users/bulk` | Bulk create users |

### Stadiums (SuperAdmin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stadiums` | List stadiums |
| POST | `/stadiums` | Create stadium |
| PUT | `/stadiums/:id` | Update stadium |

### Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/reports/fleet-utilization` | Fleet stats |
| GET | `/reports/audit-logs` | Audit trail |
| GET | `/reports/handover-history` | Handover CSV |
| GET | `/reports/maintenance-history` | Maintenance CSV |

---

## 8. Frontend Pages

| Page | Route | Access | Description |
|------|-------|--------|-------------|
| Login | `/login` | Public | Authentication form |
| Dashboard | `/` | All | Stats, quick actions |
| Fleet | `/fleet` | SuperAdmin, Admin | Manage carts |
| Handover | `/handover` | SuperAdmin, Admin, FA | Check in/out |
| Maintenance | `/maintenance` | All | Issue tracking |
| Users | `/users` | SuperAdmin, Admin | Manage users |
| Reports | `/reports` | All | Analytics, exports |
| Settings | `/settings` | SuperAdmin | System config |
| Requests | `/requests` | Admin | Car request approvals |

---

## 9. Key Backend Modules

```
backend/src/modules/
├── auth/                    # JWT auth, login, refresh tokens
├── fleet/                   # Cart CRUD, bulk import, assignment (+ Focal Point→Department sync)
├── handover/                # Handover form lifecycle, check-in/out, history
├── maintenance/             # Issue reports, status updates
├── users/                   # User CRUD, role management
├── stadiums/                # Stadium CRUD (SuperAdmin)
├── departments/              # Department management
├── reports/                 # Utilization, audit logs, exports
├── settings/                # System settings, branding
├── notifications/           # User alerts
├── announcements/            # System announcements
├── requests/                # Public car requests
├── pool-bookings/           # Pool cart short checkout (no handover form)
├── pool-booking-requests/   # Admin-approved pool bookings — reminders + extension workflow
└── incidents/                # Incident reports (full template form + PDF) and Warning tickets
```

---

## 10. Known Issues (from QA)

### Critical
| Issue | Description |
|-------|-------------|
| #31 | Password reset routes return 404 |
| #40 | Handover check-in returns null fields |
| #42 | Backend not deployed - code mismatch |
| #46 | Admin can create stadiums (RBAC bypass) |

### High
| Issue | Description |
|-------|-------------|
| #32 | Default password 'changeme123' is weak |
| #41 | Delete cart fails (FK constraint) |
| #43 | Departments module returns 404 |

### Medium
| Issue | Description |
|-------|-------------|
| #33 | ProtectedRoute shows blank screen |
| #34 | No rate limit UI feedback |
| #35 | Dev mode exposes test credentials |
| #36 | Validation errors not user-friendly |

---

## 11. Test Credentials

| Role | Email | Password |
|------|-------|----------|
| SuperAdmin | `superadmin@gcms.com` | `Admin@2024!` |
| Admin | `admin@gcms.com` | `Admin@2024!` |
| FA | `fa@gcms.com` | `FA@2024!` |
| Observer | `observer@gcms.com` | `Observer@2024!` |

---

## 12. Quick Start Commands

```bash
# Start infrastructure (Postgres + MinIO)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres minio

# Start backend (port 3005)
cd backend && npm run dev

# Start frontend (port 3000)
cd frontend && npm run dev

# Run Prisma migrations
cd backend && npx prisma migrate dev

# Seed test data
cd backend && npx tsx prisma/seed.ts
```

For a live-reload Docker stack instead of running `npm run dev` on the host, see
`docker-compose.dev-live.yml` at the repo root (git-ignored — machine-local dev tooling,
not deployed anywhere). For Azure Container Apps deployment, see
`docs/deployment/GCMS-Azure-Deployment-Runbook.md`.

---

## 13. System Settings (Feature Flags)

| Setting | Default | Description |
|---------|---------|-------------|
| `enableMaintenanceReports` | true | Allow issue reporting |
| `enableHandoverPhotos` | true | Photo upload on check-in |
| `enableFleetManagement` | true | Fleet CRUD operations |
| `enableCarRequests` | true | Public request forms |
| `enableUserImport` | true | Bulk user upload |
| `enableBulkOperations` | true | Bulk fleet/user ops |
| `enableAdvancedReports` | true | Export functionality |
| `enableAssignmentMatrix` | true | FA assignment view |

---

## 14. Data Flow Diagram

```
                    ┌─────────────────────────────────────┐
                    │           FRONTEND (React)           │
                    │  ┌─────────┐  ┌─────────┐  ┌───────┐ │
                    │  │ Pages   │  │Components│  │Stores │ │
                    │  └────┬────┘  └────┬────┘  └───┬───┘ │
                    │       │            │          │      │
                    │       └────────────┼──────────┘      │
                    │                    │                 │
                    │              ┌─────┴─────┐           │
                    │              │  API Client│           │
                    │              │  (Axios)   │           │
                    │              └─────┬─────┘           │
                    └────────────────────┼─────────────────┘
                                         │
                                         │ HTTP/REST
                                         │
                    ┌────────────────────┼─────────────────┐
                    │           BACKEND (Express)         │
                    │  ┌─────────┐  ┌─────────┐          │
                    │  │Routes   │──│Middleware│         │
                    │  └────┬────┘  └────┬────┘          │
                    │       │            │               │
                    │  ┌────┴────┐  ┌─────┴─────┐         │
                    │  │Controllers│ │ Auth/RBAC │        │
                    │  └────┬────┘  └─────┬─────┘         │
                    │       │            │               │
                    │  ┌────┴────┐       │               │
                    │  │Services │───────┘               │
                    │  └────┬────┘                       │
                    │       │                            │
                    │  ┌────┴────┐                       │
                    │  │ Prisma  │                       │
                    │  └────┬────┘                       │
                    └───────┼────────────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
        ┌─────┴─────┐ ┌─────┴─────┐ ┌─────┴─────┐
        │ PostgreSQL│ │   MinIO   │ │   Redis   │
        │  (Data)   │ │ (Photos)  │ │(Optional) │
        └───────────┘ └───────────┘ └───────────┘
```

---

## 15. Pool Booking, Incidents & Warning Tickets (added 2026-09-12)

These subsystems didn't exist when this document was first generated (2026-03-21).

### 15.1 Pool Booking Workflow
Pool carts (`Fleet.isPool = true`) are shared resources with no dedicated Focal Point.
1. A requester (public link or internal) submits a `PoolBookingRequest` — cart, FA,
   date/time window.
2. Admin/SuperAdmin approves or rejects (conflict-checked against other approved
   bookings on the same cart).
3. An in-process reminder loop (`server.ts`, polls every 60s) notifies the FA and venue
   Admin/SuperAdmin as the return time approaches (`POOL_REMINDER_MINUTES_BEFORE`,
   default 30 min), and once more if it passes unreturned.
4. The FA can request an extension (`POST /pool-booking-requests/:id/extension`); only
   Admin/SuperAdmin can approve it (`PATCH .../extension`), which updates the booking's
   end date/time.
5. The FA (or Admin) marks the cart returned (`PATCH .../return`).

### 15.2 Handover Cycle
1. Admin assigns a cart to a Focal Point (Fleet Management) — the cart's department is
   auto-set from that Focal Point's own department.
2. Admin creates & signs the handover form; the FA then signs it — cart becomes usable.
3. FA checks in (starts a usage session) and checks out (ends it), optionally reporting
   an issue (creates a `MaintenanceLog`).
4. FA requests handback; Admin inspects and signs the return — cart is released back to
   `Available`/pool.
Full bilingual (EN/AR) fillable form with signature capture and a branded PDF export —
see `HandoverFormModal.tsx` / `pdf.service.ts`'s `handoverFormPdf`.

### 15.3 Incident Reports & Warning Tickets
- **Incident Report**: "Create Incident Report" opens a fillable form matching the
  official Golf Cart/UTV Incident Report template (incident type, injury/treatment
  details, investigation checklist, sign-off). Generates a branded PDF and can escalate
  to the Contracts and/or Maintenance teams (`POST /incidents/:id/escalate`), which
  notifies those roles.
- **Warning Tickets**: "Issue a Ticket" on an incident picks a violation from a 3-level
  catalog (`frontend/src/lib/ticketCatalog.ts`) — Level 1 (warning, on record), Level 2
  (event ban), Level 3 (permanent ban — blocks system access). Reaching 3 active
  warnings, or any Level 3, blocks the user automatically (`warning-rules.ts`) and
  emails a warning notice.

---

**Document Generated by Cyberboy** 🤖  
*Golf Cart Management System - Workflow Documentation*  
*Sections 3, 5, 8, 12, and 15 corrected/added 2026-09-12 — see git history for the diff.*