#!/bin/bash
BASE_URL="http://localhost:3001/api/v1"

echo "=== Getting Admin Token ==="
LOGIN_RES=$(curl -s -X POST "${BASE_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gcms.com","password":"admin123456"}')

ACCESS_TOKEN=$(echo "$LOGIN_RES" | jq -r '.accessToken')

if [ "$ACCESS_TOKEN" == "null" ]; then
  echo "Admin login failed!"
  exit 1
fi

echo "=== Testing Bulk User Creation ==="
curl -s -X POST "${BASE_URL}/users/bulk" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "name": "Focal Point 2",
      "email": "fp2@gcms.com",
      "password": "password123",
      "role": "FocalPoint",
      "accreditationId": "FP-002",
      "faTrigram": "SPS"
    },
    {
      "name": "Contractor 2",
      "email": "cont2@gcms.com",
      "role": "Contractor",
      "accreditationId": "CONT-002"
    }
  ]' | jq '.'

echo -e "\n=== Verifying Users in List ==="
curl -s -X GET "${BASE_URL}/users" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" | jq '.[] | select(.email == "fp2@gcms.com" or .email == "cont2@gcms.com")'
