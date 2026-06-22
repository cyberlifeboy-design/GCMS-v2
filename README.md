# GCMS - Golf Cart Management System

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/cyberlifeboy-design/GCMS-v2/blob/main/LICENSE)
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

GCMS is a comprehensive fleet management system designed for golf cart operations during tournaments and events. It provides complete fleet tracking, handover management, pool booking, maintenance reporting with full quotation workflow, incident reporting, and administrative tools across multiple stadiums and venues.

### Key Capabilities

- **Multi-Stadium Support**: Manage fleets across multiple stadiums/venues with bulk venue import
- **Role-Based Access Control**: SuperAdmin, Admin, FA, Observer, Contracts, and MaintenanceTeam roles
- **Fleet Management**: Track carts, assignments, and status across locations
- **Handover Workflow**: Complete check-in/check-out system with auto-fill, bilingual PDF, two-party digital signing, and photo documentation
- **Pool Booking**: Shared cart pool system — checkout/return without full handover; simple timed usage log
- **Terms & Conditions**: Rich text T&C editor (TipTap) with dynamic confirmation checkboxes, bilingual EN/AR
- **Maintenance Tracking**: Full workflow from issue report → Admin escalation → Contracts quotation request → Maintenance quotation submission (QAR) → Contracts approval/rejection → resolution; PDF report generation with embedded photos
- **Incident Report**: Standalone bilingual HTML incident report form with system logo, vehicle inspection checklist, and print-to-PDF
- **Reporting**: Export reports in Excel, PDF, or Word formats
- **Public Request System**: Allow department leads to request carts without login
- **System Configuration**: Comprehensive settings for customization

## Features

### 🔐 Authentication & Authorization

- **JWT-based authentication** with refresh tokens
- **Password reset** via email
- **Role-based access control** (RBAC) with six roles:
  - **SuperAdmin**: Full system access, stadium management, all stadiums visibility
  - **Admin**: Stadium-specific management, user creation, fleet operations
  - **FA (Field Assistant)**: Handover operations, maintenance reporting, additional driver management
  - **Observer**: Read-only access to reports and dashboards
  - **Contracts**: Logistics department scoped, handles quotation approvals
  - **MaintenanceTeam**: Logistics department scoped, handles maintenance assignments and resolutions

### 🚗 Fleet Management

- **Cart Types**: Cargo, 4-Seater, 6-Seater, Accessibility
- **Cart Statuses**: Available, Assigned, Dispatched, Under Maintenance
- **Bulk Import**: Import carts via CSV upload
- **Assignment Matrix**: Visual view of cart assignments by FA and department
- **Assignment History**: Track all assignment changes
- **Additional Drivers**: FA can register additional drivers per assigned cart (name, phone, accreditation number) after handover is signed
- **Pool Flag**: Admin can mark any cart as a pool cart (`isPool`) for shared fleet use

### 🔄 Handover System

- **Auto-Fill**: All form fields pre-populated from system data (serial number, FA code, date/location, admin & FA names, contact numbers)
- **Cart Type Lock**: Golf Cart Type is read-only on the form — fetched from fleet data, displayed as locked checkboxes
- **Bilingual PDF**: Full EN/AR handover form with two-party digital signing
- **Dynamic T&C**: Confirmation checkboxes defined by SuperAdmin in Settings, stored as JSON, rendered per-form
- **Check-Out / Check-In**: Record handovers with FA assignment and photos
- **Bulk Operations**: Check-in/out multiple carts at once
- **Photo Documentation**: Attach photos during handover
- **History Tracking**: Complete audit trail of all handovers
- **Admin Return Flow**: Complete cart return lifecycle — FA requests handback → cart enters HandbackPending queue → Admin opens Inspect & Sign Return Form → fills After-Use condition, adds return notes, signs → cart released to Available pool
- **Return Queue (Admin)**: HandoverPage "Releases & Returns" section shows all carts in Returned/HandbackPending status with "Inspect & Sign Return" button per row; FleetPage also provides one-click return inspection via RotateCcw button
- **Return Signature Stored**: Admin return sign-off saved to `returnAdminSigData` field with `returnDate`; form status progresses to `RETURNED`; visible in view mode when reopening the form

### 🏊 Pool Booking

Shared pool carts can be checked out and returned without a full handover form — designed for short-duration shared use.

