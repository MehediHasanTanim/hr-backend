import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, ValidationError } from '@hr/shared';

vi.mock('@hr/prisma', () => ({ PrismaService: class PrismaService {} }));

import { EmployeesService } from './employees.service';
import { EMPLOYEE_HIRED, EMPLOYEE_TERMINATED } from './events/employee-events';
import type { RequestContext } from '../../common/context/request-context';

const companyId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const employeeId = '33333333-3333-4333-8333-333333333333';
const jobTitleId = '44444444-4444-4444-8444-444444444444';
const newJobTitleId = '55555555-5555-4555-8555-555555555555';
const payGradeId = '66666666-6666-4666-8666-666666666666';
const newPayGradeId = '77777777-7777-4777-8777-777777777777';
const departmentId = '88888888-8888-4888-8888-888888888888';
const locationId = '99999999-9999-4999-8999-999999999999';

function createMockRequestContext(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    userId,
    companyId,
    email: 'admin@example.test',
    roles: ['admin'],
    permissions: ['employee:read', 'employee:write', 'employee:delete'],
    sessionId: 'session-1',
    traceId: 'trace-1',
    ...overrides,
  };
}

function createMockEmployee(overrides: Record<string, unknown> = {}) {
  return {
    id: employeeId,
    companyId,
    employeeNumber: 'EMP-001',
    workEmail: 'employee@example.test',
    workPhone: null,
    employmentType: 'FULL_TIME',
    status: 'ACTIVE',
    joinedAt: new Date('2026-05-01T00:00:00.000Z'),
    probationEndsAt: null,
    exitedAt: null,
    lastWorkingDate: null,
    exitReason: null,
    departmentId,
    managerId: null,
    jobTitleId,
    payGradeId,
    locationId,
    deletedAt: null,
    profile: null,
    addresses: [],
    emergencyContacts: [],
    bankAccounts: [],
    ...overrides,
  };
}

function createMockHireDto() {
  return {
    employeeNumber: 'EMP-001',
    workEmail: 'employee@example.test',
    employmentType: 'FULL_TIME' as const,
    joinedAt: new Date('2026-05-01T00:00:00.000Z'),
    departmentId,
    jobTitleId,
    payGradeId,
    locationId,
  };
}

function createMockPromoteDto(overrides: Record<string, unknown> = {}) {
  return {
    jobTitleId: newJobTitleId,
    payGradeId: newPayGradeId,
    effectiveDate: new Date('2026-06-01T00:00:00.000Z'),
    notes: 'Promotion approved',
    ...overrides,
  };
}

function createMockTerminateDto() {
  return {
    lastWorkingDate: new Date('2026-07-15T00:00:00.000Z'),
    exitReason: 'Role eliminated',
  };
}

function createPrismaMock() {
  const tx = {
    employee: {
      create: vi.fn(),
      update: vi.fn(),
    },
    employmentHistory: {
      create: vi.fn(),
    },
  };

  return {
    tx,
    unscopedClient: {
      employee: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      employmentHistory: {
        create: vi.fn(),
      },
      employeeProfile: {
        upsert: vi.fn(),
      },
      jobTitle: {
        findFirst: vi.fn(),
      },
      payGrade: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx)),
    },
  };
}

function createSubject() {
  const prisma = createPrismaMock();
  const employeeRepository = {
    findById: vi.fn(),
    findMany: vi.fn(),
    nextEmployeeNumber: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  };
  const audit = { record: vi.fn() };
  const encryption = {
    encrypt: vi.fn(() => null),
    decrypt: vi.fn(),
    mask: vi.fn((value: string | null) => value),
  };
  const events = { emit: vi.fn() };
  const service = new EmployeesService(
    prisma as never,
    employeeRepository as never,
    audit as never,
    encryption as never,
    events as never,
  );
  return { service, prisma, employeeRepository, audit, events };
}

