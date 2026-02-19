# GCMS - Golf Car Management System

Production-grade fleet management system for tournament operations.

## Quick Start

### Prerequisites
- Node.js 20 LTS
- Docker & Docker Compose
- PostgreSQL 16 (via Docker)

### Setup

1. **Clone and Install**
```bash
# Backend
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration

# Frontend
cd ../frontend
npm install
cp .env.example .env
```

2. **Start Infrastructure**
```bash
# Start PostgreSQL and MinIO
docker-compose up -d
```

3. **Initialize Database**
```bash
cd backend
npm run prisma:migrate
npm run prisma:seed
```

4. **Run Development Servers**
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

Access the application at `http://localhost:3000`

## Project Structure

```
GCMS/
├── backend/          # Node.js + Express + Prisma API
├── frontend/         # React + Vite + Tailwind UI
├── docker-compose.yml
└── README.md
```

## Tech Stack

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Node.js, Express, Prisma ORM, TypeScript
- **Database:** PostgreSQL 16
- **Storage:** MinIO (S3-compatible)
- **Auth:** JWT with bcrypt

## Documentation

See `/backend/README.md` and `/frontend/README.md` for detailed documentation.

## License

MIT
