import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  EMPLOYEE_HIRED,
  EMPLOYEE_TERMINATED,
  type EmployeeLifecycleEvent,
} from './employee-events';
import { DomainEventsService } from './domain-events.service';

interface QueuedDomainJob {
  type: string;
  payload: EmployeeLifecycleEvent;
}

@Injectable()
export class EmployeeEventHandlers implements OnModuleInit {
  private readonly logger = new Logger(EmployeeEventHandlers.name);
  private readonly jobs: QueuedDomainJob[] = [];

  constructor(@Inject(DomainEventsService) private readonly events: DomainEventsService) {}

  onModuleInit(): void {
    this.events.on<EmployeeLifecycleEvent>(EMPLOYEE_HIRED, (event) => {
      this.queue('welcome_email', event);
      this.queue('onboarding_tasks_stub', event);
    });

    this.events.on<EmployeeLifecycleEvent>(EMPLOYEE_TERMINATED, (event) => {
      this.queue('access_revocation', event);
    });
  }

  getQueuedJobs(): QueuedDomainJob[] {
    return [...this.jobs];
  }

  private queue(type: string, payload: EmployeeLifecycleEvent): void {
    this.jobs.push({ type, payload });
    this.logger.log({ type, employeeId: payload.employeeId }, 'Queued employee lifecycle job');
  }
}