- **Pool Cart Marking**: Admin/SuperAdmin toggle `isPool` on any fleet cart via the Manage Pool dialog; blocked if an active booking exists
- **Checkout**: Record driver name, phone (optional), accreditation number (optional), purpose, and expected return time; Fleet status automatically set to `Dispatched`
- **Return**: Record return notes; Fleet status automatically set back to `Available`
- **Pool Fleet View**: Card grid shows all pool carts — green = Available, orange = Checked Out (shows active driver info)
- **History Tab**: Full paginated booking log with driver, timestamps, and return notes
- **Stats**: Total pool carts, available, checked-out counts
- **Roles**: SuperAdmin, Admin, FA, Observer can access Pool Booking page; only Admin/SuperAdmin can toggle pool status

### 🔧 Maintenance Management

Full multi-party workflow from issue report through quotation approval to resolution.

#### Workflow

```
FA/Admin reports issue (Open)
    ↓
Admin reviews → clicks "Escalate to Contracts"
    ↓
Contracts notified → clicks "Request Quotation" (PendingQuotation)
    ↓
MaintenanceTeam notified → submits full quotation: cost (QAR) + description + timeline (PendingApproval)
    ↓
Contracts reviews → Approve (InProgress) OR Reject (back to Open)
    ↓
MaintenanceTeam completes work → marks Resolved
```

- **Issue Reporting**: FA/Admin report issues with issue type, description, and up to 5 photos
- **Escalate to Contracts**: Admin explicitly escalates Open issues; Contracts team is notified in-app
- **Quotation Request**: Contracts requests quotation from Maintenance Team
- **Full Quotation Submission**: MaintenanceTeam submits fix cost (QAR), work description, and estimated timeline
- **Approve / Reject**: Contracts approves (starts work) or rejects with reason; rejection sends issue back to Open for Admin to re-evaluate
- **Notifications**: In-app push notifications at every workflow step to relevant roles
- **Detail Modal**: Full view of all issue data — cart/venue, reporter, escalation info, quotation block, rejection banner, resolution notes, photo gallery with lightbox
- **Cart History**: Timeline of all past issues per cart (Admin/Observer)
- **PDF Report**: Server-generated HTML report opened in new browser tab for print/save as PDF; includes system logo, full cart and venue details, escalation info, QAR quotation highlight, work description, embedded photos, rejection/resolution notes
- **CSV Export**: Full maintenance log export
- **FA Scoped View**: FA users see only their own reported issues
- **QAR Currency**: All cost displays use QAR throughout

### 📋 Incident Report

A standalone HTML form for recording golf cart incidents during operations.

- **System Logo**: Fetched from `GET /api/v1/settings/public` on load — matches tournament branding
- **Incident Types**: Collision, Near-Miss, Property Damage, Personal Injury, Illness, Other (checkboxes)
- **Core Fields**: Date, time, location, incident description
- **Cart User Info**: Name, designation, accreditation number, contact number
- **Witness Information**: Name, designation, contact number
- **Injury/Illness Details**: Body part affected, designation, nature of injury/illness, treatment type checkboxes (First Aid, Medical Center, Hospital, No Treatment)
- **Vehicle Inspection Checklist**: Table-format Yes/No check for headlights, tail lights, tires, battery, brakes, windshield, horn
- **Road Test**: Pass/Fail with remarks
- **Signatures**: Reported To, Completed By, Inspector fields
- **Print-to-PDF**: Print button + `window.print()` with `@media print` CSS; page break before inspection checklist

### 📊 Reports & Analytics

- **Export Formats**: Excel (.xlsx), PDF, Word (.docx)
- **Report Types**:
  - Utilization reports by stadium, department, FA
  - Handover history exports
  - Maintenance reports
  - Fleet inventory exports
  - Full system reports
- **Activity Audit Log**: Track all system actions
- **FA Personal Reports**: FA users have a dedicated "My Reports" tab scoped to their own submissions
- **Signed Handover Forms (FA)**: "My Reports" page includes a "Signed Handover Forms" card listing all the FA's completed/returned forms with Cart#, type, venue, status badge, signed date, and "View & PDF" button
- **Handover Forms Tab (Admin)**: Admin "Reports" page includes a "Handover Forms" tab with search, filter, paginated table, and "View & PDF" per row

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
- **Handover T&C**: Rich text editor (TipTap) for bilingual EN/AR Terms & Conditions title and body; dynamic checkbox manager (add/edit/remove confirmation checkboxes with EN+AR labels)
- **Feature Toggles**: Enable/disable maintenance reports, handover photos
- **System Announcements**: Display time-bound announcements
- **Export Preferences**: User-specific default export format

### 🏟️ Stadium & Department Management

