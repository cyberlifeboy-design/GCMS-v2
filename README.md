# GCMS - Golf Cart Management System

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/O96a/GCMS/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/postgresql-16-blue)](https://www.postgresql.org/)

A production-grade fleet management system for tournament operations, built with modern web technologies.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [User Roles & Permissions](#user-roles--permissions)
- [Modules](#modules)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Testing](#testing)

## Overview

GCMS is a comprehensive fleet management system designed for golf cart operations during tournaments and events. It provides complete fleet tracking, handover management, maintenance reporting, and administrative tools across multiple stadiums and venues.

### Key Capabilities

- **Multi-Stadium Support**: Manage fleets across multiple stadiums/venues
- **Role-Based Access Control**: SuperAdmin, Admin, FA (Field Assistant), and Observer roles
- **Fleet Management**: Track carts, assignments, and status across locations
- **Handover Workflow**: Complete check-in/check-out system with photo documentation
- **Maintenance Tracking**: Report, track, and resolve maintenance issues
- **Reporting**: Export reports in Excel, PDF, or Word formats
- **Public Request System**: Allow department leads to request carts without login
- **System Configuration**: Comprehensive settings for customization

## Features

### 🔐 Authentication & Authorization

- **JWT-based authentication** with refresh tokens
- **Password reset** via email
- **Role-based access control** (RBAC) with four roles:
  - **SuperAdmin**: Full system access, stadium management, all stadiums visibility
  - **Admin**: Stadium-specific management, user creation, fleet operations
  - **FA (Field Assistant)**: Handover operations, maintenance reporting
  - **Observer**: Read-only access to reports and dashboards

### 🚗 Fleet Management

- **Cart Types**: Cargo, 4-Seater, 6-Seater, Accessibility
- **Cart Statuses**: Available, Assigned, Dispatched, Under Maintenance
- **Bulk Import**: Import carts via CSV upload
- **Assignment Matrix**: Visual view of cart assignments by FA and department
- **Assignment History**: Track all assignment changes

### 🔄 Handover System

- **Check-Out**: Record cart handover with FA assignment and photos
- **Check-In**: Return carts with condition notes
- **Bulk Operations**: Check-in/out multiple carts at once
- **Photo Documentation**: Attach photos during handover
- **History Tracking**: Complete audit trail of all handovers

### 🔧 Maintenance Management

- **Issue Reporting**: Report maintenance issues with photos
- **Status Tracking**: Open → In Progress → Resolved
- **Admin Dashboard**: Monitor all maintenance issues
- **Photo Evidence**: Document issues with multiple photos

### 📊 Reports & Analytics

- **Export Formats**: Excel (.xlsx), PDF, Word (.docx)
- **Report Types**:
  - Utilization reports by stadium, department, FA
  - Handover history exports
  - Maintenance reports
  - Fleet inventory exports
  - Full system reports
- **Activity Audit Log**: Track all system actions

### 📝 Car Request System (Public)

- **Public Request Form**: Department leads can request carts without login
- **Request Link Generator**: SuperAdmin creates shareable links
- **Approval Workflow**: Admin/SuperAdmin approves or rejects requests
- **Email Notifications**: Requesters receive approval/rejection emails
- **Request Tracking**: Unique token for status checking

### ⚙️ System Settings (SuperAdmin)

- **Tournament Branding**: Upload logo, header, and footer images
- **Notifications**: Configure maintenance alert emails
- **Handover Settings**: Timeout thresholds, default stadium
- **Feature Toggles**: Enable/disable maintenance reports, handover photos
- **System Announcements**: Display time-bound announcements
- **Export Preferences**: User-specific default export format

### 🏟️ Stadium & Department Management

- **Stadiums**: Create, edit, activate/deactivate venues
- **Departments**: Organize by department within stadiums
- **Bulk Creation**: Create departments across all stadiums at once
- **FA Assignment**: Assign FAs to specific departments

### 👥 User Management

- **User Creation**: Create users with stadium/department assignment
- **Bulk User Import**: Create multiple users at once
- **User Status**: Activate/deactivate users
- **Password Management**: Reset passwords, set temporary passwords
- **Preferences**: Export format preferences per user

## Tech Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui (Radix-based)
- **State Management**: Zustand
- **Routing**: React Router v6
- **HTTP Client**: Axios
- **Icons**: Lucide React

### Backend
- **Runtime**: Node.js 20 LTS
- **Framework**: Express.js
- **ORM**: Prisma
- **Database**: PostgreSQL 16
- **Storage**: MinIO (S3-compatible)
- **Authentication**: JWT with bcrypt password hashing
- **Email**: Resend (production), MailHog (development)
- **Validation**: Zod

### Infrastructure
- **Containerization**: Docker, Docker Compose
- **Reverse Proxy**: Cloudflare Tunnel
- **Monitoring**: Prometheus, Grafana, Alertmanager

## Quick Start

### Prerequisites

- Node.js 20 LTS
- Docker & Docker Compose
- PostgreSQL 16 (via Docker)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/O96a/GCMS.git
cd GCMS
```

2. **Install dependencies**
```bash
# Backend
cd backend
npm install
cp .env.example .env

# Frontend
cd ../frontend
npm install
cp .env.example .env
```

3. **Configure environment**

Backend `.env`:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/gcms"
JWT_SECRET="your-jwt-secret"
JWT_REFRESH_SECRET="your-refresh-secret"
MINIO_ENDPOINT="localhost"
MINIO_PORT="9000"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"
MINIO_BUCKET="gcms"
MINIO_USE_SSL="false"
SMTP_HOST="localhost"
SMTP_PORT="1025"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="noreply@gcms.local"
```

Frontend `.env`:
```env
VITE_API_URL=http://localhost:3005/api/v1
```

4. **Start infrastructure**
```bash
docker-compose up -d
```

5. **Initialize database**
```bash
cd backend
npx prisma migrate dev
npx prisma db seed
```

6. **Run development servers**
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

Access the application at `http://localhost:3000`

### Default Users

After seeding, the following users are created:

| Role | Email | Password |
|------|-------|----------|
| SuperAdmin | superadmin@gcms.local | admin123 |
| Admin | admin@gcms.local | admin123 |

## Project Structure

```
GCMS/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma      # Database schema
│   │   ├── seed.ts             # Seed data
│   │   └── migrations/         # Migration files
│   ├── src/
│   │   ├── config/             # Configuration files
│   │   ├── middleware/         # Express middleware
│   │   ├── modules/            # Feature modules
│   │   │   ├── auth/           # Authentication
│   │   │   ├── departments/    # Department management
│   │   │   ├── fleet/          # Fleet management
│   │   │   ├── handover/       # Handover operations
│   │   │   ├── maintenance/    # Maintenance tracking
│   │   │   ├── reports/        # Reporting & exports
│   │   │   ├── requests/       # Public car requests
│   │   │   ├── settings/       # System settings
│   │   │   ├── stadiums/       # Stadium management
│   │   │   └── users/          # User management
│   │   ├── services/           # Shared services
│   │   ├── app.ts             # Express app setup
│   │   └── index.ts           # Entry point
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/          # Auth components
│   │   │   ├── layout/        # Layout components
│   │   │   └── ui/            # UI primitives
│   │   ├── lib/
│   │   │   ├── api.ts         # API client
│   │   │   ├── constants.ts   # Constants
│   │   │   └── utils.ts       # Utilities
│   │   ├── pages/             # Page components
│   │   ├── stores/            # Zustand stores
│   │   ├── App.tsx            # App component
│   │   └── main.tsx           # Entry point
│   └── package.json
├── docker-compose.yml
└── README.md
```

## User Roles & Permissions

### SuperAdmin
- ✅ Full system access
- ✅ Manage all stadiums
- ✅ Create/manage all users
- ✅ Configure system settings
- ✅ View all data across stadiums
- ✅ Generate request links
- ✅ Manage all car requests

### Admin
- ✅ Stadium-specific management
- ✅ Create/manage users in their stadium
- ✅ Manage fleet and departments
- ✅ Process handovers
- ✅ View reports for their stadium
- ✅ Manage car requests for their stadium
- ❌ Cannot access other stadiums
- ❌ Cannot manage SuperAdmin users

### FA (Field Assistant)
- ✅ Check-in/out carts
- ✅ Report maintenance issues
- ✅ View own handover history
- ✅ View assigned carts
- ❌ Cannot manage users or settings
- ❌ Cannot access reports

### Observer
- ✅ View dashboard
- ✅ View fleet status
- ✅ View reports
- ✅ View car requests
- ❌ Cannot create/edit data
- ❌ Cannot process handovers

## Modules

### Authentication (`/auth`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/login` | POST | User login |
| `/auth/logout` | POST | User logout |
| `/auth/refresh` | POST | Refresh access token |
| `/auth/me` | GET | Get current user |
| `/auth/forgot-password` | POST | Request password reset |
| `/auth/reset-password` | POST | Reset password with token |

### Fleet (`/fleet`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/fleet` | GET | List all carts (filtered by role) |
| `/fleet/:id` | GET | Get cart by ID |
| `/fleet` | POST | Create new cart |
| `/fleet/:id` | PUT | Update cart |
| `/fleet/:id` | DELETE | Delete cart |
| `/fleet/bulk-import` | POST | Bulk import from CSV |
| `/fleet/:id/assign` | POST | Assign cart to user |
| `/fleet/assignment-matrix` | GET | Get assignment matrix |
| `/fleet/bulk-assign` | POST | Bulk assign carts |
| `/fleet/assignment-history` | GET | Get assignment history |
| `/fleet/my-carts` | GET | Get user's assigned carts |

### Handover (`/handover`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/handover/checkout` | POST | Check out cart(s) |
| `/handover/checkin` | POST | Check in cart(s) |
| `/handover/bulk-checkout` | POST | Bulk check out |
| `/handover/bulk-checkin` | POST | Bulk check in |
| `/handover/history` | GET | Get handover history |

### Maintenance (`/maintenance`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/maintenance` | GET | List all maintenance issues |
| `/maintenance` | POST | Report new issue |
| `/maintenance/fleet/:fleetId` | GET | Get issues for cart |
| `/maintenance/:id/status` | PATCH | Update issue status |
| `/maintenance/export` | GET | Export maintenance log |

### Requests (`/requests`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/public/requests` | POST | Submit public request |
| `/public/requests/:token` | GET | View request by token |
| `/requests` | GET | List all requests (Admin) |
| `/requests/:id` | GET | Get request by ID |
| `/requests/:id/approve` | POST | Approve request |
| `/requests/:id/reject` | POST | Reject request |
| `/requests/:id` | DELETE | Delete request |

### Reports (`/reports`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/reports/utilization` | GET | Utilization statistics |
| `/reports/handover/export` | GET | Export handover log |
| `/reports/maintenance/export` | GET | Export maintenance log |
| `/reports/fleet/export` | GET | Export fleet inventory |
| `/reports/activity/export` | GET | Export activity log |
| `/reports/full` | GET | Full system export |
| `/reports/audit` | GET | Get audit log |
| `/reports/stadium/:id` | GET | Stadium-specific report |
| `/reports/department/:id` | GET | Department-specific report |
| `/reports/user/:id` | GET | User-specific report |

### Settings (`/settings`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/settings` | GET | Get system settings |
| `/settings` | PUT | Update settings (SuperAdmin) |

### Stadiums (`/stadiums`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/stadiums` | GET | List all stadiums |
| `/stadiums/:id` | GET | Get stadium by ID |
| `/stadiums` | POST | Create stadium |
| `/stadiums/:id` | PUT | Update stadium |
| `/stadiums/:id` | DELETE | Delete stadium |

### Departments (`/departments`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/departments` | GET | List all departments |
| `/departments/:id` | GET | Get department by ID |
| `/departments` | POST | Create department |
| `/departments/bulk` | POST | Create across all stadiums |
| `/departments/:id` | PUT | Update department |
| `/departments/:id` | DELETE | Delete department |

### Users (`/users`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/users` | GET | List all users |
| `/users/:id` | GET | Get user by ID |
| `/users` | POST | Create user |
| `/users/bulk` | POST | Bulk create users |
| `/users/:id` | PUT | Update user |
| `/users/:id/status` | PATCH | Activate/deactivate |
| `/users/me/preferences` | PATCH | Update preferences |

## Database Schema

### Core Entities

```
Stadium ─┬─ Department ─┬─ User
         │              └─ Fleet
         │
         └─ CarRequest

User ────┬─ RefreshToken
         ├─ HandoverLog
         ├─ MaintenanceLog
         └─ CarRequest (reviewer)

Fleet ───┬─ HandoverLog
         └─ MaintenanceLog

SystemSettings
AuditLog
```

### Relationships

- **Stadium** has many: Departments, Users, Fleets, CarRequests
- **Department** belongs to: Stadium, has many: Users, Fleets, CarRequests
- **User** belongs to: Stadium (optional), Department (optional)
- **Fleet** belongs to: Stadium, Department (optional), User (assigned)
- **HandoverLog** belongs to: Fleet, User
- **MaintenanceLog** belongs to: Fleet, User (reporter)
- **CarRequest** belongs to: Stadium, Department, User (reviewer)

## Configuration

### Environment Variables

#### Backend

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `JWT_REFRESH_SECRET` | Refresh token secret | Yes |
| `MINIO_ENDPOINT` | MinIO endpoint | Yes |
| `MINIO_PORT` | MinIO port | Yes |
| `MINIO_ACCESS_KEY` | MinIO access key | Yes |
| `MINIO_SECRET_KEY` | MinIO secret key | Yes |
| `MINIO_BUCKET` | MinIO bucket name | Yes |
| `MINIO_USE_SSL` | Use SSL for MinIO | No |
| `SMTP_HOST` | SMTP host | Yes |
| `SMTP_PORT` | SMTP port | Yes |
| `SMTP_USER` | SMTP username | No |
| `SMTP_PASS` | SMTP password | No |
| `SMTP_FROM` | From email address | Yes |
| `CORS_ORIGIN` | Allowed CORS origin | Yes |

#### Frontend

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_API_URL` | Backend API URL | Yes |

## Deployment

### Docker Compose (Production)

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: gcms
      POSTGRES_USER: gcms
      POSTGRES_PASSWORD: secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data

  backend:
    build: ./backend
    ports:
      - "3005:3005"
    depends_on:
      - postgres
      - minio

  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend

volumes:
  postgres_data:
  minio_data:
```

### Production Checklist

- [ ] Set strong JWT secrets
- [ ] Configure SSL/TLS
- [ ] Set up Cloudflare tunnel or reverse proxy
- [ ] Configure production email (Resend)
- [ ] Set up monitoring (Prometheus/Grafana)
- [ ] Configure database backups
- [ ] Review CORS settings
- [ ] Enable rate limiting

## Testing

### Run Backend Tests
```bash
cd backend
npm run test
```

### Run Frontend Tests
```bash
cd frontend
npm run test
```

### Type Checking
```bash
# Backend
cd backend && npx tsc --noEmit

# Frontend
cd frontend && npx tsc --noEmit
```

## License

MIT License - See [LICENSE](LICENSE) for details.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

For issues and feature requests, please use the [GitHub Issues](https://github.com/O96a/GCMS/issues) page.