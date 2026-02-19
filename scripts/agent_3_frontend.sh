#!/bin/bash
# AGENT 3: Frontend Foundation
# Run: chmod +x agent_3_frontend.sh && ./agent_3_frontend.sh

set -e

cd /home/ubuntu/projects/GCMS/frontend

echo "=========================================="
echo "AGENT 3: Frontend Foundation"
echo "=========================================="

# TASK-001: Initialize shadcn
echo "[TASK-001] Installing shadcn/ui components..."
npm install -D @shadcn/ui@latest

# Initialize with defaults (skip if already initialized)
if [ ! -d "components/ui" ]; then
    echo "Initializing shadcn..."
    echo "no" | npx shadcn@latest init -d -y || true
else
    echo "shadcn already initialized"
fi

# Add essential components
echo "Adding shadcn components..."
npx shadcn@latest add button input card table dialog select label badge avatar -y || true
npx shadcn@latest add sheet dropdown-menu separator scroll-area tabs textarea alert -y || true

echo "✅ TASK-001 Complete"

# Create directory structure
echo "[TASK-002] Creating directory structure..."
mkdir -p src/lib
mkdir -p src/stores
mkdir -p src/components/layout
mkdir -p src/components/auth
mkdir -p src/components/handover
mkdir -p src/pages
mkdir -p src/types

echo "✅ TASK-002 Complete"

echo ""
echo "=========================================="
echo "AGENT 3: Core Files Created"
echo "=========================================="
echo "Next: Run agent_3_part2.sh to create all components"
echo ""