- **Stadiums**: Create, edit, activate/deactivate venues
- **Bulk Import**: POST /stadiums/bulk — import multiple venues at once; ships with 10-venue GC template (ABS, LUS, ECS, LMPH, KIS, AAS, ATS, AJS, JHS, QSC)
- **Departments**: Organize by department within stadiums
- **Bulk Creation**: Create departments across all stadiums at once (FAC25 default template available)
- **FA Assignment**: Assign FAs to specific departments

### 👥 User Management

- **User Creation**: Create users with stadium/department assignment
- **Bulk User Import**: Create multiple users at once
- **User Status**: Activate/deactivate users
- **Password Management**: Reset passwords, set temporary passwords
- **FA Credential Editing**: Admins can update FA name, email, phone, and accreditation; department scoped per Admin role
- **Preferences**: Export format preferences per user

### 🔔 FA Dashboard (Handover Cycle Page)

FA users see a role-specific view with three personal tabs:

- **Usage History**: All check-in/check-out/handover log entries for the FA's assigned carts
- **My Reports**: Maintenance issues the FA has personally reported
- **Notifications**: System and admin push notifications with unread badge; mark-as-read per item or bulk

Admin/SuperAdmin retain the full Pending Handovers / Real-time Stream / Global Audit / Venue Status tabs, plus:

- **Releases & Returns**: Admin "Releases & Returns" panel in HandoverPage shows all carts with `Returned` or `HandbackPending` status; each row has "Inspect & Sign Return" to open the return form modal

## Tech Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui (Radix-based)
- **Rich Text Editor**: TipTap (handover T&C in Settings)
- **State Management**: Zustand
- **Routing**: React Router v6
- **HTTP Client**: Axios
- **Icons**: Lucide React

### Backend
- **Runtime**: Node.js 20 LTS
- **Framework**: Express.js
- **ORM**: Prisma
- **Database**: PostgreSQL 16 (SQLite for local dev)
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
- Docker & Docker Compose (for production infra)

### Local Development (SQLite)

1. **Clone the repository**
```bash
git clone https://github.com/cyberlifeboy-design/GCMS-v2.git
cd GCMS-v2
```

2. **Install dependencies**
```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

3. **Configure environment**

Backend `.env`:
```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-jwt-secret"
JWT_REFRESH_SECRET="your-refresh-secret"
CORS_ORIGIN="http://localhost:3000"
```

Frontend `.env`:
```env
VITE_API_URL=http://localhost:3005/api/v1
```

4. **Initialize database**
```bash
cd backend
npx prisma migrate dev
npx prisma db seed
```

5. **Run development servers**
```bash
# Terminal 1 — Backend (port 3005)
cd backend
npm run dev

