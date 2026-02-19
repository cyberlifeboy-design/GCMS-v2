# GCMS - Automated Fix Execution Guide

**For:** Swarm Coding Agents
**Date:** 2026-02-12
**Mode:** YOLO (Minimal Human Interaction)

---

## QUICK START (Run This First)

```bash
# 1. Navigate to project
cd /home/ubuntu/projects/GCMS

# 2. Run master deployment (does everything)
cd scripts
./master_deploy.sh

# 3. Verify
curl http://localhost:3001/health  # Should return {"status":"ok"}
```

The master script will:
- ✅ Fix backend critical bugs
- ✅ Initialize frontend with shadcn/ui
- ✅ Create all pages and components
- ✅ Start all services
- ✅ Verify deployment

---

## OR Run Agents Individually

### AGENT 1: Backend Fixes
```bash
cd /home/ubuntu/projects/GCMS/scripts
./agent_1_backend_fixes.sh
```
**Duration:** 2-3 minutes
**Fixes:**
- Password field bug (users.service.ts)
- Rate limiting middleware
- Input sanitization

### AGENT 2: Database Optimization
```bash
cd /home/ubuntu/projects/GCMS/scripts
./agent_2_database.sh
```
**Duration:** 1-2 minutes
**Fixes:**
- Performance indexes
- Foreign key indexes

### AGENT 3+: Frontend Features
Already included in master_deploy.sh

---

## What's Already Fixed

### Backend Status ✅

| Feature | Status | Notes |
|---------|--------|-------|
| Authentication | ✅ Working | JWT tokens, login/logout |
| Fleet API | ✅ Working | CRUD operations |
| Handover API | ✅ Working | Check-in/out |
| Maintenance API | ✅ Working | Issue tracking |
| Users API | ✅ Working | Bulk create fixed |
| Reports API | ✅ Working | Excel exports |
| Database | ✅ Running | PostgreSQL + MinIO |

### Infrastructure Status ✅

| Service | Port | Status |
|---------|------|--------|
| PostgreSQL | 5432 | ✅ Running |
| MinIO API | 9000 | ✅ Running |
| MinIO Console | 9001 | ✅ Running |
| Backend | 3001 | ✅ Running |

---

## What the Scripts Create

### Frontend Structure
```
frontend/src/
├── lib/
│   └── api.ts              # Axios client with auth
├── stores/
│   └── authStore.ts        # Zustand auth state
├── components/
│   ├── auth/
│   │   └── ProtectedRoute.tsx
│   └── layout/
│       └── MainLayout.tsx   # Sidebar + navigation
├── pages/
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx
│   ├── FleetPage.tsx
│   ├── HandoverPage.tsx
│   ├── MaintenancePage.tsx
│   ├── UsersPage.tsx
│   └── ReportsPage.tsx
└── App.tsx                 # Full routing setup
```

### Backend Fixes Applied
```
backend/src/
├── middleware/
│   ├── rateLimit.middleware.ts    # NEW - Rate limiting
│   └── sanitize.middleware.ts     # NEW - XSS protection
└── modules/users/
    └── users.service.ts           # FIXED - passwordHash field
```

---

## Verification Commands

### Backend Health
```bash
curl http://localhost:3001/health
# Expected: {"status":"ok",...}
```

### Login Test
```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gcms.com","password":"admin123456"}'
```

### Frontend Access
```bash
# Open in browser or curl
curl http://localhost:3000
```

### View Logs
```bash
# Backend
tail -f /home/ubuntu/projects/GCMS/backend/server.log

# Frontend
tail -f /home/ubuntu/projects/GCMS/frontend/frontend.log

# Database
docker logs -f gcms-postgres
```

---

## Troubleshooting

### Backend Won't Start
```bash
# Kill existing processes
pkill -f "tsx.*server.ts"

# Restart manually
cd /home/ubuntu/projects/GCMS/backend
npx tsx watch src/server.ts
```

### Frontend Won't Start
```bash
# Kill existing
pkill -f "vite"

# Restart
cd /home/ubuntu/projects/GCMS/frontend
npm run dev
```

### Database Issues
```bash
# Reset database
cd /home/ubuntu/projects/GCMS/backend
npx prisma migrate reset --force

# Verify tables
docker exec gcms-postgres psql -U gcms_user -d gcms -c "\\dt"
```

### Port Already in Use
```bash
# Find process on port 3001
sudo lsof -i :3001

# Kill it
kill -9 <PID>
```

---

## Documentation Files

| File | Purpose |
|------|---------|
| `GCMS_COMPREHENSIVE_AUDIT_REPORT.md` | Full audit details |
| `SWARM_AGENT_DISPATCH_GUIDE.md` | Detailed task breakdown |
| `AGENT_AUTOMATION_GUIDE.md` | Step-by-step automation |
| `IMMEDIATE_ACTIONS.md` | Quick fixes reference |
| `SYSTEM_STATUS.md` | Current system state |
| `scripts/master_deploy.sh` | One-click deployment |

---

## Expected Result

After running the scripts:

1. **Backend** running on http://localhost:3001
2. **Frontend** running on http://localhost:3000
3. **Login page** accessible
4. **Dashboard** with navigation
5. All API endpoints working

**Test Credentials:**
- Email: `admin@gcms.com`
- Password: `admin123456`

---

## Success Criteria

- [ ] Backend responds to /health
- [ ] Login returns JWT tokens
- [ ] Frontend loads without errors
- [ ] Navigation between pages works
- [ ] Protected routes require auth
- [ ] Fleet data displays in table

---

**Ready to deploy! Run `./master_deploy.sh` to start.**
