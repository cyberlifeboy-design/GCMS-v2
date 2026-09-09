export type HandoverPhase = 'handover' | 'handover-done' | 'handback' | 'complete';

const PHASE_BY_STATUS: Record<string, HandoverPhase> = {
  PENDING: 'handover',
  ADMIN_SIGNED: 'handover',
  COMPLETE: 'handover-done',
  HANDBACK_PENDING: 'handback',
  RETURNED: 'complete',
};

/** Which of the two steps the form is on. Unknown status falls back to 'handover'. */
export function deriveHandoverPhase(status: string): HandoverPhase {
  return PHASE_BY_STATUS[status] ?? 'handover';
}

/** A handover form may still be created or admin/user-signed only before it is COMPLETE. */
export function canCreateOrSignHandover(status: string | null | undefined): boolean {
  if (!status) return true;
  return status === 'PENDING' || status === 'ADMIN_SIGNED';
}