# Terminal 2 — Frontend (port 3000)
cd frontend
npm run dev
```

Access the application at **http://localhost:3000**

> **Windows note:** Stop the backend before running `prisma migrate dev` — the running process holds a `.dll.node` file lock (EPERM rename error). Kill with `Stop-Process -Name "node" -Force`, migrate, then restart.

### Default Users (after seed)

| Role | Email | Password |
|------|-------|----------|
| SuperAdmin | superadmin@gcms.com | Admin@2024! |
| Admin | admin@gcms.com | Admin@2024! |
| FA | fa@gcms.com | FA@2024! |
| Observer | observer@gcms.com | Observer@2024! |
| Contracts | contracts@gcms.com | Contracts@2024! |
| MaintenanceTeam | maintenance@gcms.com | Maint@2024! |

## Project Structure

```
GCMS-v2/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma             # Database schema
│   │   ├── seed.ts                   # Seed data
│   │   └── migrations/               # Migration files
│   ├── src/
│   │   ├── config/                   # Configuration files
│   │   ├── middleware/               # Express middleware (RBAC, auth — supports ?token= query param)
│   │   └── modules/                  # Feature modules
│   │       ├── auth/                 # Authentication
│   │       ├── departments/          # Department management
│   │       ├── fleet/                # Fleet management + additional drivers
│   │       ├── handover/             # Handover operations
│   │       ├── maintenance/          # Maintenance + full Contracts/MT quotation workflow
│   │       ├── notifications/        # Push notifications
│   │       ├── pool-bookings/        # Pool cart checkout/return system
│   │       ├── reports/              # Reporting & exports
│   │       ├── requests/             # Public car requests
│   │       ├── settings/             # System settings + T&C
│   │       ├── stadiums/             # Stadium management + bulk import
│   │       └── users/                # User management
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── handover/             # HandoverFormModal (auto-fill, dynamic T&C)
│   │   │   ├── layout/               # Layout components
│   │   │   └── ui/                   # UI primitives + rich-editor (TipTap)
│   │   ├── lib/
│   │   │   ├── api.ts                # API client (maintenanceApi, poolBookingsApi)
│   │   │   ├── constants.ts          # Constants
│   │   │   └── utils.ts              # Utilities
│   │   ├── pages/                    # Page components
│   │   │   ├── HandoverPage.tsx      # FA + Admin role-specific tabs
│   │   │   ├── MaintenancePage.tsx   # Full quotation workflow, QAR, PDF report
│   │   │   ├── PoolBookingPage.tsx   # Pool cart checkout/return
│   │   │   ├── SettingsPage.tsx      # T&C rich editor + checkbox manager
│   │   │   ├── StadiumsPage.tsx      # Bulk venue import
│   │   │   └── UsersPage.tsx         # FA credential editing
│   │   ├── stores/                   # Zustand stores
│   │   └── styles/globals.css        # TipTap editor styles
│   └── package.json
├── documents/
│   └── incident_report.html          # Standalone bilingual incident report form
├── docker-compose.yml
├── docker-compose.dev.yml
└── README.md
```

## User Roles & Permissions

### SuperAdmin
- ✅ Full system access
- ✅ Manage all stadiums (including bulk import)
- ✅ Create/manage all users
- ✅ Configure system settings and T&C
- ✅ View all data across stadiums
- ✅ Generate request links
- ✅ Manage all car requests
- ✅ Full access to Pool Booking and Maintenance workflow

### Admin
- ✅ Stadium-specific management
- ✅ Create/manage users in their stadium (including FA credential edits)
- ✅ Manage fleet and departments
- ✅ Process handovers
- ✅ View reports for their stadium
- ✅ Manage car requests for their stadium
- ✅ Escalate maintenance issues to Contracts
- ✅ Manage pool cart fleet (mark/unmark as pool)
- ❌ Cannot access other stadiums
- ❌ Cannot manage SuperAdmin users

### FA (Field Assistant)
- ✅ Check-in/out carts
- ✅ Report maintenance issues (scoped to own reports)
- ✅ Pool cart checkout/return
- ✅ View own handover usage history
- ✅ Manage additional drivers on their assigned cart (post-signing)
- ✅ View personal notifications
- ❌ Cannot manage users or settings
- ❌ Cannot access other FAs' data

### Observer
- ✅ View dashboard
- ✅ View fleet status
- ✅ View reports
- ✅ View car requests
- ✅ View maintenance issues and PDF reports
- ✅ View pool booking history
- ❌ Cannot create/edit data
- ❌ Cannot process handovers

### Contracts
- ✅ Logistics department scoped (All Stadiums)
- ✅ View all escalated maintenance issues
- ✅ Request quotation from MaintenanceTeam
- ✅ Approve or reject submitted quotations (with rejection reason)
- ✅ Download/print full maintenance PDF report
- ❌ Cannot modify fleet or user data

### MaintenanceTeam
- ✅ Logistics department scoped (All Stadiums)
- ✅ Submit full quotations (cost in QAR + work description + timeline)
- ✅ Mark assigned issues as resolved after approval
- ❌ Cannot modify fleet or user data

## API Reference

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
| `/fleet/:id/drivers` | GET | Get additional drivers for a cart |
| `/fleet/:id/drivers` | PATCH | Update additional drivers |

### Handover (`/handover`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/handover/checkout` | POST | Check out cart(s) |
| `/handover/checkin` | POST | Check in cart(s) |
| `/handover/bulk-checkout` | POST | Bulk check out |
| `/handover/bulk-checkin` | POST | Bulk check in |
| `/handover/history` | GET | Get handover history |

### Pool Bookings (`/pool-bookings`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/pool-bookings/fleet` | GET | List pool carts (with active booking status) |
| `/pool-bookings` | GET | List all pool booking records |
| `/pool-bookings/checkout` | POST | Checkout a pool cart |
| `/pool-bookings/:id/return` | PATCH | Return a pool cart |
| `/pool-bookings/fleet/:id/toggle-pool` | PATCH | Mark/unmark cart as pool (Admin) |

