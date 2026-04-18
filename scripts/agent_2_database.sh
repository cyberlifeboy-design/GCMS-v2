#!/bin/bash
# AGENT 2: Database Optimization
# Run: chmod +x agent_2_database.sh && ./agent_2_database.sh

set -e

cd /home/ubuntu/projects/GCMS/backend

echo "=========================================="
echo "AGENT 2: Database Optimization"
echo "=========================================="

# Create migration directory
mkdir -p prisma/migrations/20250212_add_performance_indexes

# Create migration SQL
echo "[TASK-001] Creating migration file..."
cat > prisma/migrations/20250212_add_performance_indexes/migration.sql << 'EOF'
-- Fleet indexes
CREATE INDEX IF NOT EXISTS "Fleet_stadiumId_idx" ON "Fleet"("stadiumId");
CREATE INDEX IF NOT EXISTS "Fleet_assignedToFA_idx" ON "Fleet"("assignedToFA");
CREATE INDEX IF NOT EXISTS "Fleet_status_idx" ON "Fleet"("status");

-- HandoverLog indexes
CREATE INDEX IF NOT EXISTS "HandoverLog_fleetId_idx" ON "HandoverLog"("fleetId");
CREATE INDEX IF NOT EXISTS "HandoverLog_userId_idx" ON "HandoverLog"("userId");
CREATE INDEX IF NOT EXISTS "HandoverLog_timestamp_idx" ON "HandoverLog"("timestamp");

-- MaintenanceLog indexes
CREATE INDEX IF NOT EXISTS "MaintenanceLog_fleetId_idx" ON "MaintenanceLog"("fleetId");
CREATE INDEX IF NOT EXISTS "MaintenanceLog_status_idx" ON "MaintenanceLog"("status");
CREATE INDEX IF NOT EXISTS "MaintenanceLog_reportedAt_idx" ON "MaintenanceLog"("reportedAt");

-- User indexes
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_faTrigram_idx" ON "User"("faTrigram");

-- AuditLog indexes
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");
CREATE INDEX IF NOT EXISTS "AuditLog_entityType_idx" ON "AuditLog"("entityType");
EOF

echo "✅ Migration file created"

# Apply migration
echo "[TASK-002] Applying migration..."
npx prisma migrate deploy --preview-feature || npx prisma db execute --file=prisma/migrations/20250212_add_performance_indexes/migration.sql

# Regenerate client
echo "[TASK-003] Regenerating Prisma client..."
npx prisma generate

echo ""
echo "=========================================="
echo "AGENT 2 COMPLETE"
echo "=========================================="
echo "Fixed:"
echo "  - Added performance indexes"
echo "  - Fleet, HandoverLog, MaintenanceLog"
echo "  - User and AuditLog indexes"
echo ""
echo "Next: Agent 3 (Frontend) can start"
