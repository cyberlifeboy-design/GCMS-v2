# GCMS - Automated Execution Guide

**One-command deployment for agents**

---

## Quick Start (For Coordinators)

```bash
# Run everything automatically
cd /home/ubuntu/projects/GCMS
chmod +x scripts/*.sh
./scripts/master_deploy.sh
```

This will:
1. ✅ Fix backend bugs
2. ✅ Setup frontend with shadcn/ui
3. ✅ Create all pages and components
4. ✅ Start all services
5. ✅ Verify deployment

---

## Manual Agent Execution

### Step 1: Backend Agent (Agent 1)

```bash
cd /home/ubuntu/projects/GCMS
./scripts/agent_1_backend_fixes.sh
```

**What it does:**
- Fixes passwordHash field bug
- Installs rate limiting
- Creates sanitization middleware
- Restarts backend server

**Time:** ~5 minutes

---

### Step 2: Database Agent (Agent 2) - Parallel

```bash
cd /home/ubuntu/projects/GCMS
./scripts/agent_2_database.sh
```

**What it does:**
- Creates performance indexes
- Regenerates Prisma client

**Time:** ~3 minutes

---

### Step 3: Frontend Agent (Agent 3)

```bash
cd /home/ubuntu/projects/GCMS
# After Agent 1 completes
```

This is handled by `master_deploy.sh` but can be done manually following the guide.

---

## Individual Agent Scripts

| Agent | Script | Status | Command |
|-------|--------|--------|---------|
| Agent 1 | `agent_1_backend_fixes.sh` | Ready | `./scripts/agent_1_backend_fixes.sh` |
| Agent 2 | `agent_2_database.sh` | Ready | `./scripts/agent_2_database.sh` |
| Agent 3 | In `master_deploy.sh` | Ready | Part of master script |

---

## Verification Commands

```bash
# Test backend
curl http://localhost:3001/health

# Test login
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gcms.com","password":"admin123456"}'

# Check services
docker ps | grep gcms
```

---

## Documentation Reference

| Document | Purpose |
|----------|---------|
| `GCMS_COMPREHENSIVE_AUDIT_REPORT.md` | Full audit with bugs and checklist |
| `SWARM_AGENT_DISPATCH_GUIDE.md` | Detailed implementation for 7 agents |
| `AGENT_AUTOMATION_GUIDE.md` | Step-by-step automation scripts |
| `SYSTEM_STATUS.md` | Current system status |
| `IMMEDIATE_ACTIONS.md` | Quick fixes (30 min) |

---

## Support

If issues occur:
1. Check logs: `tail -f backend/server.log frontend/frontend.log`
2. Verify services: `docker ps`
3. Restart: `pkill -f "tsx" && pkill -f "vite"` then re-run scripts

---

**Ready to deploy: Run `./scripts/master_deploy.sh`**
