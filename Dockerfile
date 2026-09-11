# syntax=docker/dockerfile:1
#
# Single-image build for Azure Container Apps: the Express backend serves both the
# API and the built React/Vite frontend (static + SPA fallback) from one container.
# See docs/deployment/azure-container-apps.md for the full deployment walkthrough.

# ---- Stage 1: build the frontend ----
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ENV VITE_API_URL=/api/v1
RUN npm run build

# ---- Stage 2: build the backend ----
FROM node:22-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npx prisma generate
RUN npm run build

# ---- Stage 3: runtime ----
FROM node:22-alpine AS runtime
RUN apk add --no-cache curl
WORKDIR /app

RUN addgroup -S gcms && adduser -S gcms -G gcms

COPY --from=backend-build /app/backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/prisma ./prisma
COPY --from=backend-build /app/backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=frontend-build /app/frontend/dist ./frontend-dist

ENV NODE_ENV=production
ENV PORT=3005
ENV FRONTEND_DIST_DIR=/app/frontend-dist

RUN chown -R gcms:gcms /app
USER gcms

EXPOSE 3005
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:3005/api/v1/health || exit 1

CMD ["node", "dist/server.js"]
