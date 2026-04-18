#!/bin/bash
BASE_URL="http://localhost:3001/api/v1"

echo "1. Logging in..."
LOGIN_RES=$(curl -s -X POST "${BASE_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gcms.com","password":"admin123456"}')

ACCESS_TOKEN=$(echo "$LOGIN_RES" | jq -r '.accessToken')
REFRESH_TOKEN=$(echo "$LOGIN_RES" | jq -r '.refreshToken')

if [ "$ACCESS_TOKEN" == "null" ]; then
  echo "Login failed!"
  echo "$LOGIN_RES"
  exit 1
fi

echo "Access Token: ${ACCESS_TOKEN:0:20}..."
echo "Refresh Token: ${REFRESH_TOKEN:0:20}..."

echo "2. Calling /me..."
curl -s -X GET "${BASE_URL}/auth/me" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" | jq '.'

echo "3. Logging out..."
curl -s -X POST "${BASE_URL}/auth/logout" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"${REFRESH_TOKEN}\"}" | jq '.'

echo "4. Verifying /me fails (should still work because JWT is stateless)..."
echo "Actually, our middleware checks if user exists, but logout doesn't delete the user."
echo "However, it should invalidate the session if we had a session-based logout, but we don't."
echo "The requirement is to invalidate the refresh token."
curl -s -X GET "${BASE_URL}/auth/me" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" | jq '.'

echo "5. Verifying /refresh fails (SHOULD FAIL)..."
curl -s -X POST "${BASE_URL}/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"${REFRESH_TOKEN}\"}" | jq '.'
