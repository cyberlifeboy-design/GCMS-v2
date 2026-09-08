# Pool Booking System — Design Spec

**Date:** 2026-09-08
**Status:** Approved for planning

## 1. Overview

GCMS currently has two disconnected ways to get a pool cart:

- A public `/request` page (`PublicRequestPage.tsx`) for *dedicated* car requests, reviewed by Admin/SuperAdmin (`RequestsManagementPage.tsx`, backed by the `CarRequest` model).
- An internal, logged-in-only `/pool-booking` page (`PoolBookingPage.tsx`) where an FA immediately logs a pool-cart checkout with no approval step (backed by the `PoolBooking` model).

This spec replaces the second flow with a single, unified **Bookings** system: one request-and-approval workflow for reserving a specific pool cart at a specific venue for a specific date/time window, usable both by unauthenticated external requesters and by logged-in FA/Admin/SuperAdmin users from within the app. Both entry points see the same live availability and cannot select or get approved for an already-booked car/time.

## 2. Goals

- One shared pool-booking pipeline: same data, same availability, same approval gate, regardless of who submits.
- Hard prevention of double-booking the same cart for overlapping date/time windows, enforced at approval time.
- Admin (own venue) / SuperAdmin (all venues) can approve, reject (with comment), and amend any booking to resolve conflicts.
- Per-venue configurable operating hours that constrain what times can be requested.
- Login page updated: branding title/subtitle, placeholder Microsoft SSO button, links to the existing request page and the new booking page.

## 3. Non-Goals (out of scope for this pass)

- Real Microsoft Entra/Azure AD SSO — the login button is a labeled placeholder only.
- Blackout dates / holiday calendars — only a daily operating-hours window (start/end time) per venue.
- Physical checkout/return logging (odometer, condition notes, photos) inside the new booking flow — that remains the job of the existing Handover module. This system governs *reservation*, not physical handover.
- Auto-approval of any kind — every booking, from every channel, requires explicit Admin/SuperAdmin action.

## 4. Data Model

### New model: `PoolBookingRequest`

```prisma
model PoolBookingRequest {
  id                String    @id @default(cuid())

  stadiumId         String
  stadium           Stadium   @relation(fields: [stadiumId], references: [id])
  fleetId           String
  fleet             Fleet     @relation(fields: [fleetId], references: [id])

  requesterName     String
  requesterEmail    String
  requesterPhone    String

  faUserId          String
  faUser            User      @relation("PoolBookingRequestFA", fields: [faUserId], references: [id])

  bookingType       String    // "Single" | "Recurring"
  startDate         String    // ISO date (yyyy-mm-dd)
  endDate           String    // ISO date; equals startDate for Single
  startTime         String    // "HH:mm", daily window start
  endTime           String    // "HH:mm", daily window end
  purpose           String?

  status            String    @default("Pending") // Pending, Approved, Rejected, Cancelled
  reviewedById      String?
  reviewedBy        User?     @relation("PoolBookingRequestReviewer", fields: [reviewedById], references: [id])
  reviewedAt        DateTime?
  reviewComment     String?

  requestToken      String    @unique  // for the public status-check link

  createdById       String?   // set when submitted by a logged-in user; null for external/public
  createdByUser     User?     @relation("PoolBookingRequestCreatedBy", fields: [createdById], references: [id])

  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@index([stadiumId])
  @@index([fleetId])
  @@index([status])
  @@index([requestToken])
}
```

### Stadium additions (per-venue operating hours)

```prisma
poolBookingStartTime String? // "HH:mm", null = no restriction
poolBookingEndTime   String? // "HH:mm", null = no restriction
```

### Existing `PoolBooking` model

Left untouched for historical data (past immediate checkouts remain queryable), but the app stops creating new rows in it — the old `/pool-booking` immediate-checkout page and its "create" action are removed. No data migration needed.

## 5. Conflict Rule

Two `PoolBookingRequest` rows conflict when they target the **same `fleetId`**, both have (or would have) status `Approved`, and:

```
dateRangesOverlap = startDate <= other.endDate && endDate >= other.startDate
timeWindowsOverlap = startTime < other.endTime && endTime > other.startTime
conflict = dateRangesOverlap && timeWindowsOverlap
```

- **At submission time:** the car-selection list only shows pool cars at the chosen venue that have no conflicting *Approved* booking against the requested date/time — best-effort, since two people can still submit overlapping requests for the same car before either is reviewed.
- **At approval time:** the server re-checks for a conflicting Approved booking on that cart. If one exists, approval is rejected (409) and the conflicting booking is returned to the admin. The admin resolves it by editing/reassigning/cancelling either booking, then retries approval.
- Admin/SuperAdmin can amend any Pending or Approved booking's cart, dates, or time window at any time (e.g., to resolve a conflict or accommodate a change).

## 6. User Flows

### 6a. Submitting a booking (shared by both channels)

