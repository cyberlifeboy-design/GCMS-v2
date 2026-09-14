# User Onboarding & Access Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three ways to get a GCMS account (self-service SSO request, invitation link, admin-created) that converge on one venue-scoped approval workflow, plus real Microsoft Entra ID SSO login.

**Architecture:** New Prisma models `AccessRequest` and `Invitation`, plus `User.authProvider`/`microsoftOid`/`mustChangePassword`. New backend modules `access-requests` and `invitations` mirror the existing `modules/requests` (CarRequest) pattern exactly — same public/admin route split, same Admin-scoped-to-own-venue RBAC, same best-effort email notifications. Microsoft SSO is a public-client MSAL flow on the frontend (no client secret) verified on the backend via Microsoft's JWKS endpoint.

**Tech Stack:** Node/Express/Prisma/MySQL (backend), React/Vite/Zustand/axios (frontend), Vitest for tests, `@azure/msal-browser` for SSO, `jwks-rsa` + `jsonwebtoken` for token verification.

**Spec:** `docs/superpowers/specs/2026-09-14-user-onboarding-access-control-design.md`

## Global Constraints

- MySQL provider (`backend/prisma/schema.prisma`) — no Postgres-only features (already bit us once with `mode: 'insensitive'`).
- Admin role is always scoped to `req.user.stadiumId`; SuperAdmin is unscoped — every new list/approve/reject endpoint must follow this, copied verbatim from `requests.controller.ts`.
- All outbound email is best-effort: wrap in try/catch, log on failure, never let an email failure fail the underlying state change (matches `requestsService`/`forgotPassword`).
- Approved SSO/invite accounts always get `role: "FA"` (per approved design — no role picker in this pass).
- `authProvider: "microsoft"` accounts get a random, never-communicated password hash; local password login must reject them with a clear message.
- New public endpoints must re-validate `isActive` server-side for venue/department — never trust a stale client-side dropdown.
- No secrets committed: `MSAL_TENANT_ID`/`MSAL_CLIENT_ID` (and their `VITE_` frontend counterparts) are config values (not secret — this is a public client flow), but still go through `.env.example` placeholders, never real values.
- Every commit in this plan goes on `feature/pool-booking-system` — do not touch the unrelated pending `backend/Dockerfile`/`sshd_config`/`init.sh`/`.dockerignore` changes already sitting uncommitted in this worktree (the user is committing that batch separately).

---

### Task 1: Schema — `User` fields, `AccessRequest`, `Invitation` models

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Produces: `AccessRequest` model (`id, requestNumber, name, email, phone, stadiumId, departmentId, source, invitationId, requestToken, status, reviewedById, reviewedAt, reviewNotes, createdUserId, createdAt, updatedAt`), `Invitation` model (`id, email, stadiumId, departmentId, invitedById, token, status, expiresAt, createdAt`), `User.authProvider` (`"local"|"microsoft"`), `User.microsoftOid`, `User.mustChangePassword` — every later task's Prisma calls rely on these exact field names.

- [ ] **Step 1: Add the new `User` fields**

In `backend/prisma/schema.prisma`, inside `model User { ... }`, add after the `isBlocked` field (around line 106):

```prisma
  authProvider        String          @default("local") // "local" | "microsoft"
  microsoftOid        String?         @unique
  mustChangePassword  Boolean         @default(false)
```

- [ ] **Step 2: Add `User` relations for the new models**

Still inside `model User { ... }`, add near the other back-relations (after `reviewedRequests`, around line 128):

```prisma
  reviewedAccessRequests AccessRequest[] @relation("AccessRequestReviewer")
  sentInvitations        Invitation[]    @relation("InvitationInvitedBy")
```

- [ ] **Step 3: Add relations on `Stadium` and `Department`**

In `model Stadium { ... }`, add next to `carRequests` (around line 24):

```prisma
  accessRequests AccessRequest[]
  invitations    Invitation[]
```

In `model Department { ... }`, add next to `carRequests` (around line 45):

```prisma
  accessRequests AccessRequest[]
  invitations    Invitation[]
```

- [ ] **Step 4: Add the `AccessRequest` model**

Add after the `CarRequest` model (after its closing `}` around line 371):

```prisma
// Source: "sso" (self-service, email verified via Microsoft) | "invite" (email locked from an Invitation)
// Status: Pending, Approved, Rejected
model AccessRequest {
  id             String    @id @default(cuid())
  requestNumber  Int       @unique @default(autoincrement())

  name           String
  email          String
  phone          String?

  stadiumId      String
  stadium        Stadium    @relation(fields: [stadiumId], references: [id])
  departmentId   String
  department     Department @relation(fields: [departmentId], references: [id])

  source         String     // "sso" | "invite"
  invitationId   String?
  invitation     Invitation? @relation(fields: [invitationId], references: [id])

  requestToken   String     @unique
  status         String     @default("Pending") // Pending, Approved, Rejected
  reviewedById   String?
  reviewedBy     User?      @relation("AccessRequestReviewer", fields: [reviewedById], references: [id])
  reviewedAt     DateTime?
  reviewNotes    String?    @db.Text

  createdUserId  String?    // set once approval creates the User

  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  @@index([status])
  @@index([stadiumId])
  @@index([departmentId])
  @@index([requestToken])
  @@index([email])
}
```

- [ ] **Step 5: Add the `Invitation` model**

Add right after the `AccessRequest` model:

```prisma
// Status: Pending, Used, Revoked, Expired (Expired is computed at read time from expiresAt, not written)
model Invitation {
  id             String    @id @default(cuid())
  email          String
  stadiumId      String?
  stadium        Stadium?    @relation(fields: [stadiumId], references: [id])
  departmentId   String?
  department     Department? @relation(fields: [departmentId], references: [id])
  invitedById    String
  invitedBy      User        @relation("InvitationInvitedBy", fields: [invitedById], references: [id])
  token          String      @unique
  status         String      @default("Pending") // Pending, Used, Revoked
  expiresAt      DateTime
  accessRequests AccessRequest[]
  createdAt      DateTime    @default(now())

  @@index([status])
  @@index([email])
  @@index([token])
}
```

