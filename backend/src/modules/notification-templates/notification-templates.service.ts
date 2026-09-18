import { prisma } from '../../config/database';

export interface RenderedEmail {
    subject: string;
    body: string;
}

export interface RenderedPush {
    title: string;
    message: string;
}

export interface DefaultTemplate {
    key: string;
    name: string;
    category: string;
    description: string;
    variables: string[];
    emailEnabled: boolean;
    emailSubject: string | null;
    emailBody: string | null;
    pushEnabled: boolean;
    pushTitle: string | null;
    pushMessage: string | null;
}

/**
 * Every template's built-in default content — this is what ships in the product
 * and what a fresh install seeds into NotificationTemplate. Admins edit the DB
 * rows from System Settings; this array is never read again once a row exists,
 * except by resetToDefault().
 */
export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
    {
        key: 'request_window_opened',
        name: 'Request Window Opened',
        category: 'System',
        description: 'Sent to every active FA when a SuperAdmin announces the request window is open (Settings → Request Window → Announce).',
        variables: ['closesLine', 'requestUrl'],
        emailEnabled: true,
        emailSubject: 'Requirement collection is now open',
        emailBody: 'The GCMS request window is now open.{{closesLine}}\n\nSubmit at: {{requestUrl}}',
        pushEnabled: true,
        pushTitle: 'Requirement collection is now open',
        pushMessage: 'The request window is open.{{closesLine}}',
    },
    {
        key: 'car_request_approved',
        name: 'Car Request Approved',
        category: 'Requests',
        description: 'Sent to the requester when an Admin/SuperAdmin approves their car request.',
        variables: ['stadiumName', 'departmentName', 'cargoCount', 'fourSeaterCount', 'sixSeaterCount', 'accessibilityCount', 'reviewNotesLine'],
        emailEnabled: true,
        emailSubject: 'Car Request Approved',
        emailBody:
            'Your car request has been approved.\n\nRequest Details:\n- Stadium: {{stadiumName}}\n- Department: {{departmentName}}\n- Carts Requested: {{cargoCount}} Cargo, {{fourSeaterCount}} 4-Seater, {{sixSeaterCount}} 6-Seater, {{accessibilityCount}} Accessibility\n{{reviewNotesLine}}',
        pushEnabled: false,
        pushTitle: null,
        pushMessage: null,
    },
    {
        key: 'car_request_rejected',
        name: 'Car Request Rejected',
        category: 'Requests',
        description: 'Sent to the requester when an Admin/SuperAdmin rejects their car request.',
        variables: ['stadiumName', 'departmentName', 'reviewNotesLine'],
        emailEnabled: true,
        emailSubject: 'Car Request Rejected',
        emailBody: 'Your car request has been rejected.\n\nRequest Details:\n- Stadium: {{stadiumName}}\n- Department: {{departmentName}}\n{{reviewNotesLine}}',
        pushEnabled: false,
        pushTitle: null,
        pushMessage: null,
    },
    {
        key: 'car_request_more_info',
        name: 'Car Request — More Info Needed',
        category: 'Requests',
        description: 'Sent when an Admin/SuperAdmin emails the requester asking for more information.',
        variables: ['requesterName', 'message'],
        emailEnabled: true,
        emailSubject: 'More information needed on your car request',
        emailBody:
            'Hello {{requesterName}},\n\nThe Logistics team needs more information about your car request:\n\n{{message}}\n\nPlease reply to this email with the details.\n\nThank you,\nGCMS',
        pushEnabled: false,
        pushTitle: null,
        pushMessage: null,
    },
    {
        key: 'pool_booking_approved',
        name: 'Pool Booking Approved',
        category: 'Bookings',
        description: 'Sent/notified to the requester when an Admin/SuperAdmin approves their pool booking (Single, Daily, Recurring or Instant).',
        variables: ['carNumber', 'stadiumName', 'requesterName', 'approvedInstructionsBlock', 'reviewCommentLine', 'instantWarningLine'],
        emailEnabled: true,
        emailSubject: 'Pool booking approved: {{carNumber}}',
        emailBody:
            'Hello {{requesterName}},\n\nYour pool booking for {{carNumber}} at {{stadiumName}} has been approved.{{approvedInstructionsBlock}}{{reviewCommentLine}}\n\nThank you,\nGCMS',
        pushEnabled: true,
        pushTitle: 'Pool Booking Approved',
        pushMessage:
            'Your pool booking for {{carNumber}} at {{stadiumName}} was approved — collect the key and return the car to the charging station when done.{{instantWarningLine}}',
    },
    {
        key: 'pool_booking_rejected',
        name: 'Pool Booking Rejected',
        category: 'Bookings',
        description: 'Sent/notified to the requester when an Admin/SuperAdmin rejects their pool booking.',
        variables: ['carNumber', 'stadiumName', 'requesterName', 'reviewCommentLine'],
        emailEnabled: true,
        emailSubject: 'Pool booking rejected: {{carNumber}}',
        emailBody: 'Hello {{requesterName}},\n\nYour pool booking for {{carNumber}} at {{stadiumName}} has been rejected.{{reviewCommentLine}}\n\nThank you,\nGCMS',
        pushEnabled: true,
        pushTitle: 'Pool Booking Rejected',
        pushMessage: 'Your pool booking for {{carNumber}} at {{stadiumName}} was rejected',
    },
    {
        key: 'instant_booking_auto_cancelled',
        name: 'Instant Booking Auto-Cancelled',
        category: 'Bookings',
        description: 'Sent/notified when an approved instant booking is auto-cancelled because the key was not collected within the 10-minute window.',
        variables: ['carNumber', 'stadiumName', 'requesterName', 'collectionWindowMinutes'],
        emailEnabled: true,
        emailSubject: 'Instant booking cancelled: {{carNumber}}',
        emailBody:
            "Hello {{requesterName}},\n\nYour instant booking for {{carNumber}} at {{stadiumName}} was cancelled because the key was not collected within {{collectionWindowMinutes}} minutes of approval. The car has returned to the pool due to demand from other users. You're welcome to submit a new request.\n\nThank you,\nGCMS",
        pushEnabled: true,
        pushTitle: 'Instant booking auto-cancelled',
        pushMessage: '{{carNumber}} instant booking for {{requesterName}} was auto-cancelled (key not collected in time) and returned to the pool at {{stadiumName}}.',
    },
    {
        key: 'account_created',
        name: 'Account Created',
        category: 'Accounts',
        description: 'Sent to a new user when a SuperAdmin/Admin creates their account, with a temporary password.',
        variables: ['name', 'email', 'tempPassword', 'loginUrl'],
        emailEnabled: true,
        emailSubject: 'Your GCMS account has been created',
        emailBody:
            "Hello {{name}},\n\nAn account has been created for you on GCMS.\n\nEmail: {{email}}\nTemporary password: {{tempPassword}}\n\nSign in at {{loginUrl}} — you'll be asked to set a new password on first login.\n\nThank you,\nGCMS",
        pushEnabled: false,
        pushTitle: null,
        pushMessage: null,
    },
    {
        key: 'account_linked_microsoft',
        name: 'Account Linked to Microsoft',
        category: 'Accounts',
        description: "Sent once, the first time a user's account is linked to sign in with their SC/LOC Microsoft account.",
        variables: ['name', 'email'],
        emailEnabled: true,
        emailSubject: 'Your GCMS account is now linked to your SC/LOC Microsoft account',
        emailBody:
            "Hello {{name}},\n\nYour GCMS account ({{email}}) has just been linked to sign in with your SC/LOC Microsoft account. If this wasn't you, please contact your administrator immediately.\n\nThank you,\nGCMS",
        pushEnabled: false,
        pushTitle: null,
        pushMessage: null,
    },
    {
        key: 'invitation_sent',
        name: 'Invitation Sent',
        category: 'Accounts',
        description: 'Sent when an Admin/SuperAdmin invites someone to request GCMS access by email.',
        variables: ['inviteLink'],
        emailEnabled: true,
        emailSubject: "You're invited to GCMS",
        emailBody: "Hello,\n\nYou've been invited to request access to GCMS. Click the link below to get started:\n\n{{inviteLink}}\n\nThis link expires in 7 days.\n\nThank you,\nGCMS",
        pushEnabled: false,
        pushTitle: null,
        pushMessage: null,
    },
    {
        key: 'password_reset',
        name: 'Password Reset',
        category: 'Accounts',
        description: 'Sent when a user requests a password reset link.',
        variables: ['resetUrl'],
        emailEnabled: true,
        emailSubject: 'Password Reset Request',
        emailBody: 'You requested a password reset. Please click here: {{resetUrl}}\n\nThis link will expire in 1 hour.\n\nIf you did not request this, please ignore this email.',
        pushEnabled: false,
        pushTitle: null,
        pushMessage: null,
    },
    {
        key: 'incident_escalated',
        name: 'Incident Escalated',
        category: 'Incidents',
        description: 'Sent/notified to Contracts/MaintenanceTeam when an incident is escalated to them. The full incident PDF is attached to the email separately.',
        variables: ['reference', 'incidentTitle', 'carLine'],
        emailEnabled: true,
        emailSubject: 'Incident escalated — {{reference}}',
        emailBody: 'An incident has been escalated to your team for follow-up.\n\n{{incidentTitle}}{{carLine}}\nReference: {{reference}}\n\nThe full report is attached.',
        pushEnabled: true,
        pushTitle: 'Incident escalated — {{reference}}',
        pushMessage: '{{incidentTitle}}{{carLine}} escalated for follow-up.',
    },
    {
        key: 'warning_notice',
        name: 'Warning Notice',
        category: 'Incidents',
        description: 'Sent/notified to a user when a level-based warning notice is issued against them. The warning PDF is attached to the email separately.',
        variables: ['reference', 'level', 'reason', 'blockedLine'],
        emailEnabled: true,
        emailSubject: 'Warning notice {{reference}} — Level {{level}}',
        emailBody: 'A level {{level}} warning ({{reference}}) has been issued to you.\n\nReason: {{reason}}\n{{blockedLine}}\n— GCMS',
        pushEnabled: true,
        pushTitle: 'Warning issued — Level {{level}}',
        pushMessage: '{{reason}}',
    },
    {
        key: 'handover_checkin',
        name: 'Handover — Cart Usage Started',
        category: 'Handover',
        description: 'In-app notification to Admin/SuperAdmin when a cart is checked in for handover. No email is sent for this event.',
        variables: ['carNumber'],
        emailEnabled: false,
        emailSubject: null,
        emailBody: null,
        pushEnabled: true,
        pushTitle: 'Cart Usage Started',
        pushMessage: '{{carNumber}} checked in by assigned user.',
    },
    {
        key: 'handover_checkout',
        name: 'Handover — Cart Usage Ended',
        category: 'Handover',
        description: 'In-app notification to Admin/SuperAdmin when a cart is checked out at the end of handover. No email is sent for this event.',
        variables: ['carNumber', 'status'],
        emailEnabled: false,
        emailSubject: null,
        emailBody: null,
        pushEnabled: true,
        pushTitle: 'Cart Usage Ended',
        pushMessage: '{{carNumber}} checked out by user. Status: {{status}}.',
    },
];

