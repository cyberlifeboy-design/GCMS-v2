# GCMS - Golf Cart Management System
## Full System Workflow Documentation

**Repository:** O96a/GCMS  
**Generated:** 2026-03-21  
**Status:** Production-ready with known issues

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
| **Ports** | Backend: 3005, Frontend: 5173 |

---

## 3. User Roles (RBAC)

| Role | Permissions |
|------|-------------|
| **SuperAdmin** | Full system access — all venues, users, settings, stadiums |
| **Admin** | Own venue only — manage FA users, fleet, view reports |
| **FA (Fleet Attendant)** | Check in/out assigned carts, report issues |
| **Observer** | Read-only — view everything across all venues |

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

### Cart Types
- **2-Seater** — Standard golf cart
- **4-Seater** — Larger cart
- **6-Seater** — Passenger cart
- **Utility** — Cargo/utility cart
- **Ambulance** — Medical cart

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
├── auth/           # JWT auth, login, refresh tokens
├── fleet/          # Cart CRUD, bulk import, assignment
├── handover/       # Check-in/out, history
├── maintenance/    # Issue reports, status updates
├── users/          # User CRUD, role management
├── stadiums/       # Stadium CRUD (SuperAdmin)
├── departments/    # Department management
├── reports/        # Utilization, audit logs, exports
├── settings/       # System settings, branding
├── notifications/   # User alerts
├── announcements/  # System announcements
└── requests/       # Public car requests
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
# Start infrastructure
docker-compose up -d

# Start backend (port 3005)
cd backend && npm run dev

# Start frontend (port 5173)
cd frontend && npm run dev

# Run Prisma migrations
cd backend && npx prisma migrate dev

# Seed test data
cd backend && npm run seed
```

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

**Document Generated by Cyberboy** 🤖  
*Golf Cart Management System - Workflow Documentation*