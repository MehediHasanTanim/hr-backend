import { describe, expect, it } from 'vitest';
import { DomainEventsService } from './domain-events.service';
import { EmployeeEventHandlers } from './employee-event.handlers';
import { EMPLOYEE_HIRED, EMPLOYEE_TERMINATED } from './employee-events';

const payload = {
  companyId: 'company-1',
  employeeId: 'employee-1',
  actorUserId: 'user-1',
  effectiveDate: '2026-05-28T00:00:00.000Z',
};

describe('employee domain events', () => {
  it('queues welcome and onboarding jobs when an employee is hired', () => {
    const events = new DomainEventsService();
    const handlers = new EmployeeEventHandlers(events);
    handlers.onModuleInit();

    events.emit(EMPLOYEE_HIRED, payload);

    expect(handlers.getQueuedJobs().map((job) => job.type)).toEqual([
      'welcome_email',
      'onboarding_tasks_stub',
    ]);
  });

  it('queues access revocation when an employee is terminated', () => {
    const events = new DomainEventsService();
    const handlers = new EmployeeEventHandlers(events);
    handlers.onModuleInit();

    events.emit(EMPLOYEE_TERMINATED, payload);

    expect(handlers.getQueuedJobs()).toEqual([
      { type: 'access_revocation', payload },
    ]);
  });
});
