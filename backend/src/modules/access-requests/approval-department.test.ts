import { describe, it, expect } from 'vitest';
import { resolveApprovalDepartment } from './approval-department';

describe('resolveApprovalDepartment', () => {
  it('defaults to the requested department when no override is given', () => {
    expect(resolveApprovalDepartment('dept-1', 'stad-1', null)).toEqual({ departmentId: 'dept-1' });
    expect(resolveApprovalDepartment('dept-1', 'stad-1', undefined)).toEqual({ departmentId: 'dept-1' });
  });

  it('accepts an override that belongs to the same active venue', () => {
    const override = { id: 'dept-2', stadiumId: 'stad-1', isActive: true };
    expect(resolveApprovalDepartment('dept-1', 'stad-1', override)).toEqual({ departmentId: 'dept-2' });
  });

  it('rejects an override department from a different venue', () => {
    const override = { id: 'dept-2', stadiumId: 'stad-OTHER', isActive: true };
    const result = resolveApprovalDepartment('dept-1', 'stad-1', override);
    expect('error' in result && result.error).toBe('DEPARTMENT_WRONG_VENUE');
  });

  it('rejects an inactive override department', () => {
    const override = { id: 'dept-2', stadiumId: 'stad-1', isActive: false };
    const result = resolveApprovalDepartment('dept-1', 'stad-1', override);
    expect('error' in result && result.error).toBe('DEPARTMENT_NOT_ACTIVE');
  });
});
