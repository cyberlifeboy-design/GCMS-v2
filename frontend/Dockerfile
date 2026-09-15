# Frontend Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ENV VITE_API_URL=/api/v1

# Microsoft Entra ID (Azure AD) SSO — Vite bakes these into the JS bundle at build
# time, so (unlike the backend's runtime env vars) a new value requires a rebuild.
# Values are the public Client ID/Tenant ID of a SPA app registration — not secrets.
ARG VITE_MSAL_TENANT_ID=""
ARG VITE_MSAL_CLIENT_ID=""
ENV VITE_MSAL_TENANT_ID=$VITE_MSAL_TENANT_ID
ENV VITE_MSAL_CLIENT_ID=$VITE_MSAL_CLIENT_ID

RUN npx vite build

# Production stage with nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html

# Backend origin and DNS resolver are runtime-templated (envsubst) so the same
# image works unchanged behind docker-compose (service DNS "gcms-backend") and
# behind Azure App Service (private-endpoint FQDN + Azure's internal resolver
# 168.63.129.16), instead of baking one environment's hostname into the image.
ENV BACKEND_ORIGIN=http://gcms-backend:3005
ENV DNS_RESOLVER="127.0.0.11"
ENV BACKEND_HOST=gcms-backend

RUN mkdir -p /etc/nginx/templates
RUN echo 'server { \
    listen 4173; \
    server_name localhost; \
    root /usr/share/nginx/html; \
    index index.html; \
    \
    resolver ${DNS_RESOLVER} valid=30s ipv6=off; \
    set $backend ${BACKEND_ORIGIN}; \
    \
    location /api/v1 { \
        proxy_pass $backend/api/v1; \
        proxy_ssl_server_name on; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "upgrade"; \
        proxy_set_header Host ${BACKEND_HOST}; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $scheme; \
        proxy_connect_timeout 60s; \
        proxy_send_timeout 60s; \
        proxy_read_timeout 60s; \
    } \
    \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    \
    location /assets/ { \
        expires 1y; \
        add_header Cache-Control "public, immutable"; \
    } \
}' > /etc/nginx/templates/default.conf.template

EXPOSE 4173
CMD ["nginx", "-g", "daemon off;"]
