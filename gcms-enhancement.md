# GCMS — Golf Cart Management System
## Enhancement & Feature Specification for Development Agent
**Version:** 1.1 | **Status:** Ready for Implementation

---

## 1. SYSTEM OVERVIEW

This document defines all required enhancements and edits to the existing Golf Cart Management System (GCMS). The system manages fleets of golf carts across multiple venues/sites, with role-based access control and full operational tracking (assignment, check-in/out, maintenance).

---

## 2. ROLE-BASED ACCESS CONTROL (RBAC)

There are **exactly 4 user roles** in the system. Every feature, page, and action must enforce these permissions strictly.

---

### 2.1 Role Definitions & Permission Matrix

| Feature / Page | Super Admin | Admin | FA (User) | Observer (LCC/VUM) |
|---|:---:|:---:|:---:|:---:|
| System Settings | ✅ Full | ❌ | ❌ | ❌ |
| Create / Edit Venues | ✅ | ❌ | ❌ | ❌ |
| Create / Edit Admins | ✅ | ❌ | ❌ | ❌ |
| Create / Edit FA Users | ✅ | ✅ (own venue only) | ❌ | ❌ |
| Assign FA to carts | ✅ | ✅ (own venue only) | ❌ | ❌ |
| Fleet Page — All Venues | ✅ | ❌ | ❌ | ❌ |
| Fleet Page — Own Venue | ✅ | ✅ | ❌ | ❌ |
| Handover Page | ✅ | ✅ | ✅ (own carts only) | ❌ (view only) |
| Maintenance Page | ✅ | ✅ (own venue) | Report only | ✅ (view/export) |
| Dashboard — All Venues | ✅ | ❌ | ❌ | ✅ |
| Dashboard — Own Venue | ✅ | ✅ | ❌ | ✅ |
| Export Reports | ✅ | ✅ (own venue) | ❌ | ✅ (all venues) |
| Bulk Import Carts | ✅ | ✅ (own venue) | ❌ | ❌ |
| Customize Theme / Header / Footer | ✅ | ❌ | ❌ | ❌ |

---

### 2.2 Role Descriptions

#### A — Super Admin
- Full unrestricted access to all system functions, all venues, and all data.
- Can create and manage venues, assign Admins to venues, create FA users, and manage Observers.
- Controls system-wide theme (tournament header, footer, logo) displayed on the login page and throughout the system.
- Only role with access to the **System Settings** page.

#### B — Admin
- Created by Super Admin and scoped to a **single assigned venue/site**.
- Can manage the fleet of carts at their venue only.
- Can create and manage FA users at their assigned venue.
- Can assign FA users to specific carts.
- Can view the dashboard and generate/export reports for their venue only.
- Has no visibility into other venues' data.

#### C — FA (Field Agent / User)
- Lowest operational role. Scoped to their assigned venue.
- Can only view carts that have been explicitly assigned to them by their Admin.
- Can perform: Check-In, Check-Out, and Report Issue on their assigned carts only.
- Cannot access the Dashboard, Fleet page, Maintenance page, or System Settings.

#### D — Observer (LCC — Logistics Command Center / VUM — Venue Management)
- Read-only cross-venue access.
- Can view all dashboards across all venues and sites.
- Can view all reports and fleet statuses across all venues.
- Can export reports from all venues.
- **Cannot** create, edit, or delete any data.

---

## 3. CART COLOR CODING (GLOBAL STANDARD)

Apply these color codes consistently across **all pages** (Fleet table, Handover, Maintenance, Dashboard badges, etc.):

| Cart Type | Color | Hex Code (suggested) |
|---|---|---|
| Cargo | 🔴 Red | `#E53935` |
| Accessibility | 🟡 Yellow | `#FDD835` |
| 6-Seater | 🟢 Green | `#43A047` |
| 4-Seater | 🔵 Blue | `#1E88E5` |

The **Type** column in every table must render as a colored badge/tag using the above colors — not plain text.

---

## 4. PAGE-BY-PAGE ENHANCEMENTS

---

### 4.1 Dashboard Page

**Accessible by:** Super Admin (all venues), Admin (own venue), Observer (all venues — read only)

#### Required Metrics & Analytics Widgets:
The dashboard must display the following widgets/cards, filterable by venue/site:

1. **Fleet Overview** — Total carts per venue, broken down by type (Cargo, Accessibility, 4-Seater, 6-Seater) with color-coded indicators.
2. **Cart Status Summary** — Count of carts by status: `Available`, `Assigned`, `Dispatched`, `Under Maintenance`.
3. **Active Users** — Number of currently active FA users per venue.
4. **Check-In / Check-Out Activity** — Timeline or count of check-ins and check-outs per day/shift.
5. **Open Issues Log** — Count of unresolved maintenance issues per venue.
6. **Issue Trend Chart** — Bar or line chart showing reported issues over time.
7. **VAP Carts Summary** — Count of carts flagged as requiring a Vehicle Access Pass (VAP), and their current status.

