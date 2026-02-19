#!/bin/bash
BASE_URL="http://localhost:3001/api/v1"

echo "=== Creating LCC User ==="
curl -s -X POST "${BASE_URL}/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "LCC Operator",
    "email": "lcc@gcms.com",
    "password": "lcc123456",
    "accreditationId": "LCC-001",
    "role": "LCC"
  }' | jq '.'

echo "=== Creating FocalPoint User (LOG) ==="
curl -s -X POST "${BASE_URL}/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Logistics Focal Point",
    "email": "fp.log@gcms.com",
    "password": "fp123456",
    "accreditationId": "FP-LOG-001",
    "role": "FocalPoint",
    "faTrigram": "LOG"
  }' | jq '.'

echo "=== Creating Contractor User ==="
curl -s -X POST "${BASE_URL}/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Maintenance Contractor",
    "email": "contractor@gcms.com",
    "password": "cont123456",
    "accreditationId": "CONT-001",
    "role": "Contractor"
  }' | jq '.'
