# GCMS Project Memory

## Overview
Golf Cart Management System for multi-venue sports events. Manages fleet of golf carts with check-in/check-out, issue reporting, maintenance tracking, and role-based access.

## Tech Stack
| Layer | Tech |
|-------|------|
| Backend | Node.js, Express, TypeScript, Prisma ORM |
| Database | SQLite (Dev) / PostgreSQL (Prod) |
| Storage | Local (Dev) / MinIO (Prod) |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Zustand |
| Auth | JWT access token + refresh token |

## Ports
- Backend: 3005
- Frontend: 5173 (Vite dev)

## Roles (RBAC)
| Role | Scope |
|------|-------|
| `SuperAdmin` | Full system access — all venues, users, settings |
| `Admin` | Own venue only — manage FA users, fleet, view reports |
| `FA` (Fleet Attendant) | Check in/out carts assigned to them, report issues |
| `Observer` | Read-only — view everything across all venues |
| `Contracts` | Manage maintenance budgets and approve fix costs |
| `MaintenanceTeam` | View maintenance issues, submit fix costs, update status |

## Key Features
- **Handover Cycle**: Assignment -> Signing -> Check-In -> Usage -> Check-Out -> Return -> Release.
- **Maintenance Workflow**: Report -> Request Quote (Contracts) -> Submit Cost (Maint) -> Approve Cost (Contracts) -> Start Work -> Resolve.
- **Public Requests**: Department leads can request cars via a public link (verified via department-specific tokens).
- **Branding/Settings**: Dynamic logo, title, and feature toggles.

## Key Files
- `backend/src/app.ts` - Express app configuration
- `backend/src/server.ts` - Server entry point
- `backend/src/middleware/` - Auth, RBAC, rate limiting
- `backend/src/modules/` - Feature modules
- `frontend/src/App.tsx` - React app with routing
- `frontend/src/pages/` - Page components
- `frontend/src/lib/api.ts` - API client with auth interceptor

## Infrastructure Commands
```bash
# Start backend (port 3005)
cd backend && npm run dev

# Start frontend (port 5173)
cd frontend && npm run dev
```

## Common Fixes
- **RBAC**: Always check `rbac.middleware.ts`. In tests, inject user via headers.
- **Imports**: Ensure all named imports exist (fixed `authorize` -> `requireRole` in April 2026).
- **Frontend Build**: Run `npm run build` in `frontend/` to catch unused vars/imports.