1. Pick a venue (active stadiums only).
2. Form appears: requester name, email, phone; FA dropdown (FA-role users at that venue); booking type (Single / Recurring); date(s) — single date, or start+end date for Recurring (daily recurrence across the range); time window (start/end time, validated against the venue's configured operating hours if set); car — list of that venue's pool-labeled (`isPool: true`) Fleet carts with their type, pre-filtered to currently-available ones for the chosen date/time.
3. Submit → creates a `Pending` `PoolBookingRequest`, generates a `requestToken`, notifies that venue's Admins and all SuperAdmins (in-app `Notification`), and shows a confirmation link (`/book-pool/confirm/:token`) the requester can revisit to see status and any review comment.

**Logged-in channel differences (FA/Admin/SuperAdmin via the in-app "Bookings" page):** same form and same rules — nothing is auto-approved. As a convenience, requester name/email/phone pre-fill from the logged-in user's profile, and an FA's own dropdown pre-selects themselves (still editable, e.g. to book on behalf of a colleague). `createdById` is set to the logged-in user; left null for public submissions.

**Public/unauthenticated channel:** reached via `/book-pool`, no login required, all fields entered manually.

### 6b. Reviewing (Admin / SuperAdmin only)

The "Bookings" nav page lists requests — SuperAdmin sees all venues, Admin sees only their own venue. Each Pending request can be Approved or Rejected; a comment is captured either way (required on reject, optional on approve) and stored in `reviewComment`. Approving runs the conflict check from §5. Admin/SuperAdmin can also amend any booking's details directly from this page.

FA and Observer roles can see the page (to submit / view status of their venue's bookings) but have no approve/reject/amend controls.

## 7. API Surface (backend)

New module `backend/src/modules/poolBookingRequest/`, following the existing controller/service/routes pattern (mirrors `carRequest`).

Public:
- `GET /api/v1/pool-booking-requests/venues` — active stadiums
- `GET /api/v1/pool-booking-requests/venues/:stadiumId/fas` — FA users at that venue
- `GET /api/v1/pool-booking-requests/venues/:stadiumId/available-carts?startDate&endDate&startTime&endTime` — pool carts at the venue with no conflicting Approved booking in that window
- `POST /api/v1/pool-booking-requests` — create (works whether or not the caller is authenticated; if authenticated, `createdById` is captured from the token)
- `GET /api/v1/pool-booking-requests/confirm/:token` — status lookup for the requester

Authenticated (RBAC-scoped like the rest of the app — Admin limited to own `stadiumId`, SuperAdmin unrestricted):
- `GET /api/v1/pool-booking-requests` — list, scoped
- `PATCH /api/v1/pool-booking-requests/:id/approve` — body `{ comment? }`, runs conflict check
- `PATCH /api/v1/pool-booking-requests/:id/reject` — body `{ comment }` (required)
- `PATCH /api/v1/pool-booking-requests/:id` — amend (fleetId, dates, times, faUserId, status/cancel)
- `GET/PATCH /api/v1/stadiums/:id/pool-booking-hours` — get/set that venue's operating hours (Admin: own venue only; SuperAdmin: any)

## 8. Frontend

- New public page `PoolBookingRequestPage.tsx` at route `/book-pool`, plus `/book-pool/confirm/:token` (same component, token-driven confirmation view — mirrors `PublicRequestPage.tsx`'s existing pattern).
- New protected page `BookingsPage.tsx` at route `/bookings`, nav item **"Bookings"**. Replaces the current "Pool Booking" nav item; the old `PoolBookingPage.tsx` immediate-checkout page and route are removed.
- `PageGuard` pageKey `"bookings"` added, visible to FA/Admin/SuperAdmin/Observer (submit ability for all logged-in roles except Observer which is read-only; approve/reject/amend restricted to Admin/SuperAdmin in the UI, enforced server-side too).

## 9. Login Page (`LoginPage.tsx`)

- Title: no hardcoding — set `SystemSettings.tournamentName` (already what the title reads from, already editable from Settings) to **"SC - GCMS"**.
- Subtitle (`CardDescription`): "Golf Car Management System".
- Below the Sign In button: a disabled/placeholder **"Sign in with Microsoft Authenticator"** button. Tooltip/toast: "Coming soon — Microsoft sign-in for @sc.qa accounts." (Real Azure AD/Entra SSO is future work, out of scope here — see §3.)
- Below that: **"Submit a Request"** → links to the existing `/request`.
- Below that: **"Bookings"** → links to the new public `/book-pool`.

## 10. Notifications

- On submission: `Notification` rows for the venue's Admins + all SuperAdmins (type `PoolBookingRequested` or similar), plus the existing email pathway if/when wired (not required for this pass — in-app notification is sufficient).
- On approve/reject: if `createdById` is set (internal submitter), a `Notification` to that user. The public confirmation-token page covers the external-requester case regardless.

## 11. Assumptions / Open Items for Implementation

- "Recurring" means a single daily time window repeated every day across `[startDate, endDate]` — no weekday-picker or per-occurrence editing in this pass. If per-day exceptions are needed later, that's a follow-up.
- Operating hours are venue-level only (not global), stored directly on `Stadium`.
- Historical `PoolBooking` rows are not migrated into `PoolBookingRequest`; they simply stop growing.
