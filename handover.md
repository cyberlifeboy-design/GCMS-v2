# GCMS — Handover Document
**Date:** 2026-02-23  
**Status:** ✅ **Project Complete** (Backend & Frontend)  
**Backend port:** **3005** | **Frontend port:** **5173** (Vite)

---

## 1. Project Overview

Golf Cart Management System for multi-venue sports events. Manages fleet of golf carts with check-in/check-out, issue reporting, maintenance tracking, and role-based access.

### Tech Stack
| Layer | Tech |
|-------|------|
| Backend | Node.js, Express, TypeScript, Prisma ORM |
| Database | PostgreSQL (Docker) |
| Storage | MinIO (Docker) — photos & branding |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Zustand |
| Auth | JWT access token + refresh token |

### Roles (RBAC)
| Role | Scope |
|------|-------|
| `SuperAdmin` | Full system access — all venues, users, settings |
| `Admin` | Own venue only — manage FA users, fleet, view reports |
| `FA` (Fleet Attendant) | Check in/out carts assigned to them, report issues |
| `Observer` | Read-only — view everything across all venues |

---

## 2. Infrastructure

```
/home/ubuntu/projects/GCMS/
├── backend/           # Express API — PORT 3005
│   ├── prisma/        # Schema + migrations
│   └── src/           # Controller-Service-Route modules
├── frontend/          # React SPA — PORT 5173 (Vite dev)
│   └── src/           # Pages, Components, Stores, Lib (API)
└── docker-compose.yml # PostgreSQL + MinIO
```

### Start Services
```bash
# 1. Start DB + MinIO
cd /home/ubuntu/projects/GCMS
docker-compose up -d

# 2. Start backend (port 3005)
cd /home/ubuntu/projects/GCMS/backend
npm run dev

# 3. Start frontend (port 5173)
cd /home/ubuntu/projects/GCMS/frontend
npm run dev
```

### Environment Files
- `backend/.env` — `PORT=3005`, `JWT_SECRET`, `DATABASE_URL`
- `frontend/.env` — `VITE_API_URL=http://localhost:3005/api/v1`

---

## 3. Database Schema (Prisma)

**Models:** `Stadium`, `Fleet`, `User`, `RefreshToken`, `HandoverLog`, `MaintenanceLog`, `SystemSettings`, `AuditLog`

### Key Enums
```
UserRole    → SuperAdmin, Admin, FA, Observer
FleetStatus → Available, Dispatched, Under Maintenance, Retired
CarType     → 2-Seater, 4-Seater, 6-Seater, Utility, Ambulance
MaintenanceStatus → Open, InProgress, Resolved
HandoverAction    → CheckedOut, CheckedIn, IssueReported
```

---

## 4. Complete Task List

### ✅ Phase 1-9 — Backend Development
- [x] Database Schema Migration (Renamed fields, new models)
- [x] Auth & RBAC Middleware (4-role system)
- [x] Fleet Module (CRUD, Bulk Import, Scoping)
- [x] Users Module (CRUD, Status Toggle, Bulk Create)
- [x] Handover Module (Status flow, Bulk ops)
- [x] Maintenance Module (Statuses, Photo Upload, CSV Export)
- [x] Reports Module (Utilization stats, Audit logs)
- [x] System Settings (Tournament config, Branding images)
- [x] Infrastructure (Port 3005 alignment)

### ✅ Phase 10 — Frontend: Auth & API
- [x] `LoginPage` — form calling `POST /auth/login`, persist JWT in Zustand
- [x] `ProtectedRoute` — redirect to login if no token
- [x] Token refresh interceptor in Axios client ([api.ts](file:///home/ubuntu/projects/GCMS/frontend/src/lib/api.ts))

### ✅ Phase 11 — Frontend: Fleet Management
- [x] `FleetPage` — table with carNumber, carType badge, status badge
- [x] `FleetModal` — create/edit/delete functionality
- [x] `BulkImportButton` — XLSX import support
- [x] `AssignUserModal` — assign FA user to a cart
- [x] FA-only view: "My Assigned Carts" tab

### ✅ Phase 12 — Frontend: Handover Panel
- [x] `HandoverPage` — active carts list + check-in/out modals
- [x] New check-out flow with condition notes
- [x] New check-in flow with issue reporting (auto-creates maintenance log)
- [x] History table with role-based filtering

### ✅ Phase 13 — Frontend: Maintenance
- [x] `MaintenancePage` — issue list with Open/InProgress/Resolved statuses
- [x] `ReportIssueModal` — description + photo upload (multi)
- [x] `UpdateStatusModal` — resolution notes + status toggle
- [x] CSV Export button

### ✅ Phase 14 — Frontend: Users Management
- [x] `UsersPage` — user table with phone and isActive toggle
- [x] `CreateUserModal` — Admin can only create FA users
- [x] `BulkUploadUsers` — CSV/JSON upload support

### ✅ Phase 15 — Frontend: Dashboard
- [x] Utilization stat cards (Available, Dispatched, Maintenance, Retired)
- [x] Quick navigation buttons for all major modules
- [x] Welcome message with role identification

### ✅ Phase 16 — Frontend: Reports & Analytics
- [x] Export buttons for handover and maintenance logs
- [x] Fleet utilization percentages
- [x] Audit log viewer for Admins/SuperAdmins

### ✅ Phase 17 — Frontend: System Settings
- [x] `SystemSettingsPage` — tournament name + logo/header/footer upload
- [x] Live preview of branding images
- [x] Access restricted to SuperAdmin for write operations

### ✅ Phase 18 — Final Verification
- [x] Build check: `npm run build` (Frontend) passed
- [x] Type check: `npx tsc --noEmit` (Backend) passed
- [x] RBAC Verification: Links filtered by role in `MainLayout`

---

## 5. Key Design Decisions

- **RBAC Enforcement:** Middlewares check role types; Controllers scope all DB queries by `stadiumId` or `userId`.
- **FA User Scope:** Fleet Attendants only see carts assigned to them.
- **Auto-Maintenance:** Checking in a cart with an issue automatically changes fleet status to `Under Maintenance` and creates a `MaintenanceLog`.
- **MinIO Storage:** All images (logos, maintenance photos) stored in MinIO. URLs are served via the same API domain.

---

## 6. Known Issues / Gotchas

- **Photo Previews:** Ensure MinIO buckets `maintenance-photos` and `branding` exist. The app attempts to use them on upload.
- **Port Conflict:** If port 3005 is busy, update `.env` in both backend and frontend.

---

## 7. Operational Instructions

### Daily Use
1. **Admin/FA**: Use Handover to dispatch/return carts.
2. **Maintenance**: Resolve Open issues using the Maintenance tab.
3. **Admin**: Monitor fleet utilization via Dashboard/Reports.
4. **SuperAdmin**: Use Settings to update tournament branding.

### Maintenance
- Backend: `backend/src/modules/` contains all logic.
- Frontend: `frontend/src/pages/` contains all views.
- API Client: `frontend/src/lib/api.ts` manages all backend communication.

---
**Document Status:** ✅ **Final Version**