### Maintenance (`/maintenance`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/maintenance` | GET | List issues (FA: own only; others: all) |
| `/maintenance` | POST | Report new issue (with photo upload) |
| `/maintenance/:id` | GET | Get issue details |
| `/maintenance/fleet/:fleetId` | GET | Get issue history for a cart |
| `/maintenance/:id/escalate` | POST | Admin escalates issue to Contracts |
| `/maintenance/:id/request-quotation` | POST | Contracts requests quotation from Maintenance |
| `/maintenance/:id/submit-cost` | POST | MaintenanceTeam submits quotation (QAR + description + timeline) |
| `/maintenance/:id/approve-cost` | POST | Contracts approves quotation |
| `/maintenance/:id/reject-quotation` | POST | Contracts rejects quotation (issue returns to Open) |
| `/maintenance/:id/status` | PATCH | Update issue status (Admin/MT) |
| `/maintenance/:id/pdf` | GET | Generate full HTML report (supports `?token=` auth) |
| `/maintenance/export` | GET | Export maintenance log as CSV |

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
| `/settings/public` | GET | Get public branding/T&C (no auth) |

### Stadiums (`/stadiums`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/stadiums` | GET | List all stadiums |
| `/stadiums/:id` | GET | Get stadium by ID |
| `/stadiums` | POST | Create stadium |
| `/stadiums/bulk` | POST | Bulk create venues (skips existing codes) |
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
         │              └─ Fleet ─┬─ additionalDrivers (JSON)
         │                        ├─ isPool (Boolean)
         │                        └─ PoolBooking[]
         │
         └─ CarRequest

User ────┬─ RefreshToken
         ├─ HandoverLog
         ├─ MaintenanceLog (reportedBy)
         ├─ MaintenanceLog (escalatedBy — contractsEscalatedBy relation)
         ├─ PoolBooking (createdBy / returnedBy)
         └─ CarRequest (reviewer)

Fleet ───┬─ HandoverLog (tcData JSON)
         ├─ MaintenanceLog
         └─ PoolBooking

MaintenanceLog
  ├─ status: Open | PendingQuotation | PendingApproval | InProgress | Resolved
  ├─ quotationStatus: Requested | Submitted | Approved | Rejected
  ├─ fixCost (QAR)
  ├─ quotationDescription
  ├─ quotationTimeline
  ├─ contractsEscalatedAt / contractsEscalatedById
  ├─ rejectionReason / rejectedAt
  └─ photosUrls (JSON array)

PoolBooking
  ├─ status: Active | Returned
  ├─ driverName / driverPhone / accreditationNumber / purpose
  ├─ checkoutAt / expectedReturnAt / returnedAt
  └─ returnNotes

SystemSettings
  ├─ handoverTcEnTitle / handoverTcEnBody (HTML)
  ├─ handoverTcArTitle / handoverTcArBody (HTML)
  └─ handoverTcCheckboxes (JSON: [{id, en, ar}])

AuditLog
```

### Relationships

- **Stadium** has many: Departments, Users, Fleets, CarRequests
- **Department** belongs to: Stadium, has many: Users, Fleets, CarRequests
- **User** belongs to: Stadium (optional), Department (optional)
- **Fleet** belongs to: Stadium, Department (optional), User (assigned); has `isPool` flag; stores additional drivers as JSON
- **HandoverLog** belongs to: Fleet, User; stores dynamic T&C checkbox state as `tcData` JSON
- **MaintenanceLog** belongs to: Fleet, reportedBy User, contractsEscalatedBy User; tracks full quotation workflow in QAR
- **PoolBooking** belongs to: Fleet, createdBy User, returnedBy User
- **CarRequest** belongs to: Stadium, Department, User (reviewer)
- **SystemSettings** stores T&C content (titles + TipTap HTML bodies) and dynamic checkbox definitions

## Configuration

### Environment Variables

#### Backend

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL or SQLite connection string | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `JWT_REFRESH_SECRET` | Refresh token secret | Yes |
| `CORS_ORIGIN` | Allowed CORS origin(s) | Yes |
| `MINIO_ENDPOINT` | MinIO endpoint | Prod only |
| `MINIO_PORT` | MinIO port | Prod only |
| `MINIO_ACCESS_KEY` | MinIO access key | Prod only |
| `MINIO_SECRET_KEY` | MinIO secret key | Prod only |
| `MINIO_BUCKET` | MinIO bucket name | Prod only |
| `MINIO_USE_SSL` | Use SSL for MinIO | No |
| `SMTP_HOST` | SMTP host | Yes |
| `SMTP_PORT` | SMTP port | Yes |
| `SMTP_USER` | SMTP username | No |
| `SMTP_PASS` | SMTP password | No |
| `SMTP_FROM` | From email address | Yes |

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

For issues and feature requests, please use the [GitHub Issues](https://github.com/cyberlifeboy-design/GCMS-v2/issues) page.
