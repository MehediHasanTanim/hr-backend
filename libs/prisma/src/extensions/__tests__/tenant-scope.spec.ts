import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withTenantScope } from '../tenant-scope.extension';

type QueryArgs = Record<string, unknown>;
type QueryMock = ReturnType<typeof buildQueryMock>;
type AllOperationsHandler = (params: {
  model: string;
  operation: string;
  args: QueryArgs;
  query: QueryMock;
}) => Promise<unknown>;

function buildQueryMock<T = unknown>(returnValue: T = {} as T): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(returnValue);
}

function getHandler(companyId: string): AllOperationsHandler {
  const extension = withTenantScope(companyId);
  return (extension as unknown as {
    query: { $allModels: { $allOperations: AllOperationsHandler } };
  }).query.$allModels.$allOperations;
}

const COMPANY_A = 'company-a-uuid';
const COMPANY_B = 'company-b-uuid';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('withTenantScope() Prisma extension', () => {
  describe('READ operations on tenant-scoped models', () => {
    it.each(['findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy'])(
      'injects companyId and deletedAt:null into where clause for %s',
      async (operation) => {
        const query = buildQueryMock([]);

        await getHandler(COMPANY_A)({ model: 'Employee', operation, args: {}, query });

        expect(query).toHaveBeenCalledWith(expect.objectContaining({
          where: expect.objectContaining({ companyId: COMPANY_A, deletedAt: null }),
        }));
      },
    );

    it('preserves existing where conditions alongside injected tenant filters', async () => {
      const query = buildQueryMock([]);

      await getHandler(COMPANY_A)({
        model: 'Employee',
        operation: 'findMany',
        args: { where: { status: 'ACTIVE', departmentId: 'dept-001' } },
        query,
      });

      expect(query).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          departmentId: 'dept-001',
          companyId: COMPANY_A,
          deletedAt: null,
        }),
      }));
    });

    it('overwrites an attacker-supplied companyId in where with the scoped companyId', async () => {
      const query = buildQueryMock([]);

      await getHandler(COMPANY_A)({
        model: 'Employee',
        operation: 'findMany',
        args: { where: { companyId: COMPANY_B } },
        query,
      });

      const calledArgs = query.mock.calls[0]?.[0] as { where: { companyId: string } };
      expect(calledArgs.where.companyId).toBe(COMPANY_A);
    });

    it('handles findUnique and findUniqueOrThrow with companyId injection', async () => {
      await Promise.all(['findUnique', 'findUniqueOrThrow'].map(async (operation) => {
        const query = buildQueryMock(null);

        await getHandler(COMPANY_A)({
          model: 'Employee',
          operation,
          args: { where: { id: 'emp-001' } },
          query,
        });

        expect(query).toHaveBeenCalledWith(expect.objectContaining({
          where: expect.objectContaining({ id: 'emp-001', companyId: COMPANY_A, deletedAt: null }),
        }));
      }));
    });
  });

  describe('WRITE operations on tenant-scoped models', () => {
    it('injects companyId into where for update to prevent cross-tenant writes', async () => {
      const query = buildQueryMock({ id: 'emp-001' });

      await getHandler(COMPANY_A)({
        model: 'Employee',
        operation: 'update',
        args: { where: { id: 'emp-001' }, data: { status: 'INACTIVE' } },
        query,
      });

      expect(query).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: 'emp-001', companyId: COMPANY_A }),
      }));
    });

    it('injects companyId into where for updateMany', async () => {
      const query = buildQueryMock({ count: 5 });

      await getHandler(COMPANY_A)({
        model: 'Employee',
        operation: 'updateMany',
        args: { where: { departmentId: 'dept-001' }, data: { status: 'INACTIVE' } },
        query,
      });

      expect(query).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ departmentId: 'dept-001', companyId: COMPANY_A }),
      }));
    });

    it('injects companyId into where for delete', async () => {
      const query = buildQueryMock({ id: 'emp-001' });

      await getHandler(COMPANY_A)({
        model: 'Employee',
        operation: 'delete',
        args: { where: { id: 'emp-001' } },
        query,
      });

      expect(query).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: 'emp-001', companyId: COMPANY_A }),
      }));
    });

    it('injects companyId into where for deleteMany', async () => {
      const query = buildQueryMock({ count: 3 });

      await getHandler(COMPANY_A)({
        model: 'LeaveRequest',
        operation: 'deleteMany',
        args: { where: { status: 'REJECTED' } },
        query,
      });

      expect(query).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ status: 'REJECTED', companyId: COMPANY_A }),
      }));
    });
  });

  describe('CREATE operations on tenant-scoped models', () => {
    it('injects companyId into data for create', async () => {
      const query = buildQueryMock({ id: 'new-emp-001' });

      await getHandler(COMPANY_A)({
        model: 'Employee',
        operation: 'create',
        args: { data: { firstName: 'Alice', workEmail: 'alice@test.com' } },
        query,
      });

      expect(query).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ companyId: COMPANY_A }),
      }));
    });

    it('injects companyId into every item in createMany data array', async () => {
      const query = buildQueryMock({ count: 2 });

      await getHandler(COMPANY_A)({
        model: 'LeaveType',
        operation: 'createMany',
        args: { data: [{ name: 'Annual Leave' }, { name: 'Sick Leave' }] },
        query,
      });

      const calledArgs = query.mock.calls[0]?.[0] as { data: { companyId: string }[] };
      expect(calledArgs.data.map((item) => item.companyId)).toEqual([COMPANY_A, COMPANY_A]);
    });

    it('injects companyId into nested createMany data array shape', async () => {
      const query = buildQueryMock({ count: 2 });

      await getHandler(COMPANY_A)({
        model: 'LeaveType',
        operation: 'createMany',
        args: { data: { data: [{ name: 'Annual Leave' }, { name: 'Sick Leave' }] } },
        query,
      });

      const calledArgs = query.mock.calls[0]?.[0] as { data: { data: { companyId: string }[] } };
      expect(calledArgs.data.data.map((item) => item.companyId)).toEqual([COMPANY_A, COMPANY_A]);
    });

    it('injects companyId into upsert data', async () => {
      const query = buildQueryMock({ id: 'lt-001' });

      await getHandler(COMPANY_A)({
        model: 'LeaveType',
        operation: 'upsert',
        args: { where: { id: 'lt-001' }, data: { name: 'Annual Leave' } },
        query,
      });

      expect(query).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ companyId: COMPANY_A }),
      }));
    });
  });

  describe('UNSCOPED models', () => {
    it('does not inject companyId for findMany on User', async () => {
      const query = buildQueryMock([]);

      await getHandler(COMPANY_A)({ model: 'User', operation: 'findMany', args: {}, query });

      const calledArgs = query.mock.calls[0]?.[0] as { where?: Record<string, unknown> };
      expect(calledArgs.where?.companyId).toBeUndefined();
    });

    it('still injects deletedAt:null for User because soft-delete applies', async () => {
      const query = buildQueryMock([]);

      await getHandler(COMPANY_A)({ model: 'User', operation: 'findMany', args: {}, query });

      expect(query).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }));
    });

    it('passes Permission queries through completely unchanged', async () => {
      const originalArgs = { where: { resource: 'employee' }, orderBy: { action: 'asc' } };
      const query = buildQueryMock([]);

      await getHandler(COMPANY_A)({ model: 'Permission', operation: 'findMany', args: originalArgs, query });

      expect(query).toHaveBeenCalledWith(originalArgs);
    });

    it('does not inject companyId into create data for User', async () => {
      const query = buildQueryMock({ id: 'user-001' });

      await getHandler(COMPANY_A)({
        model: 'User',
        operation: 'create',
        args: { data: { email: 'test@example.com', passwordHash: 'hash' } },
        query,
      });

      const calledArgs = query.mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(calledArgs.data.companyId).toBeUndefined();
    });

    it('does not inject companyId into where for update on RefreshToken', async () => {
      const query = buildQueryMock({ id: 'rt-001' });

      await getHandler(COMPANY_A)({
        model: 'RefreshToken',
        operation: 'update',
        args: { where: { id: 'rt-001' }, data: { revokedAt: '2024-03-15T10:00:00.000Z' } },
        query,
      });

      const calledArgs = query.mock.calls[0]?.[0] as { where: Record<string, unknown> };
      expect(calledArgs.where.companyId).toBeUndefined();
    });
  });

  describe('cross-tenant read isolation', () => {
    it('two scoped clients with different companyIds produce independent where clauses', async () => {
      const queryA = buildQueryMock([{ id: 'emp-a', companyId: COMPANY_A }]);
      const queryB = buildQueryMock([]);

      await getHandler(COMPANY_A)({ model: 'Employee', operation: 'findMany', args: {}, query: queryA });
      await getHandler(COMPANY_B)({ model: 'Employee', operation: 'findMany', args: {}, query: queryB });

      const argsA = queryA.mock.calls[0]?.[0] as { where: { companyId: string } };
      const argsB = queryB.mock.calls[0]?.[0] as { where: { companyId: string } };
      expect(argsA.where.companyId).toBe(COMPANY_A);
      expect(argsB.where.companyId).toBe(COMPANY_B);
      expect(argsA.where.companyId).not.toBe(argsB.where.companyId);
    });

    it('scoped client for Company A cannot read data from Company B even if args contain Company B id', async () => {
      const query = buildQueryMock([]);

      await getHandler(COMPANY_A)({
        model: 'Payslip',
        operation: 'findMany',
        args: { where: { companyId: COMPANY_B } },
        query,
      });

      const calledArgs = query.mock.calls[0]?.[0] as { where: { companyId: string } };
      expect(calledArgs.where.companyId).toBe(COMPANY_A);
    });
  });
});
