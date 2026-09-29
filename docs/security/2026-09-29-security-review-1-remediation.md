# GCMS — Security Review #1: Findings & Remediation Report

| | |
|---|---|
| **Date** | 2026-09-29 |
| **Source** | Cyberhive Consulting — "Urgent Critical - Broken Access Control & Missing Rate Limiting Vulnerabilities - GCMS Application" (email + evidence archive, 4 screenshots) |
| **Target tested** | Azure DEV — `app-gcms-fe-dev-qc-001-hvdabbawhjcnfhc0.qatarcentral-01.azurewebsites.net` |
| **Code baseline** | `main` @ `9ba0a74` (identical code to the deployed `1df63d8` images; `9ba0a74` is docs-only) — local Docker stack, GitHub `origin/main` and Azure confirmed in sync before changes |
| **Status** | Fixed in code, tested locally; **pending Azure deploy** |

---

## 1. Executive summary

Both reported **Critical** findings are confirmed and fixed at the root cause:

1. **Broken Access Control** — the pool-booking and car-request submission APIs were
   anonymous and trusted the requester name/email supplied in the request body, so anyone
   on the internet could file requests in any SC/LOC employee's name. They now require
   login, and the requester identity is taken from the signed-in account on the server.
   The booking page, instant booking and car-request pages have been moved off the login
   page and behind authentication, as requested.
2. **Missing Rate Limiting** — the only limiter was a global 100 requests/minute per IP,
   which (a) allows ~6,000 requests/hour and (b) is keyed on an IP address that is
   shared/spoofable behind Azure's proxy chain. Submissions are now capped at
   **20 per hour per user account** (unspoofable key), with input-size caps added.

