import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { ConflictError, NotFoundError, ValidationError } from '@hr/shared';
import type { Prisma } from '@prisma/client';
import type { RequestContext } from '../../common/context/request-context';
import { AuditService } from '../audit/audit.service';
import { EncryptionService } from '../encryption/encryption.service';
import {
  EMPLOYEE_HIRED,
  EMPLOYEE_PROMOTED,
  EMPLOYEE_TERMINATED,
  EMPLOYEE_TRANSFERRED,
} from './events/employee-events';
import { DomainEventsService } from './events/domain-events.service';
import {
  type AddressDto,
  type BankAccountDto,
  type EmergencyContactDto,
  type EmployeeQueryDto,
  type EmployeeWriteDto,
  type PromoteEmployeeDto,
  type TerminateEmployeeDto,
  type TransferEmployeeDto,
} from './dto/employee.dto';
import { EmployeeRepository } from './repositories/employee.repository';

@Injectable()
export class EmployeesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmployeeRepository) private readonly employees: EmployeeRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EncryptionService) private readonly encryption: EncryptionService,
    @Inject(DomainEventsService) private readonly events: DomainEventsService,
  ) {}

  async list(user: RequestContext, filters: EmployeeQueryDto) {
    const result = await this.employees.findMany(user.companyId, filters);
    return { ...result, items: result.items.map((employee) => this.serializeEmployee(employee)) };
  }

  async get(user: RequestContext, id: string) {
    return this.serializeEmployee(await this.getOrThrow(user.companyId, id));
  }

  async create(user: RequestContext, dto: EmployeeWriteDto) {
    return this.hireEmployee(user, dto);
  }

  async hireEmployee(user: RequestContext, dto: EmployeeWriteDto) {
    const employeeNumber = dto.employeeNumber ?? await this.generateEmployeeNumber(user.companyId);
    await this.assertEmployeeUnique(user.companyId, employeeNumber, dto.workEmail ?? dto.email);

    const employee = await this.prisma.unscopedClient.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: {
          companyId: user.companyId,
          employeeNumber,
          workEmail: dto.workEmail ?? dto.email ?? `${employeeNumber.toLowerCase()}@example.invalid`,
          workPhone: dto.workPhone,
          employmentType: dto.employmentType ?? 'FULL_TIME',
          status: 'ACTIVE',
          joinedAt: dto.joinedAt ?? new Date(),
          probationEndsAt: dto.probationEndsAt ?? undefined,
          departmentId: dto.departmentId ?? undefined,
          managerId: dto.managerId ?? undefined,
          jobTitleId: dto.jobTitleId ?? undefined,
          locationId: dto.locationId ?? undefined,
          payGradeId: dto.payGradeId ?? undefined,
          profile: this.profileData(dto),
        },
      });
      await tx.employmentHistory.create({
        data: {
          companyId: user.companyId,
          employeeId: created.id,
          eventType: 'HIRED',
          effectiveDate: dto.joinedAt ?? new Date(),
          departmentId: dto.departmentId ?? undefined,
          jobTitleId: dto.jobTitleId ?? undefined,
          payGradeId: dto.payGradeId ?? undefined,
          locationId: dto.locationId ?? undefined,
          managerId: dto.managerId ?? undefined,
          createdById: user.userId,
        },
      });
      return created;
    });

    await this.audit.record({
      actor: user,
      companyId: user.companyId,
      entityType: 'employee',
      entityId: employee.id,
      action: 'EMPLOYEE_HIRED',
      newValue: this.auditEmployee(employee),
    });
    this.events.emit(EMPLOYEE_HIRED, {
      companyId: user.companyId,
      employeeId: employee.id,
      actorUserId: user.userId,
      effectiveDate: (dto.joinedAt ?? new Date()).toISOString(),
    });
    return this.get(user, employee.id);
  }

  async update(user: RequestContext, id: string, dto: EmployeeWriteDto) {
    const oldValue = await this.getOrThrow(user.companyId, id);
    const updated = await this.employees.update(user.companyId, id, dto);
    await this.upsertProfile(id, dto);
    await this.audit.record({
      actor: user,
      companyId: user.companyId,
      entityType: 'employee',
      entityId: id,
      action: 'EMPLOYEE_UPDATED',
      oldValue: this.auditEmployee(oldValue),
      newValue: this.auditEmployee(updated),
    });
    return this.get(user, id);
  }

  async promoteEmployee(user: RequestContext, id: string, dto: PromoteEmployeeDto) {
    const oldValue = await this.getOrThrow(user.companyId, id);
    await this.assertJobTitleExists(user.companyId, dto.jobTitleId);
    if (dto.payGradeId) await this.assertPayGradeExists(user.companyId, dto.payGradeId);
    const updated = await this.prisma.unscopedClient.$transaction(async (tx) => {
      const employee = await tx.employee.update({
        where: { id },
        data: { jobTitleId: dto.jobTitleId, payGradeId: dto.payGradeId ?? undefined },
      });
      await tx.employmentHistory.create({
        data: {
          companyId: user.companyId,
          employeeId: id,
          eventType: 'PROMOTED',
          effectiveDate: dto.effectiveDate,
          jobTitleId: dto.jobTitleId,
          payGradeId: dto.payGradeId ?? undefined,
          departmentId: employee.departmentId,
          locationId: employee.locationId,
          managerId: employee.managerId,
          notes: dto.notes,
          createdById: user.userId,
        },
      });
      return employee;
    });
    await this.audit.record({
      actor: user,
      companyId: user.companyId,
      entityType: 'employee',
      entityId: id,
      action: 'EMPLOYEE_PROMOTED',
      oldValue: this.auditEmployee(oldValue),
      newValue: {
        ...this.auditEmployee(updated),
        effectiveDate: dto.effectiveDate.toISOString(),
      },
    });
    this.events.emit(EMPLOYEE_PROMOTED, this.lifecyclePayload(user, id, dto.effectiveDate));
    return this.get(user, id);
  }

  async transferEmployee(user: RequestContext, id: string, dto: TransferEmployeeDto) {
    const oldValue = await this.getOrThrow(user.companyId, id);
    const updated = await this.prisma.unscopedClient.$transaction(async (tx) => {
      const employee = await tx.employee.update({
        where: { id },
        data: {
          departmentId: dto.departmentId ?? undefined,
          locationId: dto.locationId ?? undefined,
          managerId: dto.managerId ?? undefined,
        },
      });
      await tx.employmentHistory.create({
        data: {
          companyId: user.companyId,
          employeeId: id,
          eventType: 'TRANSFERRED',
          effectiveDate: dto.effectiveDate,
          departmentId: employee.departmentId,
          jobTitleId: employee.jobTitleId,
          payGradeId: employee.payGradeId,
          locationId: employee.locationId,
          managerId: employee.managerId,
          notes: dto.notes,
          createdById: user.userId,
        },
      });
      return employee;
    });
    await this.audit.record({
      actor: user,
      companyId: user.companyId,
      entityType: 'employee',
      entityId: id,
      action: 'EMPLOYEE_TRANSFERRED',
      oldValue: this.auditEmployee(oldValue),
      newValue: this.auditEmployee(updated),
    });
    this.events.emit(EMPLOYEE_TRANSFERRED, this.lifecyclePayload(user, id, dto.effectiveDate));
    return this.get(user, id);
  }

  async terminateEmployee(user: RequestContext, id: string, dto: TerminateEmployeeDto) {
    const oldValue = await this.getOrThrow(user.companyId, id);
    if (oldValue.status === 'TERMINATED') {
      throw new ConflictError('Employee is already terminated');
    }
    const updated = await this.prisma.unscopedClient.$transaction(async (tx) => {
      const employee = await tx.employee.update({
        where: { id },
        data: {
          status: 'TERMINATED',
          exitedAt: dto.lastWorkingDate,
          lastWorkingDate: dto.lastWorkingDate,
          exitReason: dto.exitReason,
        },
      });
      await tx.employmentHistory.create({
        data: {
          companyId: user.companyId,
          employeeId: id,
          eventType: 'TERMINATED',
          effectiveDate: dto.lastWorkingDate,
          departmentId: employee.departmentId,
          jobTitleId: employee.jobTitleId,
          payGradeId: employee.payGradeId,
          locationId: employee.locationId,
          managerId: employee.managerId,
          notes: dto.exitReason,
          createdById: user.userId,
        },
      });
      return employee;
    });
    await this.audit.record({
      actor: user,
      companyId: user.companyId,
      entityType: 'employee',
      entityId: id,
      action: 'EMPLOYEE_TERMINATED',
      oldValue: this.auditEmployee(oldValue),
      newValue: this.auditEmployee(updated),
    });
    this.events.emit(EMPLOYEE_TERMINATED, this.lifecyclePayload(user, id, dto.lastWorkingDate));
    return this.get(user, id);
  }

  async remove(user: RequestContext, id: string) {
    const oldValue = await this.getOrThrow(user.companyId, id);
    const removed = await this.employees.softDelete(user.companyId, id);
    await this.audit.record({
      actor: user,
      companyId: user.companyId,
      entityType: 'employee',
      entityId: id,
      action: 'EMPLOYEE_DELETED',
      oldValue: this.auditEmployee(oldValue),
      newValue: this.auditEmployee(removed),
    });
    return { id, deleted: true };
  }

  async employmentHistory(user: RequestContext, id: string) {
    await this.getOrThrow(user.companyId, id);
    return this.prisma.unscopedClient.employmentHistory.findMany({
      where: { companyId: user.companyId, employeeId: id },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async listAddresses(user: RequestContext, employeeId: string) {
    await this.getOrThrow(user.companyId, employeeId);
    return this.prisma.unscopedClient.employeeAddress.findMany({
      where: { employeeId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createAddress(user: RequestContext, employeeId: string, dto: AddressDto) {
    await this.getOrThrow(user.companyId, employeeId);
    const address = await this.prisma.unscopedClient.employeeAddress.create({
      data: { employeeId, ...dto },
    });
    await this.auditSubResource(user, employeeId, 'address_create', null, address);
    return address;
  }

  async updateAddress(user: RequestContext, employeeId: string, addressId: string, dto: AddressDto) {
    await this.getOrThrow(user.companyId, employeeId);
    const oldValue = await this.getAddressOrThrow(employeeId, addressId);
    const updated = await this.prisma.unscopedClient.employeeAddress.update({
      where: { id: addressId },
      data: dto,
    });
    await this.auditSubResource(user, employeeId, 'address_update', oldValue, updated);
    return updated;
  }

  async deleteAddress(user: RequestContext, employeeId: string, addressId: string) {
    await this.getOrThrow(user.companyId, employeeId);
    const oldValue = await this.getAddressOrThrow(employeeId, addressId);
    const deleted = await this.prisma.unscopedClient.employeeAddress.update({
      where: { id: addressId },
      data: { deletedAt: new Date() },
    });
    await this.auditSubResource(user, employeeId, 'address_delete', oldValue, deleted);
    return { id: addressId, deleted: true };
  }

  async listEmergencyContacts(user: RequestContext, employeeId: string) {
    await this.getOrThrow(user.companyId, employeeId);
    return this.prisma.unscopedClient.emergencyContact.findMany({
      where: { employeeId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async createEmergencyContact(user: RequestContext, employeeId: string, dto: EmergencyContactDto) {
    await this.getOrThrow(user.companyId, employeeId);
    const contact = await this.prisma.unscopedClient.emergencyContact.create({
      data: { employeeId, ...dto },
    });
    await this.auditSubResource(user, employeeId, 'emergency_contact_create', null, contact);
    return contact;
  }

  async updateEmergencyContact(
    user: RequestContext,
    employeeId: string,
    contactId: string,
    dto: EmergencyContactDto,
  ) {
    await this.getOrThrow(user.companyId, employeeId);
    const oldValue = await this.getContactOrThrow(employeeId, contactId);
    const updated = await this.prisma.unscopedClient.emergencyContact.update({
      where: { id: contactId },
      data: dto,
    });
    await this.auditSubResource(user, employeeId, 'emergency_contact_update', oldValue, updated);
    return updated;
  }

  async deleteEmergencyContact(user: RequestContext, employeeId: string, contactId: string) {
    await this.getOrThrow(user.companyId, employeeId);
    const oldValue = await this.getContactOrThrow(employeeId, contactId);
    const deleted = await this.prisma.unscopedClient.emergencyContact.update({
      where: { id: contactId },
      data: { deletedAt: new Date() },
    });
    await this.auditSubResource(user, employeeId, 'emergency_contact_delete', oldValue, deleted);
    return { id: contactId, deleted: true };
  }

  async listBankAccounts(user: RequestContext, employeeId: string) {
    await this.getOrThrow(user.companyId, employeeId);
    const accounts = await this.prisma.unscopedClient.bankAccount.findMany({
      where: { employeeId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return accounts.map((account) => this.serializeBankAccount(account));
  }

  async createBankAccount(user: RequestContext, employeeId: string, dto: BankAccountDto) {
    await this.getOrThrow(user.companyId, employeeId);
    const account = await this.prisma.unscopedClient.bankAccount.create({
      data: {
        employeeId,
        accountName: dto.accountName,
        accountNumber: this.encryption.encrypt(dto.accountNumber) as Prisma.InputJsonValue,
        routingNumber: dto.routingNumber,
        bankName: dto.bankName,
        bankCode: dto.bankCode,
        currency: dto.currency,
        isPrimary: dto.isPrimary,
      },
    });
    await this.auditSubResource(user, employeeId, 'bank_account_create', null, this.auditBank(account));
    return this.serializeBankAccount(account);
  }

  async updateBankAccount(
    user: RequestContext,
    employeeId: string,
    bankAccountId: string,
    dto: BankAccountDto,
  ) {
    await this.getOrThrow(user.companyId, employeeId);
    const oldValue = await this.getBankAccountOrThrow(employeeId, bankAccountId);
    const updated = await this.prisma.unscopedClient.bankAccount.update({
      where: { id: bankAccountId },
      data: {
        accountName: dto.accountName,
        accountNumber: this.encryption.encrypt(dto.accountNumber) as Prisma.InputJsonValue,
        routingNumber: dto.routingNumber,
        bankName: dto.bankName,
        bankCode: dto.bankCode,
        currency: dto.currency,
        isPrimary: dto.isPrimary,
      },
    });
    await this.auditSubResource(user, employeeId, 'bank_account_update', this.auditBank(oldValue), this.auditBank(updated));
    return this.serializeBankAccount(updated);
  }

  async deleteBankAccount(user: RequestContext, employeeId: string, bankAccountId: string) {
    await this.getOrThrow(user.companyId, employeeId);
    const oldValue = await this.getBankAccountOrThrow(employeeId, bankAccountId);
    const deleted = await this.prisma.unscopedClient.bankAccount.update({
      where: { id: bankAccountId },
      data: { deletedAt: new Date() },
    });
    await this.auditSubResource(user, employeeId, 'bank_account_delete', this.auditBank(oldValue), this.auditBank(deleted));
    return { id: bankAccountId, deleted: true };
  }

  private async getOrThrow(companyId: string, id: string) {
    const employee = await this.employees.findById(companyId, id);
    if (!employee) throw new NotFoundError('Employee not found');
    return employee;
  }

  private async assertEmployeeUnique(companyId: string, employeeNumber: string, workEmail?: string) {
    const existing = await this.prisma.unscopedClient.employee.findFirst({
      where: {
        companyId,
        deletedAt: null,
        OR: [
          { employeeNumber },
          ...(workEmail ? [{ workEmail }] : []),
        ],
      },
    });
    if (existing) throw new ConflictError('Employee number or email already exists');
  }

  private async assertJobTitleExists(companyId: string, jobTitleId: string): Promise<void> {
    const jobTitle = await this.prisma.unscopedClient.jobTitle.findFirst({
      where: { id: jobTitleId, companyId, deletedAt: null },
    });
    if (!jobTitle) throw new ValidationError('Job title not found');
  }

  private async assertPayGradeExists(companyId: string, payGradeId: string): Promise<void> {
    const payGrade = await this.prisma.unscopedClient.payGrade.findFirst({
      where: { id: payGradeId, companyId, deletedAt: null },
    });
    if (!payGrade) throw new ValidationError('Pay grade not found');
  }

  private async generateEmployeeNumber(companyId: string): Promise<string> {
    const count = await this.employees.nextEmployeeNumber(companyId);
    return `T${String(count + 1).padStart(5, '0')}`;
  }

  private profileData(dto: EmployeeWriteDto): Prisma.EmployeeProfileCreateNestedOneWithoutEmployeeInput | undefined {
    const nationalId = this.encryption.encrypt(dto.nationalId);
    const passportNumber = this.encryption.encrypt(dto.passportNumber);
    if (!nationalId && !passportNumber && !dto.personalEmail && !dto.personalPhone) return undefined;
    const profile: Prisma.EmployeeProfileCreateWithoutEmployeeInput = {};
    if (nationalId) profile.nationalId = nationalId as Prisma.InputJsonValue;
    if (passportNumber) profile.passportNumber = passportNumber as Prisma.InputJsonValue;
    if (dto.personalEmail !== undefined) profile.personalEmail = dto.personalEmail;
    if (dto.personalPhone !== undefined) profile.personalPhone = dto.personalPhone;
    return {
      create: profile,
    };
  }

  private async upsertProfile(employeeId: string, dto: EmployeeWriteDto): Promise<void> {
    const hasProfilePatch = ['nationalId', 'passportNumber', 'personalEmail', 'personalPhone']
      .some((key) => key in dto);
    if (!hasProfilePatch) return;

    const create: Prisma.EmployeeProfileCreateInput = {
      employee: { connect: { id: employeeId } },
    };
    const update: Prisma.EmployeeProfileUpdateInput = {};
    if (dto.nationalId !== undefined) {
      const encrypted = this.encryption.encrypt(dto.nationalId);
      if (encrypted) {
        create.nationalId = encrypted as Prisma.InputJsonValue;
        update.nationalId = encrypted as Prisma.InputJsonValue;
      }
    }
    if (dto.passportNumber !== undefined) {
      const encrypted = this.encryption.encrypt(dto.passportNumber);
      if (encrypted) {
        create.passportNumber = encrypted as Prisma.InputJsonValue;
        update.passportNumber = encrypted as Prisma.InputJsonValue;
      }
    }
    if (dto.personalEmail !== undefined) {
      create.personalEmail = dto.personalEmail;
      update.personalEmail = dto.personalEmail;
    }
    if (dto.personalPhone !== undefined) {
      create.personalPhone = dto.personalPhone;
      update.personalPhone = dto.personalPhone;
    }

    await this.prisma.unscopedClient.employeeProfile.upsert({
      where: { employeeId },
      create,
      update,
    });
  }

  private serializeEmployee(employee: any) {
    return {
      ...employee,
      profile: employee.profile
        ? {
          ...employee.profile,
          nationalId: this.encryption.mask(this.safeDecrypt(employee.profile.nationalId)),
          passportNumber: this.encryption.mask(this.safeDecrypt(employee.profile.passportNumber)),
        }
        : null,
      bankAccounts: employee.bankAccounts?.map((account: any) => this.serializeBankAccount(account)),
    };
  }

  private serializeBankAccount(account: any) {
    const decrypted = this.safeDecrypt(account.accountNumber);
    return {
      ...account,
      accountNumber: this.encryption.mask(decrypted),
    };
  }

  private safeDecrypt(payload: unknown): string | null {
    return payload ? this.encryption.decrypt(payload) : null;
  }

  private auditEmployee(employee: any): Prisma.InputJsonValue {
    return {
      id: employee.id,
      employeeNumber: employee.employeeNumber,
      workEmail: employee.workEmail,
      departmentId: employee.departmentId,
      jobTitleId: employee.jobTitleId,
      payGradeId: employee.payGradeId,
      locationId: employee.locationId,
      managerId: employee.managerId,
      status: employee.status,
      deletedAt: employee.deletedAt,
    };
  }

  private auditBank(account: any): Prisma.InputJsonValue {
    return {
      id: account.id,
      accountName: account.accountName,
      accountNumber: this.serializeBankAccount(account).accountNumber,
      routingNumber: account.routingNumber,
      bankName: account.bankName,
      currency: account.currency,
      isPrimary: account.isPrimary,
      deletedAt: account.deletedAt,
    };
  }

  private async auditSubResource(
    user: RequestContext,
    employeeId: string,
    action: string,
    oldValue: Prisma.InputJsonValue | null,
    newValue: Prisma.InputJsonValue | null,
  ): Promise<void> {
    await this.audit.record({
      actor: user,
      companyId: user.companyId,
      entityType: 'employee',
      entityId: employeeId,
      action,
      oldValue,
      newValue,
    });
  }

  private lifecyclePayload(user: RequestContext, employeeId: string, effectiveDate: Date) {
    return {
      companyId: user.companyId,
      employeeId,
      actorUserId: user.userId,
      effectiveDate: effectiveDate.toISOString(),
    };
  }

  private async getAddressOrThrow(employeeId: string, addressId: string) {
    const address = await this.prisma.unscopedClient.employeeAddress.findFirst({
      where: { id: addressId, employeeId, deletedAt: null },
    });
    if (!address) throw new NotFoundError('Address not found');
    return address;
  }

  private async getContactOrThrow(employeeId: string, contactId: string) {
    const contact = await this.prisma.unscopedClient.emergencyContact.findFirst({
      where: { id: contactId, employeeId, deletedAt: null },
    });
    if (!contact) throw new NotFoundError('Emergency contact not found');
    return contact;
  }

  private async getBankAccountOrThrow(employeeId: string, bankAccountId: string) {
    const account = await this.prisma.unscopedClient.bankAccount.findFirst({
      where: { id: bankAccountId, employeeId, deletedAt: null },
    });
    if (!account) throw new NotFoundError('Bank account not found');
    return account;
  }
}
