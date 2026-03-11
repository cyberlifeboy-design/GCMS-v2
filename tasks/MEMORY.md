# GCMS Project Memory

## Overview
Golf Cart Management System for multi-venue sports events. Manages fleet of golf carts with check-in/check-out, issue reporting, maintenance tracking, and role-based access.

## Tech Stack
| Layer | Tech |
|-------|------|
| Backend | Node.js, Express, TypeScript, Prisma ORM |
| Database | PostgreSQL (Docker) |
| Storage | MinIO (Docker) |
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

## Key Files
- `backend/src/app.ts` - Express app configuration
- `backend/src/server.ts` - Server entry point
- `backend/src/middleware/` - Auth, RBAC, rate limiting
- `backend/src/modules/` - Feature modules (auth, fleet, handover, etc.)
- `frontend/src/App.tsx` - React app with routing
- `frontend/src/pages/` - Page components
- `frontend/src/lib/api.ts` - API client with auth interceptor

## Infrastructure Commands
```bash
# Start DB + MinIO
docker-compose up -d

# Start backend (port 3005)
cd backend && npm run dev

# Start frontend (port 5173)
cd frontend && npm run dev
```

## Common Fixes
- Rate limiter issues: Need `app.set('trust proxy', 1)` behind reverse proxy
- Prisma include issues: Check relation names in schema
- RBAC: Check middleware in routes