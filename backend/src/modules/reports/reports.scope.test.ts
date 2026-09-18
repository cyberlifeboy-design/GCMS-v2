import { describe, it, expect } from 'vitest';
import { resolveStadiumScope, NO_STADIUM_SENTINEL, resolveDepartmentScope, NO_DEPARTMENT_SENTINEL } from './reports.scope';

describe('resolveStadiumScope', () => {
  it('forces Admin to their own stadium and ignores the requested value', () => {
    expect(resolveStadiumScope({ role: 'Admin', stadiumId: 'S1' }, 'S2')).toBe('S1');
  });

  it('forces FA to their own stadium and ignores the requested value', () => {
    expect(resolveStadiumScope({ role: 'FA', stadiumId: 'S9' }, undefined)).toBe('S9');
  });

  it('returns the NONE sentinel for an Admin with no stadium', () => {
    expect(resolveStadiumScope({ role: 'Admin', stadiumId: null }, 'S2')).toBe(NO_STADIUM_SENTINEL);
  });

  it('lets SuperAdmin see all venues when no stadium requested', () => {
    expect(resolveStadiumScope({ role: 'SuperAdmin' }, undefined)).toBeUndefined();
    expect(resolveStadiumScope({ role: 'SuperAdmin' }, '')).toBeUndefined();
  });

  it('honours the requested stadium for SuperAdmin / Observer / Contracts / MaintenanceTeam', () => {
    for (const role of ['SuperAdmin', 'Observer', 'Contracts', 'MaintenanceTeam']) {
      expect(resolveStadiumScope({ role }, 'S3')).toBe('S3');
    }
  });

  it('ignores non-string requested values for privileged roles', () => {
    expect(resolveStadiumScope({ role: 'Observer' }, ['S3'] as unknown)).toBeUndefined();
    expect(resolveStadiumScope({ role: 'Observer' }, 123 as unknown)).toBeUndefined();
  });

  it('never throws on undefined user', () => {
    expect(resolveStadiumScope(undefined, 'S1')).toBeUndefined();
  });
});

describe('resolveDepartmentScope', () => {
  it('forces FA to their own department and ignores the requested value', () => {
    expect(resolveDepartmentScope({ role: 'FA', departmentId: 'D1' }, 'D2')).toBe('D1');
  });

  it('returns the NONE sentinel for an FA with no department', () => {
    expect(resolveDepartmentScope({ role: 'FA', departmentId: null }, 'D2')).toBe(NO_DEPARTMENT_SENTINEL);
  });

  it('lets non-FA roles see every department when none requested', () => {
    for (const role of ['SuperAdmin', 'Admin', 'Observer', 'Contracts', 'MaintenanceTeam']) {
      expect(resolveDepartmentScope({ role }, undefined)).toBeUndefined();
    }
  });

  it('honours an explicit requested department for non-FA roles', () => {
    expect(resolveDepartmentScope({ role: 'Admin' }, 'D3')).toBe('D3');
  });

  it('ignores non-string requested values', () => {
    expect(resolveDepartmentScope({ role: 'Admin' }, ['D3'] as unknown)).toBeUndefined();
  });

  it('never throws on undefined user', () => {
    expect(resolveDepartmentScope(undefined, 'D1')).toBeUndefined();
  });
});
