#!/bin/bash
BASE_URL="http://localhost:3001/api/v1"

echo "=== Getting Tokens ==="
ADMIN_TOKEN=$(curl -s -X POST "${BASE_URL}/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@gcms.com","password":"admin123456"}' | jq -r '.accessToken')
LCC_TOKEN=$(curl -s -X POST "${BASE_URL}/auth/login" -H "Content-Type: application/json" -d '{"email":"lcc@gcms.com","password":"lcc123456"}' | jq -r '.accessToken')
FP_LOG_TOKEN=$(curl -s -X POST "${BASE_URL}/auth/login" -H "Content-Type: application/json" -d '{"email":"fp.log@gcms.com","password":"fp123456"}' | jq -r '.accessToken')
CONT_TOKEN=$(curl -s -X POST "${BASE_URL}/auth/login" -H "Content-Type: application/json" -d '{"email":"contractor@gcms.com","password":"cont123456"}' | jq -r '.accessToken')

echo "=== 1. Admin Listing All Fleet ==="
curl -s -X GET "${BASE_URL}/fleet" -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq '.fleet | length'

echo "=== 2. LCC Listing All Fleet (Should succeed) ==="
curl -s -X GET "${BASE_URL}/fleet" -H "Authorization: Bearer ${LCC_TOKEN}" | jq '.fleet | length'

echo "=== 3. FocalPoint (LOG) Checking Available Cars (Should only see LOG) ==="
curl -s -X GET "${BASE_URL}/fleet/available" -H "Authorization: Bearer ${FP_LOG_TOKEN}" | jq '.fleet | .[] | .assignedToFA'

echo "=== 4. Contractor Access (Should fail 403) ==="
curl -s -D - -o /dev/null -X GET "${BASE_URL}/fleet" -H "Authorization: Bearer ${CONT_TOKEN}" | grep "HTTP"

echo "=== 5. Admin Creating a Car ==="
STADIUM_ID=$(curl -s -X GET "${BASE_URL}/fleet" -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq -r '.fleet[0].stadiumId')
CREATE_RES=$(curl -s -X POST "${BASE_URL}/fleet" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"unitNumber\": \"GC-TEMP-100\",
    \"carType\": \"4-seater\",
    \"keyId\": \"KEY-TEMP-100\",
    \"keyColorCode\": \"YELLOW\",
    \"stadiumId\": \"${STADIUM_ID}\",
    \"assignedToFA\": \"LOG\"
  }")
echo "$CREATE_RES" | jq '.'
TEMP_ID=$(echo "$CREATE_RES" | jq -r '.fleet.id')

echo "=== 6. Admin Updating Car ==="
curl -s -X PUT "${BASE_URL}/fleet/${TEMP_ID}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"status": "Maintenance"}' | jq '.fleet.status'

echo "=== 7. FocalPoint Trying to Update (Should fail 403) ==="
curl -s -D - -o /dev/null -X PUT "${BASE_URL}/fleet/${TEMP_ID}" \
  -H "Authorization: Bearer ${FP_LOG_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"status": "Ready"}' | grep "HTTP"

echo "=== 8. Admin Deleting Car ==="
curl -s -X DELETE "${BASE_URL}/fleet/${TEMP_ID}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq '.'