describe('EmployeesService lifecycle unit tests', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('hires an employee, creates history, emits event, audits, and returns the employee', async () => {
    const { service, prisma, employeeRepository, audit, events } = createSubject();
    const user = createMockRequestContext();
    const dto = createMockHireDto();
    const created = createMockEmployee();

    prisma.unscopedClient.employee.findFirst.mockResolvedValue(null);
    prisma.tx.employee.create.mockResolvedValue(created);
    prisma.tx.employmentHistory.create.mockResolvedValue({ id: 'history-1' });
    employeeRepository.findById.mockResolvedValue(created);

    const result = await service.hireEmployee(user, dto);

    expect(prisma.unscopedClient.employee.findFirst).toHaveBeenCalledWith({
      where: {
        companyId,
        deletedAt: null,
        OR: [{ employeeNumber: dto.employeeNumber }, { workEmail: dto.workEmail }],
      },
    });
    expect(prisma.tx.employee.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId,
        employeeNumber: dto.employeeNumber,
        workEmail: dto.workEmail,
        departmentId,
        jobTitleId,
        payGradeId,
        locationId,
        status: 'ACTIVE',
      }),
    });
    expect(prisma.tx.employmentHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        employeeId,
        companyId,
        eventType: 'HIRED',
        effectiveDate: dto.joinedAt,
      }),
    });
    expect(events.emit).toHaveBeenCalledWith(EMPLOYEE_HIRED, expect.objectContaining({
      companyId,
      employeeId,
      actorUserId: userId,
    }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      actor: user,
      companyId,
      action: 'EMPLOYEE_HIRED',
      entityType: 'employee',
      entityId: employeeId,
    }));
    expect(result).toEqual(expect.objectContaining({
      id: employeeId,
      employeeNumber: 'EMP-001',
      workEmail: 'employee@example.test',
    }));
  });

  it('blocks duplicate employee numbers before side effects', async () => {
    const { service, prisma, audit, events } = createSubject();
    prisma.unscopedClient.employee.findFirst.mockResolvedValue(createMockEmployee());

    await expect(service.hireEmployee(createMockRequestContext(), createMockHireDto()))
      .rejects.toBeInstanceOf(ConflictError);

    expect(prisma.unscopedClient.employee.findFirst).toHaveBeenCalled();
    expect(prisma.tx.employee.create).not.toHaveBeenCalled();
    expect(prisma.tx.employmentHistory.create).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('promotes an employee, validates org references, writes history, and audits old/new values', async () => {
    const { service, prisma, employeeRepository, audit } = createSubject();
    const user = createMockRequestContext();
    const oldEmployee = createMockEmployee();
    const updatedEmployee = createMockEmployee({ jobTitleId: newJobTitleId, payGradeId: newPayGradeId });
    const dto = createMockPromoteDto();

    employeeRepository.findById
      .mockResolvedValueOnce(oldEmployee)
      .mockResolvedValueOnce(updatedEmployee);
    prisma.unscopedClient.jobTitle.findFirst.mockResolvedValue({ id: newJobTitleId });
    prisma.unscopedClient.payGrade.findFirst.mockResolvedValue({ id: newPayGradeId });
    prisma.tx.employee.update.mockResolvedValue(updatedEmployee);
    prisma.tx.employmentHistory.create.mockResolvedValue({ id: 'history-1' });

    const result = await service.promoteEmployee(user, employeeId, dto);

    expect(employeeRepository.findById).toHaveBeenCalledWith(companyId, employeeId);
    expect(prisma.unscopedClient.jobTitle.findFirst).toHaveBeenCalledWith({
      where: { id: newJobTitleId, companyId, deletedAt: null },
    });
    expect(prisma.unscopedClient.payGrade.findFirst).toHaveBeenCalledWith({
      where: { id: newPayGradeId, companyId, deletedAt: null },
    });
    expect(prisma.tx.employee.update).toHaveBeenCalledWith({
      where: { id: employeeId },
      data: { jobTitleId: newJobTitleId, payGradeId: newPayGradeId },
    });
    expect(prisma.tx.employmentHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'PROMOTED',
        employeeId,
        companyId,
        jobTitleId: newJobTitleId,
        payGradeId: newPayGradeId,
        effectiveDate: dto.effectiveDate,
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'EMPLOYEE_PROMOTED',
      oldValue: expect.objectContaining({ jobTitleId, payGradeId }),
      newValue: expect.objectContaining({
        jobTitleId: newJobTitleId,
        payGradeId: newPayGradeId,
        effectiveDate: dto.effectiveDate.toISOString(),
      }),
    }));
    expect(result).toEqual(expect.objectContaining({ jobTitleId: newJobTitleId }));
  });

  it('allows past promotion effective dates and audits them', async () => {
    const { service, prisma, employeeRepository, audit } = createSubject();
    const pastEffectiveDate = new Date('2025-01-15T00:00:00.000Z');
    const dto = createMockPromoteDto({ effectiveDate: pastEffectiveDate });
    const updatedEmployee = createMockEmployee({ jobTitleId: newJobTitleId, payGradeId: newPayGradeId });

    employeeRepository.findById
      .mockResolvedValueOnce(createMockEmployee())
      .mockResolvedValueOnce(updatedEmployee);
    prisma.unscopedClient.jobTitle.findFirst.mockResolvedValue({ id: newJobTitleId });
    prisma.unscopedClient.payGrade.findFirst.mockResolvedValue({ id: newPayGradeId });
    prisma.tx.employee.update.mockResolvedValue(updatedEmployee);

    await expect(service.promoteEmployee(createMockRequestContext(), employeeId, dto)).resolves.toBeDefined();

    expect(prisma.tx.employmentHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ effectiveDate: pastEffectiveDate }),
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      newValue: expect.objectContaining({ effectiveDate: pastEffectiveDate.toISOString() }),
    }));
  });

  it('rejects invalid pay grades before updating, writing history, or auditing', async () => {
    const { service, prisma, employeeRepository, audit } = createSubject();
    employeeRepository.findById.mockResolvedValue(createMockEmployee());
    prisma.unscopedClient.jobTitle.findFirst.mockResolvedValue({ id: newJobTitleId });
    prisma.unscopedClient.payGrade.findFirst.mockResolvedValue(null);

    await expect(service.promoteEmployee(createMockRequestContext(), employeeId, createMockPromoteDto()))
      .rejects.toBeInstanceOf(ValidationError);

    expect(prisma.tx.employee.update).not.toHaveBeenCalled();
    expect(prisma.tx.employmentHistory.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('terminates an employee, writes history, emits event, and audits', async () => {
    const { service, prisma, employeeRepository, audit, events } = createSubject();
    const dto = createMockTerminateDto();
    const terminated = createMockEmployee({
      status: 'TERMINATED',
      lastWorkingDate: dto.lastWorkingDate,
      exitedAt: dto.lastWorkingDate,
      exitReason: dto.exitReason,
    });

    employeeRepository.findById
      .mockResolvedValueOnce(createMockEmployee())
      .mockResolvedValueOnce(terminated);
    prisma.tx.employee.update.mockResolvedValue(terminated);

    const result = await service.terminateEmployee(createMockRequestContext(), employeeId, dto);

    expect(employeeRepository.findById).toHaveBeenCalledWith(companyId, employeeId);
    expect(prisma.tx.employee.update).toHaveBeenCalledWith({
      where: { id: employeeId },
      data: {
        status: 'TERMINATED',
        exitedAt: dto.lastWorkingDate,
        lastWorkingDate: dto.lastWorkingDate,
        exitReason: dto.exitReason,
      },
    });
    expect(prisma.tx.employmentHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'TERMINATED',
        employeeId,
        effectiveDate: dto.lastWorkingDate,
      }),
    });
    expect(events.emit).toHaveBeenCalledWith(EMPLOYEE_TERMINATED, expect.objectContaining({
      employeeId,
      companyId,
    }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'EMPLOYEE_TERMINATED',
      entityId: employeeId,
    }));
    expect(result.status).toBe('TERMINATED');
  });

  it('blocks re-terminating an already terminated employee before side effects', async () => {
    const { service, prisma, employeeRepository, audit, events } = createSubject();
    employeeRepository.findById.mockResolvedValue(createMockEmployee({ status: 'TERMINATED' }));

    await expect(service.terminateEmployee(createMockRequestContext(), employeeId, createMockTerminateDto()))
      .rejects.toBeInstanceOf(ConflictError);

    expect(prisma.tx.employee.update).not.toHaveBeenCalled();
    expect(prisma.tx.employmentHistory.create).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it.each([
    ['hireEmployee', 'EMPLOYEE_HIRED'],
    ['promoteEmployee', 'EMPLOYEE_PROMOTED'],
    ['transferEmployee', 'EMPLOYEE_TRANSFERRED'],
    ['terminateEmployee', 'EMPLOYEE_TERMINATED'],
    ['update', 'EMPLOYEE_UPDATED'],
    ['remove', 'EMPLOYEE_DELETED'],
  ] as const)('creates audit log metadata for %s', async (methodName, expectedAction) => {
    const { service, prisma, employeeRepository, audit } = createSubject();
    const user = createMockRequestContext();
    const baseEmployee = createMockEmployee();
    const updatedEmployee = createMockEmployee({
      jobTitleId: newJobTitleId,
      payGradeId: newPayGradeId,
      departmentId: null,
    });

    prisma.unscopedClient.employee.findFirst.mockResolvedValue(null);
    prisma.unscopedClient.jobTitle.findFirst.mockResolvedValue({ id: newJobTitleId });
    prisma.unscopedClient.payGrade.findFirst.mockResolvedValue({ id: newPayGradeId });
    prisma.tx.employee.create.mockResolvedValue(baseEmployee);
    prisma.tx.employee.update.mockResolvedValue(updatedEmployee);
    employeeRepository.update.mockResolvedValue(updatedEmployee);
    employeeRepository.softDelete.mockResolvedValue(createMockEmployee({ deletedAt: new Date('2026-08-01T00:00:00.000Z') }));
    employeeRepository.findById.mockResolvedValue(baseEmployee);

    if (methodName === 'hireEmployee') await service.hireEmployee(user, createMockHireDto());
    if (methodName === 'promoteEmployee') await service.promoteEmployee(user, employeeId, createMockPromoteDto());
    if (methodName === 'transferEmployee') {
      await service.transferEmployee(user, employeeId, {
        departmentId: null,
        locationId,
        managerId: null,
        effectiveDate: new Date('2026-06-10T00:00:00.000Z'),
      });
    }
    if (methodName === 'terminateEmployee') await service.terminateEmployee(user, employeeId, createMockTerminateDto());
    if (methodName === 'update') await service.update(user, employeeId, { workEmail: 'new.employee@example.test' });
    if (methodName === 'remove') await service.remove(user, employeeId);

    const auditExpectation: Record<string, unknown> = {
      actor: expect.objectContaining({ userId, companyId, traceId: 'trace-1' }),
      companyId,
      action: expectedAction,
      entityType: 'employee',
      entityId: employeeId,
      newValue: expect.any(Object),
    };
    if (methodName !== 'hireEmployee') auditExpectation.oldValue = expect.any(Object);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining(auditExpectation));
  });
});
