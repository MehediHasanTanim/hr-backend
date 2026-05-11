import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { ForbiddenError } from '@hr/shared';
import { buildRequestContext } from '@/__mocks__/factories';
import { PermissionsGuard } from '../guards/permissions.guard';

type RequiredPermission = Array<{ resource: string; action: string }>;

function buildCtx(userPermissions: string[]): ExecutionContext {
  return {
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user: buildRequestContext({ permissions: userPermissions }) }),
    }),
  } as unknown as ExecutionContext;
}

function buildCtxWithoutUser(): ExecutionContext {
  return {
    getHandler: () => vi.fn(),
    getClass: () => vi.fn(),
    switchToHttp: () => ({
      getRequest: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

let guard: PermissionsGuard;
let reflector: { getAllAndOverride: ReturnType<typeof vi.fn> };

beforeEach(() => {
  reflector = { getAllAndOverride: vi.fn() };
  guard = new PermissionsGuard(reflector as unknown as Reflector);
});

describe('PermissionsGuard', () => {
  describe('no @Permissions() decorator', () => {
    it('returns true when no permissions are required', () => {
      reflector.getAllAndOverride.mockReturnValue(null);

      expect(guard.canActivate(buildCtx([]))).toBe(true);
    });

    it('returns true when @Permissions() is applied with an empty array', () => {
      reflector.getAllAndOverride.mockReturnValue([]);

      expect(guard.canActivate(buildCtx(['employee:read']))).toBe(true);
    });
  });

  describe('Admin role company-scope permissions', () => {
    const adminPermissions = [
      'employee:read',
      'employee:write',
      'employee:delete',
      'payroll:read',
      'payroll:write',
      'payroll:approve',
      'leave:read',
      'leave:write',
      'leave:approve',
      'attendance:read',
      'attendance:write',
      'admin:read',
      'admin:write',
      'report:read',
      'report:export',
    ];

    it('passes when Admin user has the required employee:write permission', () => {
      reflector.getAllAndOverride.mockReturnValue([{ resource: 'employee', action: 'write' }]);

      expect(guard.canActivate(buildCtx(adminPermissions))).toBe(true);
    });

    it('passes when Admin user has all required permissions', () => {
      const required: RequiredPermission = [
        { resource: 'payroll', action: 'approve' },
        { resource: 'report', action: 'export' },
      ];
      reflector.getAllAndOverride.mockReturnValue(required);

      expect(guard.canActivate(buildCtx(adminPermissions))).toBe(true);
    });
  });

  describe('Employee role self-scope permissions', () => {
    const employeePermissions = ['employee:read'];

    it('throws ForbiddenError when Employee attempts company-scope employee write', () => {
      reflector.getAllAndOverride.mockReturnValue([{ resource: 'employee', action: 'write' }]);

      expect(() => guard.canActivate(buildCtx(employeePermissions))).toThrow(ForbiddenError);
    });

    it('throws ForbiddenError when Employee attempts payroll approval', () => {
      reflector.getAllAndOverride.mockReturnValue([{ resource: 'payroll', action: 'approve' }]);

      expect(() => guard.canActivate(buildCtx(employeePermissions))).toThrow(ForbiddenError);
    });

    it('passes when Employee accesses a read endpoint they have permission for', () => {
      reflector.getAllAndOverride.mockReturnValue([{ resource: 'employee', action: 'read' }]);

      expect(guard.canActivate(buildCtx(employeePermissions))).toBe(true);
    });

    it('throws ForbiddenError when user has zero permissions', () => {
      reflector.getAllAndOverride.mockReturnValue([{ resource: 'employee', action: 'read' }]);

      expect(() => guard.canActivate(buildCtx([]))).toThrow(ForbiddenError);
    });

    it('throws ForbiddenError when request has no user context', () => {
      reflector.getAllAndOverride.mockReturnValue([{ resource: 'employee', action: 'read' }]);

      expect(() => guard.canActivate(buildCtxWithoutUser())).toThrow(ForbiddenError);
    });
  });

  describe('Manager role department-scope permissions', () => {
    const managerPermissions = [
      'employee:read',
      'employee:write',
      'leave:read',
      'leave:approve',
      'attendance:read',
      'attendance:write',
      'report:read',
    ];

    it('passes when Manager has leave:approve permission', () => {
      reflector.getAllAndOverride.mockReturnValue([{ resource: 'leave', action: 'approve' }]);

      expect(guard.canActivate(buildCtx(managerPermissions))).toBe(true);
    });

    it('throws ForbiddenError when Manager attempts payroll:approve', () => {
      reflector.getAllAndOverride.mockReturnValue([{ resource: 'payroll', action: 'approve' }]);

      expect(() => guard.canActivate(buildCtx(managerPermissions))).toThrow(ForbiddenError);
    });

    it('throws ForbiddenError when Manager attempts admin:write', () => {
      reflector.getAllAndOverride.mockReturnValue([{ resource: 'admin', action: 'write' }]);

      expect(() => guard.canActivate(buildCtx(managerPermissions))).toThrow(ForbiddenError);
    });

    it('passes when Manager meets all required permissions', () => {
      reflector.getAllAndOverride.mockReturnValue([
        { resource: 'leave', action: 'approve' },
        { resource: 'attendance', action: 'write' },
      ]);

      expect(guard.canActivate(buildCtx(managerPermissions))).toBe(true);
    });

    it('throws ForbiddenError when Manager has only some required permissions', () => {
      reflector.getAllAndOverride.mockReturnValue([
        { resource: 'leave', action: 'approve' },
        { resource: 'payroll', action: 'approve' },
      ]);

      expect(() => guard.canActivate(buildCtx(managerPermissions))).toThrow(ForbiddenError);
    });
  });
});
