# Backend Dockerfile
FROM node:20-bookworm
WORKDIR /app
COPY package*.json ./
RUN npm install
RUN npm install -g tsx
COPY . .
RUN npx prisma generate
EXPOSE 3005
CMD ["tsx", "src/server.ts"]