function substitute(text: string, vars: Record<string, string>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, name) => (name in vars ? vars[name] : match));
}

export class NotificationTemplatesService {
    /** Idempotent — called once at server startup. Inserts any default whose key isn't in the DB yet; never overwrites an admin's edits. */
    async seedDefaults() {
        for (const t of DEFAULT_TEMPLATES) {
            const existing = await prisma.notificationTemplate.findUnique({ where: { key: t.key } });
            if (existing) continue;
            await prisma.notificationTemplate.create({
                data: {
                    key: t.key,
                    name: t.name,
                    category: t.category,
                    description: t.description,
                    variables: JSON.stringify(t.variables),
                    emailEnabled: t.emailEnabled,
                    emailSubject: t.emailSubject,
                    emailBody: t.emailBody,
                    pushEnabled: t.pushEnabled,
                    pushTitle: t.pushTitle,
                    pushMessage: t.pushMessage,
                },
            });
        }
    }

    async list() {
        return prisma.notificationTemplate.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] });
    }

    async getByKey(key: string) {
        return prisma.notificationTemplate.findUnique({ where: { key } });
    }

    async update(
        key: string,
        data: Partial<{
            emailEnabled: boolean;
            emailSubject: string | null;
            emailBody: string | null;
            pushEnabled: boolean;
            pushTitle: string | null;
            pushMessage: string | null;
        }>,
        updatedById?: string,
    ) {
        return prisma.notificationTemplate.update({ where: { key }, data: { ...data, updatedById } });
    }

    /** Resets one template back to its shipped default content. */
    async resetToDefault(key: string, updatedById?: string) {
        const def = DEFAULT_TEMPLATES.find((t) => t.key === key);
        if (!def) throw new Error('Unknown template key');
        return prisma.notificationTemplate.update({
            where: { key },
            data: {
                emailEnabled: def.emailEnabled,
                emailSubject: def.emailSubject,
                emailBody: def.emailBody,
                pushEnabled: def.pushEnabled,
                pushTitle: def.pushTitle,
                pushMessage: def.pushMessage,
                updatedById,
            },
        });
    }

    /** Renders the email for `key` with `vars` substituted, or null when disabled/not an email event. */
    async renderEmail(key: string, vars: Record<string, string>): Promise<RenderedEmail | null> {
        const t = await this.getByKey(key);
        if (!t || !t.emailEnabled || !t.emailSubject || !t.emailBody) return null;
        return { subject: substitute(t.emailSubject, vars), body: substitute(t.emailBody, vars) };
    }

    /** Renders the push/in-app notification for `key` with `vars` substituted, or null when disabled. */
    async renderPush(key: string, vars: Record<string, string>): Promise<RenderedPush | null> {
        const t = await this.getByKey(key);
        if (!t || !t.pushEnabled || !t.pushTitle || !t.pushMessage) return null;
        return { title: substitute(t.pushTitle, vars), message: substitute(t.pushMessage, vars) };
    }
}

export const notificationTemplatesService = new NotificationTemplatesService();