- [ ] **Step 6: Add the new `Notification.type` values as a comment (no schema change — it's already a free-text `String`)**

In `model Notification { ... }`, update the type comment on the `type` field (around line 491) from:

```prisma
  type         String    // IssueReported, CheckIn, CheckOut, CarRequest, AssignmentChange, RequestApproved, RequestRejected
```

to:

```prisma
  type         String    // IssueReported, CheckIn, CheckOut, CarRequest, AssignmentChange, RequestApproved, RequestRejected, AccessRequest, AccessRequestApproved, AccessRequestRejected
```

- [ ] **Step 7: Validate, generate, and push the schema against the local dev database**

Run from `backend/`:

```bash
npx prisma format
npx prisma validate
npx prisma generate
```

Expected: all three succeed with no errors. Then, with the local Docker Desktop MySQL stack running (`docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.dev-live.yml up -d mysql`), run:

```bash
npx prisma db push
```

Expected: output confirms the new `AccessRequest`/`Invitation` tables and the three new `User` columns were created, no data loss warnings on existing tables.

- [ ] **Step 8: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(schema): add AccessRequest, Invitation models and User SSO/force-password fields"
```

---

### Task 2: Microsoft ID token verification helper

**Files:**
- Create: `backend/src/services/microsoft-auth.service.ts`
- Test: `backend/src/services/microsoft-auth.service.test.ts`
- Modify: `backend/package.json` (add `jwks-rsa` dependency)

**Interfaces:**
- Produces: `verifyMicrosoftToken(idToken: string): Promise<MicrosoftIdentity>` where `MicrosoftIdentity = { email: string; name: string; oid: string }`, and `MicrosoftAuthError` (thrown with `.message` one of `"MICROSOFT_SSO_NOT_CONFIGURED"`, `"INVALID_MICROSOFT_TOKEN"`) — Task 3's auth service calls this exact function.

- [ ] **Step 1: Add the `jwks-rsa` dependency**

In `backend/package.json`, add to `"dependencies"` (alphabetical, near `jsonwebtoken`):

```json
    "jwks-rsa": "^3.1.0",
```

Run from `backend/`:

```bash
npm install
```

- [ ] **Step 2: Write the failing test**

Create `backend/src/services/microsoft-auth.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

const getSigningKeyMock = vi.fn();
vi.mock('jwks-rsa', () => ({
  default: () => ({ getSigningKey: getSigningKeyMock }),
}));

vi.mock('jsonwebtoken', async () => {
  const actual = await vi.importActual<typeof import('jsonwebtoken')>('jsonwebtoken');
  return { ...actual, default: { ...actual, verify: vi.fn() } };
});

import { verifyMicrosoftToken, MicrosoftAuthError } from './microsoft-auth.service';

describe('verifyMicrosoftToken', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.MSAL_TENANT_ID = 'tenant-123';
    process.env.MSAL_CLIENT_ID = 'client-456';
  });

  it('throws MICROSOFT_SSO_NOT_CONFIGURED when env vars are missing', async () => {
    delete process.env.MSAL_TENANT_ID;
    await expect(verifyMicrosoftToken('any-token')).rejects.toThrow('MICROSOFT_SSO_NOT_CONFIGURED');
    await expect(verifyMicrosoftToken('any-token')).rejects.toBeInstanceOf(MicrosoftAuthError);
  });

  it('returns the identity from a valid decoded token', async () => {
    (jwt.verify as any).mockImplementation((_token: string, _getKey: any, _opts: any, cb: any) => {
      cb(null, { preferred_username: 'Jane.Doe@sc.qa', name: 'Jane Doe', oid: 'oid-abc' });
    });

    const identity = await verifyMicrosoftToken('valid-token');
    expect(identity).toEqual({ email: 'jane.doe@sc.qa', name: 'Jane Doe', oid: 'oid-abc' });
  });

  it('throws INVALID_MICROSOFT_TOKEN when the payload has no email or oid', async () => {
    (jwt.verify as any).mockImplementation((_token: string, _getKey: any, _opts: any, cb: any) => {
      cb(null, { name: 'No Email User' });
    });

    await expect(verifyMicrosoftToken('bad-token')).rejects.toThrow('INVALID_MICROSOFT_TOKEN');
  });

  it('rejects when jwt.verify calls back with an error', async () => {
    (jwt.verify as any).mockImplementation((_token: string, _getKey: any, _opts: any, cb: any) => {
      cb(new Error('signature invalid'));
    });

    await expect(verifyMicrosoftToken('tampered-token')).rejects.toThrow('signature invalid');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/microsoft-auth.service.test.ts`
Expected: FAIL — `Cannot find module './microsoft-auth.service'`

- [ ] **Step 3: Write the implementation**

Create `backend/src/services/microsoft-auth.service.ts`:

```typescript
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

export interface MicrosoftIdentity {
    email: string;
    name: string;
    oid: string;
}

export class MicrosoftAuthError extends Error {}

function buildJwksClient(tenantId: string) {
    return jwksClient({
        jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
        cache: true,
        cacheMaxAge: 24 * 60 * 60 * 1000,
        rateLimit: true,
    });
}

/**
 * Verifies a Microsoft Entra ID (Azure AD) ID token from the frontend's public-client
 * MSAL login. No client secret is used or needed — signature is checked against
 * Microsoft's published JWKS for our tenant, scoped to our own Client ID as audience.
 */
export async function verifyMicrosoftToken(idToken: string): Promise<MicrosoftIdentity> {
    const tenantId = process.env.MSAL_TENANT_ID;
    const clientId = process.env.MSAL_CLIENT_ID;
    if (!tenantId || !clientId) {
        throw new MicrosoftAuthError('MICROSOFT_SSO_NOT_CONFIGURED');
    }

    const client = buildJwksClient(tenantId);

    const getKey: jwt.GetPublicKeyOrSecret = (header, callback) => {
        client.getSigningKey(header.kid, (err, key) => {
            if (err || !key) {
                callback(err || new Error('Signing key not found'));
                return;
            }
            callback(null, key.getPublicKey());
        });
    };

    const payload = await new Promise<jwt.JwtPayload>((resolve, reject) => {
        jwt.verify(
            idToken,
            getKey,
            {
                audience: clientId,
                issuer: [
                    `https://login.microsoftonline.com/${tenantId}/v2.0`,
                    `https://sts.windows.net/${tenantId}/`,
                ],
            },
            (err, decoded) => {
                if (err || !decoded || typeof decoded === 'string') {
                    reject(err || new Error('Invalid token payload'));
                    return;
                }
                resolve(decoded);
            },
        );
    });

    const email = (payload.preferred_username || payload.email) as string | undefined;
    const oid = payload.oid as string | undefined;
    const name = (payload.name as string | undefined) || email || 'Unknown';

    if (!email || !oid) {
        throw new MicrosoftAuthError('INVALID_MICROSOFT_TOKEN');
    }

    return { email: email.toLowerCase(), name, oid };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/microsoft-auth.service.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/services/microsoft-auth.service.ts backend/src/services/microsoft-auth.service.test.ts
git commit -m "feat(auth): Microsoft Entra ID token verification helper (JWKS, no client secret)"
```

---

### Task 3: Invitation validity helper + `invitations` backend module

**Files:**
- Create: `backend/src/modules/invitations/invitation-validity.ts`
- Test: `backend/src/modules/invitations/invitation-validity.test.ts`
- Create: `backend/src/modules/invitations/invitations.service.ts`
- Create: `backend/src/modules/invitations/invitations.controller.ts`
- Create: `backend/src/modules/invitations/invitations.routes.ts`

**Interfaces:**
- Consumes: `prisma` from `../../config/database`, `emailService` from `../../services/email.service` (`.send({to, subject, text, html})`), `AuthRequest` from `../../middleware/auth.middleware`, `requireRole`/`authenticate` middleware.
- Produces: `checkInvitationValidity(invitation, now)`, `invitationsService.{create, getAll, getByToken, validateForSubmission, markUsed, revoke}`, `InvitationsController.{create, getAll, getByTokenPublic, revoke}`, default-exported `invitations.routes.ts` router mounted at `/api/v1` — Task 5's access-requests module calls `invitationsService.validateForSubmission`/`.markUsed`.

- [ ] **Step 1: Write the failing test for the validity helper**

Create `backend/src/modules/invitations/invitation-validity.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { checkInvitationValidity } from './invitation-validity';

const at = (s: string) => new Date(s);
const inv = (status: string, expiresAt: string) => ({ status, expiresAt: at(expiresAt) });

describe('checkInvitationValidity', () => {
  it('is valid when Pending and not yet expired', () => {
    expect(checkInvitationValidity(inv('Pending', '2026-09-20T00:00:00'), at('2026-09-14T00:00:00')).valid).toBe(true);
  });

  it('is invalid when already Used', () => {
    const r = checkInvitationValidity(inv('Used', '2026-09-20T00:00:00'), at('2026-09-14T00:00:00'));
    expect(r).toEqual({ valid: false, reason: 'INVITATION_ALREADY_USED' });
  });

  it('is invalid when Revoked', () => {
    const r = checkInvitationValidity(inv('Revoked', '2026-09-20T00:00:00'), at('2026-09-14T00:00:00'));
    expect(r).toEqual({ valid: false, reason: 'INVITATION_REVOKED' });
  });

  it('is invalid once past expiresAt, even if still Pending', () => {
    const r = checkInvitationValidity(inv('Pending', '2026-09-10T00:00:00'), at('2026-09-14T00:00:00'));
    expect(r).toEqual({ valid: false, reason: 'INVITATION_EXPIRED' });
  });

  it('treats the exact expiry instant as still valid', () => {
    const r = checkInvitationValidity(inv('Pending', '2026-09-14T00:00:00'), at('2026-09-14T00:00:00'));
    expect(r.valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/modules/invitations/invitation-validity.test.ts`
Expected: FAIL — `Cannot find module './invitation-validity'`

- [ ] **Step 3: Implement the validity helper**

Create `backend/src/modules/invitations/invitation-validity.ts`:

```typescript
export interface InvitationForValidity {
    status: string;
    expiresAt: Date;
}

export type InvitationInvalidReason = 'INVITATION_ALREADY_USED' | 'INVITATION_REVOKED' | 'INVITATION_EXPIRED';

export interface InvitationValidity {
    valid: boolean;
    reason?: InvitationInvalidReason;
}

export function checkInvitationValidity(invitation: InvitationForValidity, now: Date): InvitationValidity {
    if (invitation.status === 'Used') return { valid: false, reason: 'INVITATION_ALREADY_USED' };
    if (invitation.status === 'Revoked') return { valid: false, reason: 'INVITATION_REVOKED' };
    if (invitation.expiresAt.getTime() < now.getTime()) return { valid: false, reason: 'INVITATION_EXPIRED' };
    return { valid: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/modules/invitations/invitation-validity.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Implement `invitations.service.ts`**

Create `backend/src/modules/invitations/invitations.service.ts`:

```typescript
import { prisma } from '../../config/database';
import crypto from 'crypto';
import { emailService } from '../../services/email.service';
import { checkInvitationValidity } from './invitation-validity';

export interface CreateInvitationData {
    email: string;
    stadiumId?: string;
    departmentId?: string;
    invitedById: string;
}

export class InvitationsService {
    async create(data: CreateInvitationData) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        const invitation = await prisma.invitation.create({
            data: {
                email: data.email,
                stadiumId: data.stadiumId,
                departmentId: data.departmentId,
                invitedById: data.invitedById,
                token,
                status: 'Pending',
                expiresAt,
            },
        });

        const link = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/access-request?invite=${token}`;
        try {
            await emailService.send({
                to: data.email,
                subject: "You're invited to GCMS",
                text: `Hello,\n\nYou've been invited to request access to GCMS. Click the link below to get started:\n\n${link}\n\nThis link expires in 7 days.\n\nThank you,\nGCMS`,
                html: `<h2>You've been invited to GCMS</h2><p><a href="${link}">${link}</a></p><p>This link expires in 7 days.</p>`,
            });
        } catch (e) {
            console.error('Invitation email failed:', e);
        }

        return invitation;
    }

    async getAll(filters: { stadiumId?: string; status?: string }) {
        const where: any = {};
        if (filters.stadiumId) where.stadiumId = filters.stadiumId;
        if (filters.status) where.status = filters.status;
        return prisma.invitation.findMany({
            where,
            include: {
                invitedBy: { select: { id: true, name: true } },
                stadium: { select: { id: true, name: true } },
                department: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getByToken(token: string) {
        return prisma.invitation.findUnique({
            where: { token },
            include: {
                stadium: { select: { id: true, name: true } },
                department: { select: { id: true, name: true } },
            },
        });
    }

    /** Validates a token for the public access-request form; throws with a machine-readable reason. */
    async validateForSubmission(token: string) {
        const invitation = await prisma.invitation.findUnique({ where: { token } });
        if (!invitation) throw new Error('INVITATION_NOT_FOUND');

        const validity = checkInvitationValidity(invitation, new Date());
        if (!validity.valid) throw new Error(validity.reason);

        return invitation;
    }

    async markUsed(id: string) {
        return prisma.invitation.update({ where: { id }, data: { status: 'Used' } });
    }

    async revoke(id: string) {
        return prisma.invitation.update({ where: { id }, data: { status: 'Revoked' } });
    }
}

export const invitationsService = new InvitationsService();
```

- [ ] **Step 6: Implement `invitations.controller.ts`**

Create `backend/src/modules/invitations/invitations.controller.ts`:

```typescript
import { Response, Request } from 'express';
import { z } from 'zod';
import { invitationsService } from './invitations.service';
import { checkInvitationValidity } from './invitation-validity';
import { AuthRequest } from '../../middleware/auth.middleware';

const createInvitationSchema = z.object({
    email: z.string().email('Valid email is required'),
    stadiumId: z.string().optional(),
    departmentId: z.string().optional(),
});

export function invitationErrorMessage(code: string): string {
    switch (code) {
        case 'INVITATION_NOT_FOUND': return 'This invitation link is invalid.';
        case 'INVITATION_ALREADY_USED': return 'This invitation link has already been used.';
        case 'INVITATION_REVOKED': return 'This invitation has been revoked.';
        case 'INVITATION_EXPIRED': return 'This invitation link has expired.';
        default: return 'This invitation link is invalid.';
    }
}

export class InvitationsController {
    static async create(req: AuthRequest, res: Response) {
        try {
            const data = createInvitationSchema.parse(req.body);

            if (req.user?.role === 'Admin' && data.stadiumId && data.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'You can only invite users to your own venue' });
                return;
            }

            const invitation = await invitationsService.create({ ...data, invitedById: req.user!.userId });
            res.status(201).json({ message: 'Invitation sent', data: invitation });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                console.error('Create invitation error:', error);
                res.status(500).json({ error: 'Failed to create invitation' });
            }
        }
    }

    static async getAll(req: AuthRequest, res: Response) {
        try {
            const stadiumId = req.user?.role === 'Admin' ? req.user.stadiumId : (req.query.stadiumId as string | undefined);
            const invitations = await invitationsService.getAll({ stadiumId, status: req.query.status as string | undefined });
            res.status(200).json({ data: invitations });
        } catch (error) {
            console.error('Get invitations error:', error);
            res.status(500).json({ error: 'Failed to fetch invitations' });
        }
    }

    static async getByTokenPublic(req: Request, res: Response) {
        try {
            const token = req.params.token as string;
            const invitation = await invitationsService.getByToken(token);
            if (!invitation) {
                res.status(404).json({ error: invitationErrorMessage('INVITATION_NOT_FOUND') });
                return;
            }

            const validity = checkInvitationValidity(invitation, new Date());
            if (!validity.valid) {
                res.status(400).json({ error: invitationErrorMessage(validity.reason || '') });
                return;
            }

            res.status(200).json({ data: invitation });
        } catch (error) {
            console.error('Get invitation by token error:', error);
            res.status(500).json({ error: 'Failed to fetch invitation' });
        }
    }

    static async revoke(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            await invitationsService.revoke(id);
            res.status(200).json({ message: 'Invitation revoked' });
        } catch (error) {
            console.error('Revoke invitation error:', error);
            res.status(500).json({ error: 'Failed to revoke invitation' });
        }
    }
}
```

- [ ] **Step 7: Implement `invitations.routes.ts`**

Create `backend/src/modules/invitations/invitations.routes.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { InvitationsController } from './invitations.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

// GET /api/v1/public/invitations/:token - validate an invite link before showing the request form
router.get('/public/invitations/:token', (req: Request, res: Response) => InvitationsController.getByTokenPublic(req, res));

router.use(authenticate);

// POST /api/v1/invitations - invite a user by email (Admin scoped to own venue in the controller)
router.post('/invitations', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => InvitationsController.create(req as any, res));

// GET /api/v1/invitations - list invitations
router.get('/invitations', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => InvitationsController.getAll(req as any, res));

// POST /api/v1/invitations/:id/revoke - revoke a pending invitation
router.post('/invitations/:id/revoke', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => InvitationsController.revoke(req as any, res));

export default router;
```

- [ ] **Step 8: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no new errors from the `invitations` module (this module isn't registered in `app.ts` yet — that's Task 6 — so it compiles standalone but isn't reachable yet).

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/invitations
git commit -m "feat(invitations): invitation validity helper + invitations backend module"
```

---

### Task 4: `access-requests` backend module

**Files:**
- Create: `backend/src/modules/access-requests/access-requests.service.ts`
- Create: `backend/src/modules/access-requests/access-requests.controller.ts`
- Create: `backend/src/modules/access-requests/access-requests.routes.ts`

**Interfaces:**
- Consumes: `prisma`, `notificationService.createForRoles(data, roles, stadiumId?)` from `../notifications/notification.service`, `emailService.send(...)`, `invitationsService.validateForSubmission(token)`/`.markUsed(id)` from Task 3, `bcrypt`, `crypto`.
- Produces: `accessRequestsService.{createRequest, getByToken, getById, getAll, approveRequest, rejectRequest, deleteRequest}`, `AccessRequestsController.{createPublic, getByTokenPublic, getAll, getById, approve, reject, delete}`, default-exported router mounted at `/api/v1`.

- [ ] **Step 1: Implement `access-requests.service.ts`**

Create `backend/src/modules/access-requests/access-requests.service.ts`:

```typescript
import { prisma } from '../../config/database';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { notificationService } from '../notifications/notification.service';
import { emailService } from '../../services/email.service';

export interface CreateAccessRequestData {
    name: string;
    email: string;
    phone?: string;
    stadiumId: string;
    departmentId: string;
    source: 'sso' | 'invite';
    invitationId?: string;
}

export interface AccessRequestFilters {
    status?: string;
    stadiumId?: string;
    departmentId?: string;
}

export class AccessRequestsService {
    generateRequestToken(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    private async notifyRequester(args: {
        email: string; name: string; status: 'Approved' | 'Rejected'; reviewNotes?: string;
    }) {
        const subject = `Your GCMS access request has been ${args.status.toLowerCase()}`;
        const body = args.status === 'Approved'
            ? `Hello ${args.name},\n\nYour account access request has been approved. You can now sign in using your SC/LOC Microsoft account from the GCMS login page.\n${args.reviewNotes ? `\nNotes: ${args.reviewNotes}\n` : ''}\nThank you,\nGCMS`
            : `Hello ${args.name},\n\nYour account access request has been rejected.\n${args.reviewNotes ? `\nReason: ${args.reviewNotes}\n` : ''}\nThank you,\nGCMS`;
        try {
            await emailService.send({ to: args.email, subject, text: body });
        } catch (e) {
            console.error('Access request requester email failed:', e);
        }
    }

    /** Re-validates venue/department are active — never trust a client-supplied id blindly. */
    private async assertVenueAndDepartmentActive(stadiumId: string, departmentId: string) {
        const [stadium, department] = await Promise.all([
            prisma.stadium.findUnique({ where: { id: stadiumId } }),
            prisma.department.findUnique({ where: { id: departmentId } }),
        ]);
        if (!stadium || !stadium.isActive) throw new Error('VENUE_NOT_ACTIVE');
        if (!department || !department.isActive || department.stadiumId !== stadiumId) throw new Error('DEPARTMENT_NOT_ACTIVE');
    }

    async createRequest(data: CreateAccessRequestData) {
        await this.assertVenueAndDepartmentActive(data.stadiumId, data.departmentId);

        const existingPending = await prisma.accessRequest.findFirst({
            where: { email: data.email, status: 'Pending' },
            include: {
                stadium: { select: { id: true, name: true } },
                department: { select: { id: true, name: true, code: true } },
            },
        });
        if (existingPending) return existingPending;

        const requestToken = this.generateRequestToken();
        const request = await prisma.accessRequest.create({
            data: {
                name: data.name,
                email: data.email,
                phone: data.phone,
                stadiumId: data.stadiumId,
                departmentId: data.departmentId,
                source: data.source,
                invitationId: data.invitationId,
                requestToken,
                status: 'Pending',
            },
            include: {
                stadium: { select: { id: true, name: true } },
                department: { select: { id: true, name: true, code: true } },
            },
        });

        await notificationService.createForRoles(
            {
                type: 'AccessRequest',
                title: 'New Account Access Request',
                message: `${data.name} requested access to ${request.department?.name} at ${request.stadium?.name}`,
                entityType: 'AccessRequest',
                entityId: request.id,
            },
            ['SuperAdmin', 'Admin'],
            data.stadiumId,
        );

        return request;
    }

    async getByToken(token: string) {
        return prisma.accessRequest.findUnique({
            where: { requestToken: token },
            include: {
                stadium: { select: { id: true, name: true } },
                department: { select: { id: true, name: true, code: true } },
            },
        });
    }

    async getById(id: string) {
        return prisma.accessRequest.findUnique({
            where: { id },
            include: {
                stadium: { select: { id: true, name: true } },
                department: { select: { id: true, name: true, code: true } },
                reviewedBy: { select: { id: true, name: true } },
            },
        });
    }

    async getAll(filters: AccessRequestFilters, page?: number, limit?: number) {
        const where: any = {};
        if (filters.status) where.status = filters.status;
        if (filters.stadiumId) where.stadiumId = filters.stadiumId;
        if (filters.departmentId) where.departmentId = filters.departmentId;

        const [data, total] = await Promise.all([
            prisma.accessRequest.findMany({
                where,
                include: {
                    stadium: { select: { id: true, name: true } },
                    department: { select: { id: true, name: true, code: true } },
                    reviewedBy: { select: { id: true, name: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: page && limit ? (page - 1) * limit : undefined,
                take: limit,
            }),
            prisma.accessRequest.count({ where }),
        ]);

        return { data, total };
    }

    /** Approves the request, creating the User if one doesn't already exist for that email. */
    async approveRequest(id: string, reviewedById: string, reviewNotes?: string) {
        const existing = await prisma.accessRequest.findUnique({ where: { id } });
        if (!existing) throw new Error('Request not found');

        let user = await prisma.user.findUnique({ where: { email: existing.email } });
        if (!user) {
            const randomPassword = crypto.randomBytes(32).toString('hex');
            const passwordHash = await bcrypt.hash(randomPassword, 10);
            user = await prisma.user.create({
                data: {
                    name: existing.name,
                    email: existing.email,
                    phone: existing.phone,
                    passwordHash,
                    role: 'FA',
                    authProvider: 'microsoft',
                    stadiumId: existing.stadiumId,
                    departmentId: existing.departmentId,
                    exportPreferences: JSON.stringify({}),
                    grantedPages: JSON.stringify([]),
                },
            });
        }

        const request = await prisma.accessRequest.update({
            where: { id },
            data: {
                status: 'Approved',
                reviewedById,
                reviewedAt: new Date(),
                reviewNotes,
                createdUserId: user.id,
            },
            include: {
                stadium: { select: { name: true, id: true } },
                department: { select: { name: true } },
                reviewedBy: { select: { name: true } },
            },
        });

        await notificationService.createForRoles(
            {
                type: 'AccessRequestApproved',
                title: 'Account Access Request Approved',
                message: `${request.name} (${request.department?.name}) approved`,
                entityType: 'AccessRequest',
                entityId: id,
            },
            ['SuperAdmin', 'Admin'],
            request.stadiumId || undefined,
        );

        await this.notifyRequester({ email: request.email, name: request.name, status: 'Approved', reviewNotes });

        return request;
    }

    async rejectRequest(id: string, reviewedById: string, reviewNotes?: string) {
        const request = await prisma.accessRequest.update({
            where: { id },
            data: { status: 'Rejected', reviewedById, reviewedAt: new Date(), reviewNotes },
            include: {
                stadium: { select: { name: true, id: true } },
                department: { select: { name: true } },
                reviewedBy: { select: { name: true } },
            },
        });

        await notificationService.createForRoles(
            {
                type: 'AccessRequestRejected',
                title: 'Account Access Request Rejected',
                message: `${request.name} (${request.department?.name}) rejected`,
                entityType: 'AccessRequest',
                entityId: id,
            },
            ['SuperAdmin', 'Admin'],
            request.stadiumId || undefined,
        );

        await this.notifyRequester({ email: request.email, name: request.name, status: 'Rejected', reviewNotes });

        return request;
    }

    async deleteRequest(id: string) {
        return prisma.accessRequest.delete({ where: { id } });
    }
}

export const accessRequestsService = new AccessRequestsService();
```

- [ ] **Step 2: Implement `access-requests.controller.ts`**

Create `backend/src/modules/access-requests/access-requests.controller.ts`:

```typescript
import { Response, Request } from 'express';
import { z } from 'zod';
import { accessRequestsService } from './access-requests.service';
import { invitationsService } from '../invitations/invitations.service';
import { invitationErrorMessage } from '../invitations/invitations.controller';
import { AuthRequest } from '../../middleware/auth.middleware';

const createAccessRequestSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Valid email is required'),
    phone: z.string().optional(),
    stadiumId: z.string().min(1, 'Venue is required'),
    departmentId: z.string().min(1, 'Department is required'),
    invitationToken: z.string().optional(),
});

const reviewSchema = z.object({ reviewNotes: z.string().optional() });

function createErrorMessage(code: string): string {
    switch (code) {
        case 'VENUE_NOT_ACTIVE': return 'The selected venue is no longer active.';
        case 'DEPARTMENT_NOT_ACTIVE': return 'The selected department is no longer active at this venue.';
        default: return 'Failed to submit request';
    }
}

export class AccessRequestsController {
    /** POST /api/v1/public/access-requests */
    static async createPublic(req: Request, res: Response) {
        try {
            const data = createAccessRequestSchema.parse(req.body);

            let email = data.email;
            let invitationId: string | undefined;
            let source: 'sso' | 'invite' = 'sso';

            if (data.invitationToken) {
                let invitation;
                try {
                    invitation = await invitationsService.validateForSubmission(data.invitationToken);
                } catch (e: any) {
                    res.status(400).json({ error: invitationErrorMessage(e.message) });
                    return;
                }
                email = invitation.email; // server-side lock — the invite's email always wins
                invitationId = invitation.id;
                source = 'invite';
            }

            const request = await accessRequestsService.createRequest({
                name: data.name,
                email,
                phone: data.phone,
                stadiumId: data.stadiumId,
                departmentId: data.departmentId,
                source,
                invitationId,
            });

            if (invitationId) {
                await invitationsService.markUsed(invitationId);
            }

            res.status(201).json({ message: 'Request submitted successfully', data: request });
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else if (error?.message === 'VENUE_NOT_ACTIVE' || error?.message === 'DEPARTMENT_NOT_ACTIVE') {
                res.status(400).json({ error: createErrorMessage(error.message) });
            } else {
                console.error('Create access request error:', error);
                res.status(500).json({ error: 'Failed to submit request' });
            }
        }
    }

    /** GET /api/v1/public/access-requests/:token */
    static async getByTokenPublic(req: Request, res: Response) {
        try {
            const token = req.params.token as string;
            const request = await accessRequestsService.getByToken(token);
            if (!request) {
                res.status(404).json({ error: 'Request not found' });
                return;
            }
            res.status(200).json({ data: request });
        } catch (error) {
            console.error('Get access request by token error:', error);
            res.status(500).json({ error: 'Failed to fetch request' });
        }
    }

    /** GET /api/v1/access-requests */
    static async getAll(req: AuthRequest, res: Response) {
        try {
            const { status, stadiumId, departmentId, page, limit } = req.query;
            let filterStadiumId = stadiumId as string | undefined;
            if (req.user?.role === 'Admin') filterStadiumId = req.user.stadiumId;

            const result = await accessRequestsService.getAll(
                { status: status as string, stadiumId: filterStadiumId, departmentId: departmentId as string },
                page ? parseInt(page as string) : undefined,
                limit ? parseInt(limit as string) : undefined,
            );
            res.status(200).json(result);
        } catch (error) {
            console.error('Get all access requests error:', error);
            res.status(500).json({ error: 'Failed to fetch requests' });
        }
    }

    /** GET /api/v1/access-requests/:id */
    static async getById(req: AuthRequest, res: Response) {
        try {
            const request = await accessRequestsService.getById(req.params.id as string);
            if (!request) {
                res.status(404).json({ error: 'Request not found' });
                return;
            }
            if (req.user?.role === 'Admin' && request.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }
            res.status(200).json({ data: request });
        } catch (error) {
            console.error('Get access request by ID error:', error);
            res.status(500).json({ error: 'Failed to fetch request' });
        }
    }

    /** POST /api/v1/access-requests/:id/approve */
    static async approve(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            const { reviewNotes } = reviewSchema.parse(req.body);

            const existing = await accessRequestsService.getById(id);
            if (!existing) {
                res.status(404).json({ error: 'Request not found' });
                return;
            }
            if (req.user?.role === 'Admin' && existing.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }
            if (existing.status !== 'Pending') {
                res.status(400).json({ error: 'Request has already been reviewed' });
                return;
            }

            const request = await accessRequestsService.approveRequest(id, req.user!.userId, reviewNotes);
            res.status(200).json({ message: 'Request approved successfully', data: request });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                console.error('Approve access request error:', error);
                res.status(500).json({ error: 'Failed to approve request' });
            }
        }
    }

    /** POST /api/v1/access-requests/:id/reject */
    static async reject(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            const { reviewNotes } = reviewSchema.parse(req.body);

            const existing = await accessRequestsService.getById(id);
            if (!existing) {
                res.status(404).json({ error: 'Request not found' });
                return;
            }
            if (req.user?.role === 'Admin' && existing.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }
            if (existing.status !== 'Pending') {
                res.status(400).json({ error: 'Request has already been reviewed' });
                return;
            }

            const request = await accessRequestsService.rejectRequest(id, req.user!.userId, reviewNotes);
            res.status(200).json({ message: 'Request rejected successfully', data: request });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                console.error('Reject access request error:', error);
                res.status(500).json({ error: 'Failed to reject request' });
            }
        }
    }

    /** DELETE /api/v1/access-requests/:id */
    static async delete(req: AuthRequest, res: Response) {
        try {
            const existing = await accessRequestsService.getById(req.params.id as string);
            if (!existing) {
                res.status(404).json({ error: 'Request not found' });
                return;
            }
            await accessRequestsService.deleteRequest(req.params.id as string);
            res.status(204).send();
        } catch (error) {
            console.error('Delete access request error:', error);
            res.status(500).json({ error: 'Failed to delete request' });
        }
    }
}
```

Note: `invitationErrorMessage` must be exported from `invitations.controller.ts` (it already is, from Task 3 Step 6).

- [ ] **Step 3: Implement `access-requests.routes.ts`**

Create `backend/src/modules/access-requests/access-requests.routes.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { AccessRequestsController } from './access-requests.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

// ============================================
// Public routes (no authentication required)
// ============================================

// POST /api/v1/public/access-requests - submit a self-service or invite-originated access request
router.post('/public/access-requests', (req: Request, res: Response) => AccessRequestsController.createPublic(req, res));

// GET /api/v1/public/access-requests/:token - confirmation page lookup
router.get('/public/access-requests/:token', (req: Request, res: Response) => AccessRequestsController.getByTokenPublic(req, res));

// ============================================
// Admin routes (authentication required)
// ============================================

router.use(authenticate);

router.get('/access-requests', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => AccessRequestsController.getAll(req as any, res));
router.get('/access-requests/:id', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => AccessRequestsController.getById(req as any, res));
router.post('/access-requests/:id/approve', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => AccessRequestsController.approve(req as any, res));
router.post('/access-requests/:id/reject', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => AccessRequestsController.reject(req as any, res));
router.delete('/access-requests/:id', requireRole('SuperAdmin'), (req: Request, res: Response) => AccessRequestsController.delete(req as any, res));

export default router;
```

- [ ] **Step 4: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors (not yet registered in `app.ts` — Task 6).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/access-requests
git commit -m "feat(access-requests): venue-scoped access-request service, controller, routes"
```

---

### Task 5: Auth module — Microsoft SSO login + forced password change

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts`
- Modify: `backend/src/modules/auth/auth.controller.ts`
- Modify: `backend/src/modules/auth/auth.routes.ts`
- Modify: `backend/src/modules/users/users.service.ts`

**Interfaces:**
- Consumes: `verifyMicrosoftToken` from Task 2.
- Produces: `AuthService.loginWithMicrosoft(idToken: string): Promise<{ accessToken, refreshToken, user }>` (throws `Error('NOT_REGISTERED')` with `.email`/`.name` properties attached when no matching user exists), `login()`/`getUserById()` responses now include `authProvider`/`mustChangePassword`, `POST /api/v1/auth/microsoft` route — Task 8 (frontend) calls this exact endpoint shape.

- [ ] **Step 1: Update `auth.service.ts` — reject local login for SSO accounts, surface `mustChangePassword`, add `loginWithMicrosoft`**

In `backend/src/modules/auth/auth.service.ts`, add the import at the top:

```typescript
import { verifyMicrosoftToken } from '../../services/microsoft-auth.service';
```

In `login()`, right after the `isBlocked` check (before the password comparison), add:

```typescript
        if (user.authProvider !== 'local') {
            throw new Error('This account signs in with your SC/LOC Microsoft account — use "Sign in with your SC/LOC account" instead.');
        }

```

In `login()`'s return statement, add `mustChangePassword` and `authProvider` to the returned `user` object:

```typescript
        return {
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone,
                isActive: user.isActive,
                exportFormat: user.exportFormat,
                stadiumId: user.stadiumId,
                stadium: user.stadium,
                authProvider: user.authProvider,
                mustChangePassword: user.mustChangePassword,
            },
        };
```

Add a new method, right after `login()`:

```typescript
    /**
     * Signs in via a verified Microsoft ID token. Matches an existing User by
     * microsoftOid first, then by email (backfilling microsoftOid on match, and
     * linking a local-password account to SSO going forward). Throws NOT_REGISTERED
     * (with .email/.name attached) when no matching account exists, so the caller
     * can route the browser to the access-request form.
     */
    static async loginWithMicrosoft(idToken: string) {
        const identity = await verifyMicrosoftToken(idToken);

        let user = await prisma.user.findUnique({ where: { microsoftOid: identity.oid }, include: { stadium: true } });
        if (!user) {
            user = await prisma.user.findUnique({ where: { email: identity.email }, include: { stadium: true } });
        }

        if (!user) {
            const err: any = new Error('NOT_REGISTERED');
            err.email = identity.email;
            err.name = identity.name;
            throw err;
        }

        if (!user.isActive) {
            throw new Error('Account is deactivated. Please contact your administrator.');
        }
        if (user.isBlocked) {
            throw new Error('ACCOUNT_BLOCKED');
        }

        if (user.authProvider !== 'microsoft' || user.microsoftOid !== identity.oid) {
            user = await prisma.user.update({
                where: { id: user.id },
                data: { authProvider: 'microsoft', microsoftOid: identity.oid },
                include: { stadium: true },
            });
        }

        const tokenPayload: TokenPayload = {
            userId: user.id,
            email: user.email,
            role: user.role,
            stadiumId: user.stadiumId || undefined,
            departmentId: user.departmentId || undefined,
        };

        const accessToken = jwt.sign(tokenPayload, authConfig.jwt.accessTokenSecret, { expiresIn: '15m' } as any);
        const refreshToken = jwt.sign({ userId: user.id }, authConfig.jwt.refreshTokenSecret, { expiresIn: '7d' } as any);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        await prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt } });

        return {
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone,
                isActive: user.isActive,
                exportFormat: user.exportFormat,
                stadiumId: user.stadiumId,
                stadium: user.stadium,
                authProvider: user.authProvider,
                mustChangePassword: user.mustChangePassword,
            },
        };
    }
```

In `changePassword()`, add `mustChangePassword: false` to the update so completing a forced change clears the flag:

```typescript
    static async changePassword(userId: string, currentPassword: string, newPassword: string) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error('User not found');

        const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isValid) throw new Error('Current password is incorrect');

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash, mustChangePassword: false },
        });
    }
```

- [ ] **Step 2: Add the controller method**

In `backend/src/modules/auth/auth.controller.ts`, add near the top:

```typescript
const microsoftLoginSchema = z.object({
    idToken: z.string().min(1, 'idToken is required'),
});
```

Add a new method after `login()`:

```typescript
    static async microsoftLogin(req: Request, res: Response): Promise<void> {
        try {
            const { idToken } = microsoftLoginSchema.parse(req.body);
            const result = await AuthService.loginWithMicrosoft(idToken);
            res.status(200).json({ message: 'Login successful', ...result });
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else if (error?.message === 'MICROSOFT_SSO_NOT_CONFIGURED') {
                res.status(503).json({ error: 'Microsoft sign-in is not configured yet. Please use your email and password, or contact your administrator.' });
            } else if (error?.message === 'NOT_REGISTERED') {
                res.status(404).json({ error: 'NOT_REGISTERED', email: error.email, name: error.name });
            } else if (error?.message === 'ACCOUNT_BLOCKED') {
                res.status(403).json({ error: 'Your account has been blocked. Contact the administrator.' });
            } else if (error instanceof Error) {
                res.status(401).json({ error: error.message });
            } else {
                res.status(500).json({ error: 'Microsoft sign-in failed' });
            }
        }
    }
```

- [ ] **Step 3: Register the route**

In `backend/src/modules/auth/auth.routes.ts`, add after the `/login` route:

```typescript
/**
 * @route   POST /api/v1/auth/microsoft
 * @desc    Sign in with a verified Microsoft Entra ID (SC/LOC) token
 * @access  Public
 */
router.post('/microsoft', authLimiter, AuthController.microsoftLogin);
```

- [ ] **Step 4: `users.service.ts` — force password change + credentials email on admin-created accounts**

In `backend/src/modules/users/users.service.ts`, add the import at the top:

```typescript
import { emailService } from '../../services/email.service';
```

In `create()`, capture whether a password was generated, and after the `prisma.user.create(...)` call, email the credentials. Replace the body of `create()`:

```typescript
    async create(data: {
        name: string;
        email: string;
        password?: string;
        role: string;
        phone?: string;
        accreditationNumber?: string;
        stadiumId?: string;
        departmentId?: string;
        assignAllStadiums?: boolean;
    }) {
        const exists = await prisma.user.findUnique({ where: { email: data.email } });
        if (exists) throw new Error('User with this email already exists');

        const generatedPassword = data.password || generateSecurePassword();
        const passwordHash = await bcrypt.hash(generatedPassword, 10);
        const user = await prisma.user.create({
            data: {
                name: data.name,
                email: data.email,
                passwordHash,
                role: data.role,
                phone: data.phone,
                accreditationNumber: data.accreditationNumber,
                stadiumId: data.stadiumId,
                departmentId: data.departmentId,
                assignAllStadiums: data.assignAllStadiums || false,
                authProvider: 'local',
                mustChangePassword: true,
                exportPreferences: JSON.stringify({}),
                grantedPages: JSON.stringify([]),
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                phone: true,
                accreditationNumber: true,
                isActive: true,
                isBlocked: true,
                assignAllStadiums: true,
                stadiumId: true,
                stadium: { select: { id: true, name: true } },
                departmentId: true,
                department: { select: { id: true, name: true } },
                createdAt: true,
            },
        });

        const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`;
        try {
            await emailService.send({
                to: data.email,
                subject: 'Your GCMS account has been created',
                text: `Hello ${data.name},\n\nAn account has been created for you on GCMS.\n\nEmail: ${data.email}\nTemporary password: ${generatedPassword}\n\nSign in at ${loginUrl} — you'll be asked to set a new password on first login.\n\nThank you,\nGCMS`,
                html: `<h2>Your GCMS account has been created</h2><p><strong>Email:</strong> ${data.email}</p><p><strong>Temporary password:</strong> ${generatedPassword}</p><p>Sign in at <a href="${loginUrl}">${loginUrl}</a> — you'll be asked to set a new password on first login.</p>`,
            });
        } catch (e) {
            console.error('Welcome email failed:', e);
        }

        return user;
    }
```

- [ ] **Step 5: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/auth backend/src/modules/users/users.service.ts
git commit -m "feat(auth): Microsoft SSO login endpoint, force-password-change on admin-created accounts"
```

---

### Task 6: Wire new routers into `app.ts`, add env var placeholders

**Files:**
- Modify: `backend/src/app.ts`
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: default exports from `access-requests.routes.ts` and `invitations.routes.ts` (Tasks 3–4).
- Produces: `/api/v1/public/access-requests`, `/api/v1/access-requests`, `/api/v1/public/invitations/:token`, `/api/v1/invitations` all reachable — Task 9 (frontend) calls these paths.

- [ ] **Step 1: Register the routers**

In `backend/src/app.ts`, add the imports near the other route imports (after `requestRoutes`):

```typescript
import accessRequestRoutes from './modules/access-requests/access-requests.routes';
import invitationRoutes from './modules/invitations/invitations.routes';
```

Add the `app.use` calls near `app.use('/api/v1', requestRoutes);`:

```typescript
app.use('/api/v1', accessRequestRoutes);
app.use('/api/v1', invitationRoutes);
```

- [ ] **Step 2: Add env var placeholders**

In `backend/.env.example`, add a new section after the `# Email` block:

```
# Microsoft Entra ID (Azure AD) SSO — public-client flow, no client secret needed.
# Leave both unset to keep the "Sign in with your SC/LOC account" button showing a
# "coming soon" message instead of attempting SSO.
MSAL_TENANT_ID=""
MSAL_CLIENT_ID=""

# Base URL the frontend is served from — used to build links in emails (invitations,
# welcome emails, password reset already uses its own FRONTEND_URL-independent flow).
FRONTEND_URL="http://localhost:3000"
```

- [ ] **Step 3: Start the local dev stack and smoke-test the new public routes**

With the local Docker Desktop stack running (`docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.dev-live.yml up -d mysql minio backend-dev frontend-dev`), run:

```bash
curl -s http://localhost:3005/api/v1/public/stadiums
curl -i -s -X POST http://localhost:3005/api/v1/public/access-requests -H "Content-Type: application/json" -d "{}"
curl -i -s http://localhost:3005/api/v1/public/invitations/does-not-exist
```

Expected: first call returns `{"data":[...]}` (existing endpoint, confirms the server restarted cleanly); second returns `400` with a Zod validation error body (confirms the new route is wired and reachable); third returns `404` with `{"error":"This invitation link is invalid."}`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/app.ts backend/.env.example
git commit -m "feat: register access-requests and invitations routers, document new env vars"
```

---

### Task 7: Frontend — MSAL setup, API client, auth store

**Files:**
- Create: `frontend/src/lib/msal.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/stores/authStore.ts`
- Modify: `frontend/package.json` (add `@azure/msal-browser`)
- Modify: `frontend/.env.example`

**Interfaces:**
- Produces: `msalEnabled: boolean`, `ensureMsalInitialized(): Promise<void>`, `msalInstance: PublicClientApplication` from `lib/msal.ts`; `authApi.microsoftLogin(idToken)`, `accessRequestsApi.{getPublicStadiums, getPublicDepartments, createPublic, getByTokenPublic, getInvitationPublic}`, `invitationsApi.{create, getAll, revoke}` from `lib/api.ts`; `useAuthStore().loginWithMicrosoft(idToken)` returning `{ registered: true } | { registered: false; email: string; name: string }` — Tasks 8–11 depend on all of these exact names.

- [ ] **Step 1: Add the MSAL dependency**

In `frontend/package.json`, add to `"dependencies"` (alphabetical):

```json
    "@azure/msal-browser": "^3.27.0",
```

Run from `frontend/`:

```bash
npm install
```

- [ ] **Step 2: Create the MSAL config module**

Create `frontend/src/lib/msal.ts`:

```typescript
import { PublicClientApplication, type Configuration } from '@azure/msal-browser';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
const tenantId = env.VITE_MSAL_TENANT_ID;
const clientId = env.VITE_MSAL_CLIENT_ID;

/** False until Ahmed's Entra ID App Registration values are set as build/app env vars. */
export const msalEnabled = Boolean(tenantId && clientId);

const msalConfig: Configuration = {
    auth: {
        clientId: clientId || '00000000-0000-0000-0000-000000000000',
        authority: `https://login.microsoftonline.com/${tenantId || 'common'}`,
        redirectUri: '/auth/microsoft/callback',
    },
    cache: {
        cacheLocation: 'sessionStorage',
        storeAuthStateInCookie: false,
    },
};

export const msalInstance = new PublicClientApplication(msalConfig);

let initPromise: Promise<void> | null = null;

/** MSAL v3 requires an explicit async initialize() before any other call — memoized so callers can await it freely. */
export function ensureMsalInitialized(): Promise<void> {
    if (!initPromise) {
        initPromise = msalInstance.initialize();
    }
    return initPromise;
}

export const MICROSOFT_LOGIN_SCOPES = ['openid', 'profile', 'email'];
```

- [ ] **Step 3: Add API client functions**

In `frontend/src/lib/api.ts`, add `'/auth/microsoft'` to the `publicEndpoints` skip-list (in the response interceptor):

```typescript
        const publicEndpoints = ['/auth/login', '/auth/microsoft', '/auth/forgot-password', '/auth/reset-password', '/public/'];
```

Add to `authApi` (after `changePassword`):

```typescript
    microsoftLogin: (idToken: string) =>
        apiClient.post('/auth/microsoft', { idToken }),
```

Add two new exported API objects after `requestsApi`:

```typescript
// Account access requests (SSO self-service + invitation-originated)
export const accessRequestsApi = {
    // Public endpoints (no auth)
    getPublicStadiums: () => axios.get(`${API_URL}/public/stadiums`),
    getPublicDepartments: (stadiumId: string) =>
        axios.get(`${API_URL}/public/departments`, { params: { stadiumId } }),
    createPublic: (data: {
        name: string;
        email: string;
        phone?: string;
        stadiumId: string;
        departmentId: string;
        invitationToken?: string;
    }) => axios.post(`${API_URL}/public/access-requests`, data),
    getByTokenPublic: (token: string) =>
        axios.get(`${API_URL}/public/access-requests/${token}`),
    getInvitationPublic: (token: string) =>
        axios.get(`${API_URL}/public/invitations/${token}`),

    // Admin endpoints (auth required)
    getAll: (params?: Record<string, unknown>) =>
        apiClient.get('/access-requests', { params }),
    getById: (id: string) =>
        apiClient.get(`/access-requests/${id}`),
    approve: (id: string, reviewNotes?: string) =>
        apiClient.post(`/access-requests/${id}/approve`, { reviewNotes }),
    reject: (id: string, reviewNotes?: string) =>
        apiClient.post(`/access-requests/${id}/reject`, { reviewNotes }),
    delete: (id: string) =>
        apiClient.delete(`/access-requests/${id}`),
};

// Invitations (Admin/SuperAdmin invite a user by email)
export const invitationsApi = {
    create: (data: { email: string; stadiumId?: string; departmentId?: string }) =>
        apiClient.post('/invitations', data),
    getAll: (params?: Record<string, unknown>) =>
        apiClient.get('/invitations', { params }),
    revoke: (id: string) =>
        apiClient.post(`/invitations/${id}/revoke`),
};
```

- [ ] **Step 4: Extend `authStore.ts`**

In `frontend/src/stores/authStore.ts`, extend `AuthUser`:

```typescript
export interface AuthUser {
    id: string;
    name: string;
    email: string;
    role: 'SuperAdmin' | 'Admin' | 'FA' | 'Observer' | 'Contracts' | 'MaintenanceTeam';
    phone?: string;
    stadiumId?: string;
    stadium?: { id: string; name: string };
    isActive: boolean;
    exportFormat?: 'xlsx' | 'pdf' | 'docx';
    exportPreferences?: ExportPreferences;
    grantedPages?: string[];
    venueReportAccess?: string;
    authProvider?: 'local' | 'microsoft';
    mustChangePassword?: boolean;
}
```

Extend `AuthState`:

```typescript
interface AuthState {
    user: AuthUser | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    loginWithMicrosoft: (idToken: string) => Promise<{ registered: true } | { registered: false; email: string; name: string }>;
    logout: () => void;
    updateExportFormat: (format: 'xlsx' | 'pdf' | 'docx') => void;
    updateExportPreferences: (preferences: ExportPreferences) => void;
}
```

Add the implementation, right after `login`:

```typescript
            loginWithMicrosoft: async (idToken: string) => {
                set({ isLoading: true });
                try {
                    const response = await authApi.microsoftLogin(idToken);
                    const { user, accessToken, refreshToken } = response.data;
                    localStorage.setItem('accessToken', accessToken);
                    localStorage.setItem('refreshToken', refreshToken);
                    set({ user, isAuthenticated: true, isLoading: false });
                    return { registered: true };
                } catch (error: any) {
                    set({ isLoading: false });
                    if (error.response?.status === 404 && error.response?.data?.error === 'NOT_REGISTERED') {
                        return { registered: false, email: error.response.data.email, name: error.response.data.name };
                    }
                    throw error;
                }
            },
```

- [ ] **Step 5: Add frontend env placeholders**

In `frontend/.env.example`, add:

```
# Microsoft Entra ID (Azure AD) SSO — public-client flow, no client secret.
# Leave both unset to keep the SSO button showing "coming soon" instead of attempting login.
VITE_MSAL_TENANT_ID=
VITE_MSAL_CLIENT_ID=
```

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/lib/msal.ts frontend/src/lib/api.ts frontend/src/stores/authStore.ts frontend/.env.example
git commit -m "feat(frontend): MSAL setup, access-requests/invitations API clients, auth store SSO support"
```

---

### Task 8: Frontend — real SSO login button + Microsoft callback route

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx`
- Create: `frontend/src/pages/MicrosoftCallbackPage.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `msalEnabled`, `ensureMsalInitialized`, `msalInstance`, `MICROSOFT_LOGIN_SCOPES` from Task 7's `lib/msal.ts`; `useAuthStore().loginWithMicrosoft`.
- Produces: `/auth/microsoft/callback` route — the redirect URI already given to Ahmed for the Entra ID App Registration.

- [ ] **Step 1: Wire the real SSO button in `LoginPage.tsx`**

In `frontend/src/pages/LoginPage.tsx`, add imports at the top:

```typescript
import { msalEnabled, ensureMsalInitialized, msalInstance, MICROSOFT_LOGIN_SCOPES } from '@/lib/msal';
```

Add a handler function inside `LoginPage()`, above `handleSubmit`:

```typescript
    const handleMicrosoftSignIn = async () => {
        if (!msalEnabled) {
            toast.info('Microsoft sign-in is being configured — please use your email and password for now.');
            return;
        }
        try {
            await ensureMsalInitialized();
            await msalInstance.loginRedirect({ scopes: MICROSOFT_LOGIN_SCOPES });
        } catch (err) {
            console.error('Microsoft sign-in failed to start', err);
            toast.error('Could not start Microsoft sign-in. Please try again.');
        }
    };
```

Also update `handleSubmit` to respect a forced password change after local login:

```typescript
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            await login(email, password);
            const current = useAuthStore.getState().user;
            navigate(current?.mustChangePassword ? '/force-change-password' : '/');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Login failed');
        }
    };
```

Replace the placeholder button's `onClick`:

```typescript
                    <button
                        type="button"
                        onClick={handleMicrosoftSignIn}
                        className="w-full mb-4 flex items-center justify-center gap-2 rounded-md border border-[#e3e6ed] bg-[#f5f7fa] hover:bg-[#eef0f5] transition-colors py-2.5 px-4 text-sm font-bold text-[#31374a]"
                    >
```

(unchanged JSX below it — only the `onClick` line changes.)

- [ ] **Step 2: Create the callback page**

Create `frontend/src/pages/MicrosoftCallbackPage.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ensureMsalInitialized, msalInstance } from '@/lib/msal';
import { useAuthStore } from '@/stores/authStore';

export function MicrosoftCallbackPage() {
    const navigate = useNavigate();
    const { loginWithMicrosoft } = useAuthStore();
    const [error, setError] = useState<string | null>(null);
    const ranRef = useRef(false);

    useEffect(() => {
        if (ranRef.current) return;
        ranRef.current = true;

        (async () => {
            try {
                await ensureMsalInitialized();
                const result = await msalInstance.handleRedirectPromise();
                if (!result?.idToken) {
                    setError('No sign-in result found. Please try signing in again.');
                    return;
                }

                const outcome = await loginWithMicrosoft(result.idToken);
                if (outcome.registered) {
                    const current = useAuthStore.getState().user;
                    navigate(current?.mustChangePassword ? '/force-change-password' : '/', { replace: true });
                } else {
                    navigate('/access-request', {
                        replace: true,
                        state: { email: outcome.email, name: outcome.name, source: 'sso' },
                    });
                }
            } catch (err) {
                console.error('Microsoft sign-in callback failed', err);
                setError('Sign-in failed, please try again.');
                toast.error('Sign-in failed, please try again.');
            }
        })();
    }, [loginWithMicrosoft, navigate]);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#f5f7fa]">
            {error ? (
                <>
                    <p className="text-sm text-[#67728a]">{error}</p>
                    <button
                        type="button"
                        onClick={() => navigate('/login', { replace: true })}
                        className="text-sm font-semibold text-[#3874ff] hover:underline"
                    >
                        Back to sign in
                    </button>
                </>
            ) : (
                <>
                    <Loader2 className="w-8 h-8 animate-spin text-[#3874ff]" />
                    <p className="text-sm text-[#67728a]">Completing sign-in…</p>
                </>
            )}
        </div>
    );
}
```

- [ ] **Step 3: Register the route**

In `frontend/src/App.tsx`, add the lazy import near the other public pages:

```typescript
const MicrosoftCallbackPage = lazy(() => import('@/pages/MicrosoftCallbackPage').then(m => ({ default: m.MicrosoftCallbackPage })));
```

Add the route in the public routes block (near `/login`):

```typescript
                <Route path="/auth/microsoft/callback" element={<MicrosoftCallbackPage />} />
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors (references to `/access-request` and `/force-change-password` routes are fine even though those pages/routes land in Tasks 9–10 — TS only checks the string literals, not route existence).

- [ ] **Step 5: Manual smoke test**

With the local dev stack running (`http://localhost:3000`), open `/login`, click "Sign in with your SC/LOC account" with `VITE_MSAL_TENANT_ID`/`VITE_MSAL_CLIENT_ID` unset. Expected: the "Microsoft sign-in is being configured" toast appears, no navigation happens, no console error. (The real MSAL redirect round-trip can't be exercised until Ahmed's Tenant/Client ID exist — documented in the spec's Testing section.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/LoginPage.tsx frontend/src/pages/MicrosoftCallbackPage.tsx frontend/src/App.tsx
git commit -m "feat(frontend): real Microsoft SSO login button and callback handler"
```

---

### Task 9: Frontend — public Access Request page + confirmation

**Files:**
- Create: `frontend/src/pages/AccessRequestPage.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `accessRequestsApi` from Task 7's `lib/api.ts`.
- Produces: `/access-request` (optional `?invite=` query param, or `location.state.{email,name,source}` from the SSO callback) and `/access-request/confirm/:token` routes.

- [ ] **Step 1: Create the page**

Create `frontend/src/pages/AccessRequestPage.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { useLocation, useParams, useSearchParams, Link } from 'react-router-dom';
import { accessRequestsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, Mail } from 'lucide-react';

interface Stadium { id: string; name: string; code: string }
interface Department { id: string; name: string; code?: string; stadiumId: string }

export function AccessRequestPage() {
    const location = useLocation() as { state?: { email?: string; name?: string; source?: 'sso' } };
    const [searchParams] = useSearchParams();
    const inviteToken = searchParams.get('invite') || undefined;

    const [loadingInvite, setLoadingInvite] = useState(Boolean(inviteToken));
    const [inviteError, setInviteError] = useState('');

    const [name, setName] = useState(location.state?.name || '');
    const [email, setEmail] = useState(location.state?.email || '');
    const [emailLocked, setEmailLocked] = useState(Boolean(location.state?.email));
    const [phone, setPhone] = useState('');
    const [stadiumId, setStadiumId] = useState('');
    const [departmentId, setDepartmentId] = useState('');

    const [stadiums, setStadiums] = useState<Stadium[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [submitted, setSubmitted] = useState<{ requestNumber: number } | null>(null);

    useEffect(() => {
        accessRequestsApi.getPublicStadiums().then(res => setStadiums(res.data?.data || [])).catch(() => {});
    }, []);

    useEffect(() => {
        setDepartmentId('');
        if (!stadiumId) { setDepartments([]); return; }
        accessRequestsApi.getPublicDepartments(stadiumId).then(res => setDepartments(res.data?.data || [])).catch(() => {});
    }, [stadiumId]);

    useEffect(() => {
        if (!inviteToken) return;
        accessRequestsApi.getInvitationPublic(inviteToken)
            .then(res => {
                const invitation = res.data?.data;
                setEmail(invitation.email);
                setEmailLocked(true);
                if (invitation.stadiumId) setStadiumId(invitation.stadiumId);
                if (invitation.departmentId) setDepartmentId(invitation.departmentId);
            })
            .catch(err => setInviteError(err.response?.data?.error || 'This invitation link is invalid.'))
            .finally(() => setLoadingInvite(false));
    }, [inviteToken]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);
        try {
            const res = await accessRequestsApi.createPublic({
                name, email, phone: phone || undefined, stadiumId, departmentId,
                invitationToken: inviteToken,
            });
            setSubmitted({ requestNumber: res.data.data.requestNumber });
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to submit your request. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loadingInvite) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#3874ff]" />
            </div>
        );
    }

    if (inviteError) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-8 text-center">
                    <p className="text-[#67728a]">{inviteError}</p>
                    <Link to="/login" className="mt-4 inline-block text-sm font-semibold text-[#3874ff] hover:underline">Back to sign in</Link>
                </div>
            </div>
        );
    }

    if (submitted) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-8 text-center">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                    <h1 className="text-xl font-bold text-[#222834]">Request submitted</h1>
                    <p className="text-sm text-[#67728a] mt-2">
                        Your access request (#{submitted.requestNumber}) has been sent to the venue's Admin for review.
                        You'll get an email once it's been reviewed.
                    </p>
                    <Link to="/login" className="mt-6 inline-block text-sm font-semibold text-[#3874ff] hover:underline">Back to sign in</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[#f5f7fa]">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-8">
                <h1 className="text-xl font-bold text-[#222834] text-center">Request account access</h1>
                <p className="text-sm text-[#67728a] text-center mt-1">
                    Tell us where you're based and we'll route your request to the right Admin.
                </p>

                {error && (
                    <Alert variant="destructive" className="mt-4">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <form onSubmit={handleSubmit} className="space-y-4 mt-6">
                    <div className="space-y-1.5">
                        <Label htmlFor="name">Full name</Label>
                        <Input id="name" value={name} required onChange={e => setName(e.target.value)} />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="email">Email</Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9aa2b5]" />
                            <Input
                                id="email" type="email" value={email} required disabled={emailLocked}
                                onChange={e => !emailLocked && setEmail(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        {emailLocked && <p className="text-xs text-[#9aa2b5]">Verified — this can't be changed.</p>}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="phone">Phone number</Label>
                        <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} />
                    </div>

                    <div className="space-y-1.5">
                        <Label>Venue</Label>
                        <Select value={stadiumId} onValueChange={setStadiumId}>
                            <SelectTrigger><SelectValue placeholder="Select a venue" /></SelectTrigger>
                            <SelectContent>
                                {stadiums.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label>Department (FA)</Label>
                        <Select value={departmentId} onValueChange={setDepartmentId} disabled={!stadiumId}>
                            <SelectTrigger><SelectValue placeholder={stadiumId ? 'Select a department' : 'Select a venue first'} /></SelectTrigger>
                            <SelectContent>
                                {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <Button type="submit" disabled={submitting || !stadiumId || !departmentId} className="w-full">
                        {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</> : 'Submit Request'}
                    </Button>
                </form>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Register the route**

In `frontend/src/App.tsx`, add the lazy import:

```typescript
const AccessRequestPage = lazy(() => import('@/pages/AccessRequestPage').then(m => ({ default: m.AccessRequestPage })));
```

Add the route next to `/auth/microsoft/callback`:

```typescript
                <Route path="/access-request" element={<AccessRequestPage />} />
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual smoke test**

With the local dev stack running, open `http://localhost:3000/access-request` directly. Expected: form renders, venue dropdown populates from `/api/v1/public/stadiums`, choosing a venue populates the department dropdown, submitting with all fields filled shows the "Request submitted" confirmation and creates a row (verify via `curl http://localhost:3005/api/v1/public/access-requests/<token-from-response>` or by checking the admin page once Task 11 lands).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/AccessRequestPage.tsx frontend/src/App.tsx
git commit -m "feat(frontend): public access-request form (SSO self-service + invitation)"
```

---

### Task 10: Frontend — forced password change screen

**Files:**
- Create: `frontend/src/pages/ForceChangePasswordPage.tsx`
- Modify: `frontend/src/components/auth/ProtectedRoute.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `authApi.changePassword`, `useAuthStore`.
- Produces: `/force-change-password` route, reachable from `ProtectedRoute`'s automatic redirect whenever `user.mustChangePassword` is true.

- [ ] **Step 1: Create the page**

Create `frontend/src/pages/ForceChangePasswordPage.tsx`:

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Lock } from 'lucide-react';

export function ForceChangePasswordPage() {
    const navigate = useNavigate();
    const { user, logout } = useAuthStore();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (newPassword !== confirmPassword) {
            setError('New passwords do not match.');
            return;
        }
        if (newPassword.length < 8) {
            setError('New password must be at least 8 characters.');
            return;
        }
        setSubmitting(true);
        try {
            await authApi.changePassword(currentPassword, newPassword);
            useAuthStore.setState((state) => ({ user: state.user ? { ...state.user, mustChangePassword: false } : null }));
            navigate('/', { replace: true });
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to change password.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[#f5f7fa]">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-8">
                <Lock className="w-10 h-10 text-[#3874ff] mx-auto mb-2" />
                <h1 className="text-xl font-bold text-[#222834] text-center">Set a new password</h1>
                <p className="text-sm text-[#67728a] text-center mt-1">
                    Hi {user?.name || ''}, please set a new password before continuing.
                </p>

                {error && (
                    <Alert variant="destructive" className="mt-4">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <form onSubmit={handleSubmit} className="space-y-4 mt-6">
                    <div className="space-y-1.5">
                        <Label htmlFor="currentPassword">Temporary / current password</Label>
                        <Input id="currentPassword" type="password" value={currentPassword} required onChange={e => setCurrentPassword(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="newPassword">New password</Label>
                        <Input id="newPassword" type="password" value={newPassword} required minLength={8} onChange={e => setNewPassword(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="confirmPassword">Confirm new password</Label>
                        <Input id="confirmPassword" type="password" value={confirmPassword} required minLength={8} onChange={e => setConfirmPassword(e.target.value)} />
                    </div>

                    <Button type="submit" disabled={submitting} className="w-full">
                        {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : 'Set new password'}
                    </Button>

                    <button type="button" onClick={logout} className="w-full text-center text-xs text-[#9aa2b5] hover:underline">
                        Sign out instead
                    </button>
                </form>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Gate `ProtectedRoute` on `mustChangePassword`**

In `frontend/src/components/auth/ProtectedRoute.tsx`, update the final render of `ProtectedRoute`:

```typescript
    if (!verified) {
        return <Navigate to="/login" replace />;
    }

    if (user?.mustChangePassword && window.location.pathname !== '/force-change-password') {
        return <Navigate to="/force-change-password" replace />;
    }

    return <>{children}</>;
```

(replacing the existing single-line `return verified ? <>{children}</> : <Navigate to="/login" replace />;`)

- [ ] **Step 3: Register the route**

In `frontend/src/App.tsx`, add the lazy import:

```typescript
const ForceChangePasswordPage = lazy(() => import('@/pages/ForceChangePasswordPage').then(m => ({ default: m.ForceChangePasswordPage })));
```

Add the route inside the `ProtectedRoute`-wrapped `/*` block's inner `<Routes>`, as its own top-level entry (not behind `PageGuard` — every authenticated user must be able to reach it):

```typescript
                                    <Route path="/force-change-password" element={<ForceChangePasswordPage />} />
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual smoke test**

Using the local dev stack: create a user via the (still-current, pre-Task-11) Users page, capture the temp password from the dev SMTP catcher (MailHog, per the existing dev stack), log in with it. Expected: immediately redirected to `/force-change-password` instead of the dashboard; after setting a new password, lands on `/`; logging out and back in with the new password no longer redirects.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ForceChangePasswordPage.tsx frontend/src/components/auth/ProtectedRoute.tsx frontend/src/App.tsx
git commit -m "feat(frontend): forced password-change screen for admin-created accounts"
```

---

### Task 11: Admin UI — Account Access management page + Invite User

**Files:**
- Create: `frontend/src/pages/AccessRequestsManagementPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/MainLayout.tsx`
- Modify: `frontend/src/pages/UsersPage.tsx`

**Interfaces:**
- Consumes: `accessRequestsApi`, `invitationsApi` from Task 7.
- Produces: `/access-requests` admin page with `pageKey: 'access-requests'`; an "Invite User" dialog on the Users page.

- [ ] **Step 1: Create the admin management page**

Create `frontend/src/pages/AccessRequestsManagementPage.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { accessRequestsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/dateUtils';
import { toast } from 'sonner';

interface AccessRequest {
    id: string;
    requestNumber: number;
    name: string;
    email: string;
    phone?: string;
    stadium: { id: string; name: string };
    department: { id: string; name: string; code?: string };
    source: 'sso' | 'invite';
    status: string;
    reviewNotes?: string;
    reviewedBy?: { id: string; name: string };
    reviewedAt?: string;
    createdAt: string;
}

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' {
    if (status === 'Approved') return 'default';
    if (status === 'Rejected') return 'destructive';
    return 'secondary';
}

export function AccessRequestsManagementPage() {
    const { user } = useAuthStore();
    const canManage = user?.role === 'SuperAdmin' || user?.role === 'Admin';

    const [loading, setLoading] = useState(true);
    const [requests, setRequests] = useState<AccessRequest[]>([]);
    const [statusFilter, setStatusFilter] = useState('Pending');
    const [selected, setSelected] = useState<AccessRequest | null>(null);
    const [reviewNotes, setReviewNotes] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [confirmAction, setConfirmAction] = useState<'approve' | 'reject' | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const res = await accessRequestsApi.getAll({ status: statusFilter || undefined });
            setRequests(res.data?.data || []);
        } catch {
            toast.error('Failed to load access requests');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [statusFilter]);

    const handleReview = async () => {
        if (!selected || !confirmAction) return;
        setActionLoading(true);
        try {
            if (confirmAction === 'approve') {
                await accessRequestsApi.approve(selected.id, reviewNotes || undefined);
                toast.success('Request approved — the user can now sign in with their SC/LOC account.');
            } else {
                await accessRequestsApi.reject(selected.id, reviewNotes || undefined);
                toast.success('Request rejected');
            }
            setSelected(null);
            setConfirmAction(null);
            setReviewNotes('');
            load();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Action failed');
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Account Access Requests</h1>
                <div className="flex items-center gap-2">
                    {['Pending', 'Approved', 'Rejected', ''].map(s => (
                        <Button
                            key={s || 'all'}
                            variant={statusFilter === s ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setStatusFilter(s)}
                        >
                            {s || 'All'}
                        </Button>
                    ))}
                    <Button variant="outline" size="icon" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
                </div>
            </div>

            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableCell>#</TableCell>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Venue</TableHead>
                                    <TableHead>Department</TableHead>
                                    <TableHead>Source</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Submitted</TableHead>
                                    {canManage && <TableHead>Actions</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {requests.map(r => (
                                    <TableRow key={r.id}>
                                        <TableCell>{r.requestNumber}</TableCell>
                                        <TableCell>{r.name}</TableCell>
                                        <TableCell>{r.email}</TableCell>
                                        <TableCell>{r.stadium?.name}</TableCell>
                                        <TableCell>{r.department?.name}</TableCell>
                                        <TableCell className="capitalize">{r.source}</TableCell>
                                        <TableCell><Badge variant={statusBadgeVariant(r.status)}>{r.status}</Badge></TableCell>
                                        <TableCell>{formatDate(r.createdAt)}</TableCell>
                                        {canManage && (
                                            <TableCell className="space-x-2">
                                                {r.status === 'Pending' && (
                                                    <>
                                                        <Button size="sm" variant="outline" onClick={() => { setSelected(r); setConfirmAction('approve'); }}>
                                                            <CheckCircle className="w-4 h-4" />
                                                        </Button>
                                                        <Button size="sm" variant="outline" onClick={() => { setSelected(r); setConfirmAction('reject'); }}>
                                                            <XCircle className="w-4 h-4" />
                                                        </Button>
                                                    </>
                                                )}
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                                {requests.length === 0 && (
                                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No requests found</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={Boolean(selected && confirmAction)} onOpenChange={(open) => { if (!open) { setSelected(null); setConfirmAction(null); } }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{confirmAction === 'approve' ? 'Approve' : 'Reject'} request</DialogTitle>
                        <DialogDescription>
                            {selected?.name} — {selected?.department?.name} at {selected?.stadium?.name}
                        </DialogDescription>
                    </DialogHeader>
                    <Textarea
                        placeholder="Notes (optional)"
                        value={reviewNotes}
                        onChange={e => setReviewNotes(e.target.value)}
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setSelected(null); setConfirmAction(null); }}>Cancel</Button>
                        <Button onClick={handleReview} disabled={actionLoading}>
                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : confirmAction === 'approve' ? 'Approve' : 'Reject'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
```

- [ ] **Step 2: Register the route and nav item**

In `frontend/src/App.tsx`, add the lazy import:

```typescript
const AccessRequestsManagementPage = lazy(() => import('@/pages/AccessRequestsManagementPage').then(m => ({ default: m.AccessRequestsManagementPage })));
```

Add the route inside the `PageGuard`-wrapped block, near `/requests`:

```typescript
                                    <Route path="/access-requests" element={<PageGuard pageKey="access-requests"><AccessRequestsManagementPage /></PageGuard>} />
```

In `frontend/src/components/layout/MainLayout.tsx`, add `UserPlus` to the lucide-react import list, and add a nav item after `Requests`:

```typescript
    { name: 'Account Access', href: '/access-requests', icon: UserPlus, roles: ['SuperAdmin', 'Admin'], pageKey: 'access-requests' },
```

- [ ] **Step 3: Add "Invite User" to `UsersPage.tsx`**

In `frontend/src/pages/UsersPage.tsx`, add the import:

```typescript
import { invitationsApi } from '@/lib/api';
```

(add `invitationsApi` to the existing `import { usersApi, stadiumsApi, departmentsApi, requestsApi, warningsApi } from '@/lib/api';` line instead of a separate import)

Add state near the other dialog state (top of the component):

```typescript
    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteStadiumId, setInviteStadiumId] = useState('');
    const [inviteDepartmentId, setInviteDepartmentId] = useState('');
    const [inviteSubmitting, setInviteSubmitting] = useState(false);
```

Add the handler near the other submit handlers:

```typescript
    const handleInvite = async () => {
        if (!inviteEmail) {
            toast.error('Email is required');
            return;
        }
        setInviteSubmitting(true);
        try {
            await invitationsApi.create({
                email: inviteEmail,
                stadiumId: inviteStadiumId || undefined,
                departmentId: inviteDepartmentId || undefined,
            });
            toast.success('Invitation sent');
            setInviteOpen(false);
            setInviteEmail('');
            setInviteStadiumId('');
            setInviteDepartmentId('');
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to send invitation');
        } finally {
            setInviteSubmitting(false);
        }
    };
```

Add the button next to the existing "Add User" button (around line 535):

```typescript
                            <Button variant="outline" onClick={() => setInviteOpen(true)} className="h-9">
                                <UserPlus className="w-4 h-4 mr-2" /> Invite User
                            </Button>
```

Add the dialog near the other `<Dialog>` blocks:

```typescript
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogContent className="max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">Invite a user</DialogTitle>
                        <DialogDescription>
                            Sends a link to their email. They'll fill in the same access-request form you'd see from the Microsoft sign-in flow.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="inviteEmail">Email</Label>
                            <Input id="inviteEmail" type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Venue (optional pre-fill)</Label>
                            <Select value={inviteStadiumId} onValueChange={setInviteStadiumId}>
                                <SelectTrigger><SelectValue placeholder="Let the user choose" /></SelectTrigger>
                                <SelectContent>
                                    {stadiums.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                        <Button onClick={handleInvite} disabled={inviteSubmitting}>
                            {inviteSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Invite'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
```

(This reuses the page's existing `stadiums` state array — confirm it's already loaded on mount, as it is for the "Add User" dialog's own venue picker; if the existing variable name differs, match it exactly rather than introducing a second fetch.)

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual smoke test**

Log in as SuperAdmin on the local dev stack. Navigate to Users → "Invite User" → send an invite to a test email → check MailHog for the email and link. Open the link (`/access-request?invite=<token>`) in a new browser tab → confirm the email field is pre-filled and locked → submit → confirm it appears under Account Access (new nav item) as Pending, scoped correctly. Approve it → confirm a new `User` row exists (check via Users page) with `role: FA` and the chosen department, and that the invite shows as "Used" if re-opened.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AccessRequestsManagementPage.tsx frontend/src/App.tsx frontend/src/components/layout/MainLayout.tsx frontend/src/pages/UsersPage.tsx
git commit -m "feat(frontend): Account Access admin page, nav item, Invite User dialog"
```

---

### Task 12: Full verification pass + Azure runbook addendum

**Files:**
- Modify: `docs/deployment/GCMS-Azure-Deployment-Runbook.md`

**Interfaces:** none (documentation + verification only).

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && npx vitest run`
Expected: all tests pass, including the new `microsoft-auth.service.test.ts` and `invitation-validity.test.ts` (existing suite was last confirmed at 60 passing tests — should now be 60 + 9 new).

- [ ] **Step 2: Run both typechecks**

Run: `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit`
Expected: no errors in either.

- [ ] **Step 3: End-to-end manual pass on the local Docker Desktop stack**

Exercise, in order, against `http://localhost:3000`:
1. Invitation flow end-to-end (repeat of Task 11 Step 5 if not already just done).
2. Admin-created account with forced password change (repeat of Task 10 Step 5 if not already just done).
3. `/access-request` reachable directly with no invite/SSO state (name field empty/editable, email field empty/editable — confirms the page doesn't crash without route state, since the real SSO round-trip can't be tested locally).
4. Confirm an FA user created via either flow can log in (after Task 10/11 checks) and sees only their own department's fleet on `/fleet` (existing FA-scoping behavior, unchanged by this feature).

Document any gap found as a follow-up rather than silently skipping it.

- [ ] **Step 4: Update the Azure runbook**

In `docs/deployment/GCMS-Azure-Deployment-Runbook.md`, add a new dated section (append, following the existing addendum style):

```markdown
## 2026-09-14 addendum — User Onboarding & Access Control

New Prisma migration needed on the dev MySQL server (same VNet-access blocker as
prior addenda — needs `prisma db push` run from a machine inside
`vnet-gcms-dev-qc-001`):
- `User`: `authProvider` (String, default "local"), `microsoftOid` (String?, unique),
  `mustChangePassword` (Boolean, default false).
- New tables: `AccessRequest`, `Invitation`.

New app settings needed once Ahmed's Entra ID App Registration is ready (backend
`app-gcms-be-dev-qc-001` and frontend `app-gcms-fe-dev-qc-001` — frontend ones are
build-time `VITE_` vars, so they need a rebuild, not just an app-setting change):
- Backend: `MSAL_TENANT_ID`, `MSAL_CLIENT_ID`, `FRONTEND_URL` (already resolvable —
  it's the frontend hostname documented in the 2026-09-14 (session 4) addendum).
- Frontend build: `VITE_MSAL_TENANT_ID`, `VITE_MSAL_CLIENT_ID`.

Redirect URI is unchanged from what was already sent to Ahmed:
`https://app-gcms-fe-dev-qc-001-hvdabbawhjcnfhc0.qatarcentral-01.azurewebsites.net/auth/microsoft/callback`.

This code is committed and pushed to `feature/pool-booking-system`, joining the
existing not-yet-deployed batch (Instant Booking, SSH/SMTP fixes) — same image
rebuild + `prisma db push` gap documented in the 2026-09-14 (session 4) addenda above.
```

- [ ] **Step 5: Commit**

```bash
git add docs/deployment/GCMS-Azure-Deployment-Runbook.md
git commit -m "docs: Azure runbook addendum for user onboarding & access control"
```

- [ ] **Step 6: Push the branch**

```bash
git push origin feature/pool-booking-system
```

---

## Self-Review Notes

- **Spec coverage:** §4 (data model) → Task 1; §5 backend (`access-requests`, `invitations`, auth changes, `users.service`) → Tasks 2–6; §6 frontend (login button, callback route, access-request page, admin page, invite dialog, forced password change) → Tasks 7–11; §7 (error handling — dedupe pending requests, active-venue/department re-check, invitation validity, generic SSO failure toast) → covered inline in Tasks 4–5, 8–9; §8 (testing) → pure-logic unit tests in Tasks 2–3, full-suite + typecheck + manual E2E in Task 12; §9 (Azure follow-up) → Task 12 Step 4.
- **Not yet automatable:** the actual MSAL browser redirect round-trip against a real Entra tenant — no Tenant/Client ID exists yet. Every task that touches it says so explicitly rather than claiming it's verified.
