export type ApprovalDepartmentResolution =
  | { departmentId: string }
  | { error: string };

/**
 * Approving an access request lets the reviewer confirm or change the department
 * the requester picked, defaulting to what was requested. An override must belong
 * to the same venue and still be active — never trust a client-supplied id blindly.
 */
export function resolveApprovalDepartment(
  requestedDepartmentId: string,
  expectedStadiumId: string,
  override: { id: string; stadiumId: string; isActive: boolean } | null | undefined
): ApprovalDepartmentResolution {
  if (!override) return { departmentId: requestedDepartmentId };
  if (override.stadiumId !== expectedStadiumId) return { error: 'DEPARTMENT_WRONG_VENUE' };
  if (!override.isActive) return { error: 'DEPARTMENT_NOT_ACTIVE' };
  return { departmentId: override.id };
}
