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