#### Export Functionality:
- Each widget/section must have an **Export** button to download data as CSV or PDF.
- A **"Export Full Report"** button at the top should export all metrics for the selected venue/date range.
- Filter options: by **venue/site**, by **date range**, by **cart type**, by **user**.

---

### 4.2 Fleet Page

**Accessible by:** Super Admin (all venues), Admin (own venue only)

#### Column & Field Updates:

| Change | Details |
|---|---|
| Remove column | `Key ID` — remove entirely |
| Rename column | `Unit Number` → `Car Number` (this value also serves as the Key Number) |
| Update column | `Type` — must render as a **color-coded badge** per Section 3 |
| Add column | `Assigned User` — displays the FA's full name linked to their profile + their phone number |
| Update column | `Status` — must reflect one of: `Available`, `Assigned`, `Dispatched`, `Under Maintenance` |
| Add field (Add Cart form) | `Requires VAP (Vehicle Access Pass)` — checkbox; if checked, flag the cart visually in the table |

#### Button Changes:
- **Remove** the existing non-functional "Vehicle" button.
- **Add** a `Bulk Import` button that accepts an Excel file following the same format as the reference Excel sheet (`0000`). The import must map columns correctly and apply color codes automatically based on cart type.

#### Filtering:
- Filter fleet table by: Cart Type, Status, Assigned User, VAP required (Yes/No).

---

### 4.3 Handover Page

**Accessible by:** Super Admin, Admin, FA (scoped to own assigned carts)

This page manages the full check-in and check-out lifecycle of carts.

#### Required Features:

1. **Cart Check-In:**
   - FA can check in carts individually (one by one) or select multiple carts and check them all in as a group (bulk action).
   - On load, FA only sees carts assigned to them by their Admin.

2. **Cart Check-Out:**
   - FA can check out carts individually or as a group after completing operations.

3. **Issue Reporting (from Handover page):**
   - During check-in or at any time during use, FA can flag a cart for a maintenance issue.
   - Required fields: Issue description (text), optional photo upload, optional additional notes.
   - Submitting an issue automatically creates a record in the **Maintenance Page**.

4. **Handover Record Requirements:**
   Each check-in / check-out / issue event must be logged with:
   - Timestamp (date + time)
   - FA full name
   - FA phone number
   - Cart number (`Car Number`)
   - Cart type (with color badge)
   - Venue/Site
   - Action performed (`Checked In`, `Checked Out`, `Issue Reported`)
   - Notes (if provided)

5. **Bulk Actions:**
   - Checkboxes next to each cart row.
   - "Select All" checkbox at the top.
   - Group action buttons: `Check In All`, `Check Out All`.

---

### 4.4 Maintenance Page

**Accessible by:** Super Admin (all venues), Admin (own venue), Observer (view/export only), FA (report only — cannot access this page directly)

#### Required Features:

1. **Report & Issue Button** — Keep existing button at the top of the page. Add an **Export Report** button directly next to it.

2. **Photo Visibility** — Any photos uploaded by FA users during issue reporting (from the Handover page or FA view) must be **visible and accessible** on this page within the relevant issue record.

3. **Issue History Log** — Full chronological history of all reported issues per cart must be displayed. Each record must show:
   - Cart Number (with color-coded type badge)
   - Reported by: FA full name + phone number
   - Timestamp of report
   - Issue description
   - Attached photo(s) (if any)
   - Status: `Open`, `In Progress`, `Resolved`
   - Resolution notes (if resolved)
   - Venue/Site

4. **Clear Attribution** — Every issue entry must clearly state **who reported it** (FA name and role).

5. **Export** — Export the full maintenance log or a filtered subset as CSV or PDF.

---

### 4.5 Users Page

**Accessible by:** Super Admin (all users), Admin (FA users at own venue only)

#### User Types (as defined in Section 2 — do not add any additional types):
- Super Admin
- Admin
- FA (User)
- Observer (LCC / VUM)

#### Required Fields per User Record:
- Full name
- Role (from the 4 types above)
- Assigned venue/site (for Admin and FA roles)
- Phone number
- Email
- Account status (`Active` / `Inactive`)

#### Admin Capabilities on This Page:
- Create new FA users (scoped to their own venue).
- Edit FA user details.
- Deactivate FA users.
- **Cannot** create or modify Super Admins, other Admins, or Observers.