The wider review found **one more instance of the same flaw class** (access requests could
be filed in anyone's name) and **one availability risk in the login limiter**; both are
fixed. Remaining lower-severity items are listed in §5 with recommendations.

---

## 2. Reported findings

### F1 — Broken Access Control: requests on behalf of any user — **Critical → Fixed**

**Evidence reviewed:** screenshot of the public `/book-pool` form submitted as
`k.hameed@sc.qa` without login ("6 Booking Requests Submitted!"); Burp request
`POST /api/v1/public/pool-booking-requests` → `201 Created` with no `Authorization` header.

**Root cause:**
- `POST /api/v1/public/pool-booking-requests` (+ `/instant`, `/recurring`) used
  `optionalAuth`; `POST /api/v1/public/requests` had no auth at all.
- The controllers validated `requesterName` / `requesterEmail` from the body and stored
  them as-is — the identity was entirely client-controlled.
- Supporting endpoints (cart availability, venue FA list, request tracking by
  number + email) were also anonymous, exposing fleet data and allowing enumeration of
  other people's requests.

**Fix:**

| Before (anonymous) | After |
|---|---|
| `POST /public/pool-booking-requests` | `POST /pool-booking-requests` — login required |
| `POST /public/pool-booking-requests/instant` | `POST /pool-booking-requests/instant` — login required |
| `POST /public/pool-booking-requests/recurring` | `POST /pool-booking-requests/recurring` — login required |
| `GET/POST /public/pool-booking-requests/venues/:id/*` | `GET/POST /pool-booking-requests/venues/:id/*` — login required |
| `POST /public/requests` | `POST /requests` — login required |
| `GET /public/requests/track?number&email` | `GET /requests/track?number` — login required, only the caller's own requests |

- `requesterName` / `requesterEmail` are **no longer accepted from the client**; the
  server stamps them from the authenticated account (`req.user`), plus `createdById`.
- Old `/public/*` submission URLs now return **401**.
- Frontend: `/book-pool`, `/request`, `/request/track` are wrapped in the same
  `ProtectedRoute` as the rest of the app (signed-out users are redirected to `/login`).
  The **Bookings**, **Submit a Request** and **Track a request** buttons were removed from
  the login page; signed-in users reach them from new sidebar items **"Book a Pool Cart"**
  and **"Request Dedicated Carts"**. Name/email fields are shown locked to the account.
- Kept public by design: the emailed status links `/book-pool/confirm/:token` and
  `/request/confirm/:token`. The token is 256-bit random (`crypto.randomBytes(32)`), so it
  acts as the credential for that single record.

**Files:** `backend/src/modules/pool-booking-requests/pool-booking-requests.{routes,controller}.ts`,
`backend/src/modules/requests/requests.{routes,controller}.ts`,
`backend/src/middleware/auth.middleware.ts`, `frontend/src/App.tsx`,
`frontend/src/pages/{LoginPage,PoolBookingRequestPage,PublicRequestPage,BookingsPage}.tsx`,
`frontend/src/components/layout/MainLayout.tsx`, `frontend/src/lib/api.ts`.

### F2 — Missing Rate Limiting — **Critical → Fixed**

**Evidence reviewed:** Burp Intruder runs of ~4,000+ requests each against
`/api/v1/public/pool-booking-requests` and `/api/v1/public/requests`; admin list shows
431 pages of `Pending` junk with SQL-injection fuzz payloads in `requesterName`.
Response headers show `X-RateLimit-Limit: 100`.

**Root cause:**
- One global limiter: 100 requests / 60 s per IP. Even working perfectly, that permits
  6,000 anonymous submissions per hour per IP.
- It is keyed on `req.ip` with `trust proxy = 1`. On Azure the chain is
  browser → Azure front end → nginx (frontend App Service) → Azure front end → Node, so
  `req.ip` most likely resolves to an internal proxy hop rather than the real client.
  That makes the limit either shared by all users or bypassable, and the leftmost
  `X-Forwarded-For` value is client-controlled.
- No size limits on free-text fields, cart quantities or the recurring-dates array.

**Fix:**
- New `submissionLimiter`: **20 submissions per hour per user account**, shared across
  pool bookings (single, instant, recurring) and car requests. It is keyed on the
  authenticated user id, which cannot be spoofed and doesn't depend on proxy headers.
  Excess returns `429 Too many submissions`. A recurring booking counts as one submission.
- Input caps (zod): IDs ≤ 64 chars, phone ≤ 32, purpose/notes/justification ≤ 1–2k chars,
  each cart count ≤ 200, recurring bookings ≤ 62 dates, instant duration ≤ 24 h, strict
  `YYYY-MM-DD` dates.
- Login limiter (`/auth/login`, `/auth/microsoft`, `/auth/forgot-password`,
  `/auth/reset-password`): re-keyed from IP to **IP + target email**. It still allows 5
  attempts per account per 15 min, but if every client shares one proxy IP, one noisy
  client can no longer lock everyone out of sign-in.

**Note on the SQL-injection payloads:** these were stored as literal text, not executed.
All DB access goes through Prisma's parameterised queries, and React escapes the values
on render. The rows are junk data to purge (§6), not a compromise.

**Files:** `backend/src/middleware/rateLimit.middleware.ts`, controllers above.

---

## 3. Additional findings from the full review (fixed)

### A1 — Access requests filed in anyone's name — **High → Fixed**
`POST /api/v1/public/access-requests` (the "request access" form shown after a Microsoft
sign-in for an unregistered user) trusted the `email` in the body — the same flaw class as
F1. Anyone could queue access requests for arbitrary SC/LOC addresses.
**Fix:** without an invitation token, the email now comes from the **verified Microsoft ID
token** (signature, tenant and audience checked by the existing `verifyMicrosoftToken`),
passed through from the SSO callback. The invitation-link path keeps its existing
server-side lock to the invite's email. Anything else returns 401.
Files: `access-requests.controller.ts`, `MicrosoftCallbackPage.tsx`, `AccessRequestPage.tsx`.

### A2 — Login limiter could lock out all users — **Medium → Fixed**
See F2: the IP-only key combined with the shared proxy IP meant 5 failed logins from anyone
could block password and SSO sign-in for everyone for 15 minutes. It is now keyed per
IP + account.

---

## 4. Verification

| Check | Result |
|---|---|
| Backend `tsc --noEmit` | clean |
| Frontend `tsc --noEmit` | clean |
| Backend test suite (vitest) | **97/97 pass** (82 existing + 15 new) |
| New regression test `booking-access.test.ts` | 12 endpoints (old + new) → **401** anonymously; spoofed `requesterName/Email` ignored for bookings and car requests; 20-per-hour cap → **429** |
| Local Docker E2E (anonymous curl) | old and new submission/availability endpoints → **401** |
| Local Docker E2E (authenticated, spoofed body `k.hameed@sc.qa`) | booking **201**, stored as the real account (`fa@gcms.com`), `createdById` correct; test row deleted |
| Browser, signed out | `/book-pool` and `/request` → redirected to `/login`; login page shows only Sign In / SSO / Forgot Password |
| Browser, signed in | sidebar shows "Book a Pool Cart" and "Request Dedicated Carts"; pages load |
| Azure baseline (pre-deploy) | `health/ready` ok; anonymous `POST /public/requests` → 400 (body processed, i.e. still exposed — expected until deploy) |

**Post-deploy re-test for the security team:** replay the original Burp requests. They
should return `401` (old URLs). Authenticated floods should return `429` after 20
submissions per account per hour.

---

## 5. Residual risks & recommendations (not changed in this round)

| # | Item | Severity | Recommendation |
|---|---|---|---|
| R1 | Global limiter's real-client IP behind ARR→nginx→ARR is unverified | Medium | After deploy, log `req.ip` / `X-Forwarded-For` once to confirm the hop count; set `trust proxy` accordingly, or rely on Azure Front Door / WAF rate rules for the endpoints that must stay anonymous (login, access-request, token links). |
| R2 | JWT accepted as `?token=` query param (used for opening maintenance reports / documents in a new tab) | Medium | Tokens in URLs can leak to logs and browser history. Replace with a short-lived, single-purpose download token. |
| R3 | Audit log records the leftmost `X-Forwarded-For` value, which the client controls | Low | Record the proxy-derived client IP once R1 is resolved. |
| R4 | `/api/v1/storage/:bucket/:file` (signatures and photos) is unauthenticated | Low | Filenames carry a 64-bit random token (fixed 2026-09-19), so they aren't practically enumerable. Optionally move to signed URLs. |
| R5 | Access tokens stored in `localStorage` | Low | Standard SPA trade-off; mitigated by the strict CSP (`script-src 'self'`). Revisit if any third-party script is ever added. |
| R6 | Public read endpoints `/public/stadiums`, `/public/departments`, `/settings/public` | Info | Needed by the login and access-request pages; they return names/codes only. Accepted. |

---

## 6. Deployment & operational actions

1. **Deploy:** rebuild both images and restart both App Services. There is no schema
   change and no `prisma db push`. Exact commands are in
   `docs/deployment/GCMS-Azure-Deployment-Runbook.md` → "2026-09-29 — Security review #1
   remediation".
2. **Data clean-up (DEV DB):** purge the ~4,300 pentest junk rows (`PoolBookingRequest` /
   `CarRequest`, status `Pending`, created 2026-09-29, fuzz payloads in the name field).
   Also purge the 2,050 junk car requests previously logged as ERR-004 in the 2026-09-27
   test pass. Run from the backend SSH console after review, and back up first.
3. **User communication:** booking and car-request forms now need a GCMS login.
   Requesters who previously used the public form without an account must request access
   (Microsoft SSO) or be invited.
4. **Re-test request** to Cyberhive once deployed (see §4).