#### Super Admin Capabilities:
- Full CRUD on all user types.
- Assign Admins to specific venues.
- Assign Observers with cross-venue read access.

---

### 4.6 System Settings Page

**Accessible by:** Super Admin only — this page must be completely hidden from all other roles.

#### Settings & Controls Available:

1. **Tournament / Event Branding:**
   - Upload tournament logo / header image.
   - Upload footer image or text.
   - Set tournament name (displayed on login page and system-wide header).
   - Preview branding before saving.

2. **Venue Management:**
   - Create new venues/sites.
   - Edit existing venue details (name, location).
   - Assign an Admin user to each venue.
   - Deactivate venues.

3. **Access Level Management:**
   - Create and manage Admin accounts.
   - Create and manage Observer accounts.
   - Assign roles and venue scopes.

4. **FA User Management (Global):**
   - View and manage all FA users across all venues.
   - Reassign FA users to different venues.

5. **System Reports:**
   - Access and export system-wide reports covering all venues, all users, and all fleet activity.

---

## 5. FA (USER) VIEW — MOBILE/WEB FLOW

This is the primary view for Field Agent users. It is a simplified, action-focused interface.

### 5.1 Login & Landing
- FA logs in and is taken directly to **their assigned cart list**.
- No access to Dashboard, Fleet, Maintenance, or Settings pages.

### 5.2 Cart List View
- Displays **only carts assigned to this FA** by their Admin.
- Each cart shows: Car Number, Type (color-coded badge), Status, and action buttons.
- Checkboxes on each row for bulk actions.
- "Select All" at the top.

### 5.3 Check-In Flow
1. FA selects one or more carts.
2. Taps **"Check In"** (individual) or **"Check In All Selected"** (bulk).
3. System records the check-in with timestamp, FA details, and cart details.
4. Cart status changes to `Dispatched`.

### 5.4 Check-Out Flow
1. FA selects one or more carts currently checked in.
2. Taps **"Check Out"** (individual) or **"Check Out All Selected"** (bulk).
3. Optional: Add notes before confirming.
4. System records the check-out with timestamp.
5. Cart status changes to `Available`.

### 5.5 Report Issue Flow
1. FA taps **"Report Issue"** on any cart in their list.
2. Form appears with:
   - Issue description (required, text field)
   - Photo attachment (optional, camera/gallery)
   - Additional notes (optional)
3. FA submits — record is created in the Maintenance log with full attribution.

---

## 6. DATA & TECHNICAL REQUIREMENTS

### 6.1 Cart Status States
Every cart must have exactly one of these statuses at all times:

| Status | Description |
|---|---|
| `Available` | In the fleet pool, not assigned to any FA |
| `Assigned` | Assigned to an FA but not yet checked in / dispatched |
| `Dispatched` | Checked in by FA and currently in active use |
| `Under Maintenance` | Flagged with an open maintenance issue |

### 6.2 Timestamping
All transactional records (check-in, check-out, issue reports, user creation, assignments) must store:
- ISO 8601 timestamp (date + time + timezone).
- The user who performed the action (name + role).

### 6.3 Bulk Import (Fleet Page)
- Accept `.xlsx` file format.
- Map columns from the reference Excel sheet (`0000`).
- Auto-detect and apply cart type color codes on import.
- Validate for required fields before committing import.
- Display import summary (X carts added, X skipped/errors) after completion.

### 6.4 Photo Uploads (Issue Reporting)
- Accepted formats: JPG, PNG, HEIC.
- Photos uploaded during issue reporting must be stored and linked to the specific maintenance issue record.
- Photos must be viewable from the **Maintenance Page** within the relevant issue.

---

## 7. UI/UX STANDARDS

1. **Color Codes** — Cart type color codes (Section 3) must be applied as badges/tags consistently across all pages. Never use plain text alone for cart type.
2. **Bulk Actions** — Every list/table that supports bulk actions must include checkboxes and a "Select All" option.
3. **Export Buttons** — Use a consistent icon and label (`⬇ Export`) placed at the top-right of any exportable table or page.
4. **Timestamps** — Always display in a human-readable format (e.g., `25 Aug 2025, 14:32`) alongside the ISO value in data exports.
5. **Venue Scope Enforcement** — Admins must never see data from other venues. Enforce this at both the UI and API/query level.
6. **Login Page** — Must display the tournament branding (name, header image, footer) as configured in System Settings.

---

## 8. REFERENCE FILES

| Reference | Description |
|---|---|
| `Drigram LOC 20250825 0000` | FA user list with detailed user records |
| Excel sheet `0000` | Master cart list with color-coded types — used as the bulk import template |

> **Note to development agent:** Cross-reference these files for correct user records and cart data before implementing user/fleet seeding or import logic.

---
