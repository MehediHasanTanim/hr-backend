import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Require } from '../auth/decorators/permissions.decorator';
import type { RequestContext } from '../../common/context/request-context';
import {
  AddressBody,
  BankAccountBody,
  EmergencyContactBody,
  EmployeeQuerySchema,
  EmployeeWriteBody,
  PromoteEmployeeBody,
  TerminateEmployeeBody,
  TransferEmployeeBody,
  uuidSchema,
  type AddressDto,
  type BankAccountDto,
  type EmergencyContactDto,
  type EmployeeWriteDto,
  type PromoteEmployeeDto,
  type TerminateEmployeeDto,
  type TransferEmployeeDto,
} from './dto/employee.dto';
import { EmployeesService } from './employees.service';

@Controller('employees')
export class EmployeesController {
  constructor(@Inject(EmployeesService) private readonly employees: EmployeesService) {}

  @Get()
  @Require.read('employee')
  list(@CurrentUser() user: RequestContext, @Query() query: unknown) {
    return this.employees.list(user, EmployeeQuerySchema.parse(query));
  }

  @Get(':id')
  @Require.read('employee')
  get(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.employees.get(user, uuidSchema.parse(id));
  }

  @Post()
  @Require.write('employee')
  create(@CurrentUser() user: RequestContext, @Body() dto: EmployeeWriteBody) {
    return this.employees.create(user, dto as EmployeeWriteDto);
  }

  @Patch(':id')
  @Require.write('employee')
  update(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Body() dto: EmployeeWriteBody,
  ) {
    return this.employees.update(user, uuidSchema.parse(id), dto as EmployeeWriteDto);
  }

  @Delete(':id')
  @Require.delete('employee')
  remove(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.employees.remove(user, uuidSchema.parse(id));
  }

  @Get(':id/employment-history')
  @Require.read('employee')
  employmentHistory(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.employees.employmentHistory(user, uuidSchema.parse(id));
  }

  @Post(':id/promotions')
  @Require.write('employee')
  promote(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Body() dto: PromoteEmployeeBody,
  ) {
    return this.employees.promoteEmployee(user, uuidSchema.parse(id), dto as PromoteEmployeeDto);
  }

  @Post(':id/transfers')
  @Require.write('employee')
  transfer(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Body() dto: TransferEmployeeBody,
  ) {
    return this.employees.transferEmployee(user, uuidSchema.parse(id), dto as TransferEmployeeDto);
  }

  @Post(':id/termination')
  @Require.write('employee')
  terminate(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Body() dto: TerminateEmployeeBody,
  ) {
    return this.employees.terminateEmployee(user, uuidSchema.parse(id), dto as TerminateEmployeeDto);
  }

  @Get(':id/addresses')
  @Require.read('employee')
  listAddresses(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.employees.listAddresses(user, uuidSchema.parse(id));
  }

  @Post(':id/addresses')
  @Require.write('employee')
  createAddress(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Body() dto: AddressBody,
  ) {
    return this.employees.createAddress(user, uuidSchema.parse(id), dto as AddressDto);
  }

  @Patch(':id/addresses/:addressId')
  @Require.write('employee')
  updateAddress(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @Body() dto: AddressBody,
  ) {
    return this.employees.updateAddress(
      user,
      uuidSchema.parse(id),
      uuidSchema.parse(addressId),
      dto as AddressDto,
    );
  }

  @Delete(':id/addresses/:addressId')
  @Require.write('employee')
  deleteAddress(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Param('addressId') addressId: string,
  ) {
    return this.employees.deleteAddress(user, uuidSchema.parse(id), uuidSchema.parse(addressId));
  }

  @Get(':id/emergency-contacts')
  @Require.read('employee')
  listEmergencyContacts(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.employees.listEmergencyContacts(user, uuidSchema.parse(id));
  }

  @Post(':id/emergency-contacts')
  @Require.write('employee')
  createEmergencyContact(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Body() dto: EmergencyContactBody,
  ) {
    return this.employees.createEmergencyContact(user, uuidSchema.parse(id), dto as EmergencyContactDto);
  }

  @Patch(':id/emergency-contacts/:contactId')
  @Require.write('employee')
  updateEmergencyContact(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Body() dto: EmergencyContactBody,
  ) {
    return this.employees.updateEmergencyContact(
      user,
      uuidSchema.parse(id),
      uuidSchema.parse(contactId),
      dto as EmergencyContactDto,
    );
  }

  @Delete(':id/emergency-contacts/:contactId')
  @Require.write('employee')
  deleteEmergencyContact(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
  ) {
    return this.employees.deleteEmergencyContact(user, uuidSchema.parse(id), uuidSchema.parse(contactId));
  }

  @Get(':id/bank-accounts')
  @Require.read('employee')
  listBankAccounts(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.employees.listBankAccounts(user, uuidSchema.parse(id));
  }

  @Post(':id/bank-accounts')
  @Require.write('employee')
  createBankAccount(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Body() dto: BankAccountBody,
  ) {
    return this.employees.createBankAccount(user, uuidSchema.parse(id), dto as BankAccountDto);
  }

  @Patch(':id/bank-accounts/:bankAccountId')
  @Require.write('employee')
  updateBankAccount(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Param('bankAccountId') bankAccountId: string,
    @Body() dto: BankAccountBody,
  ) {
    return this.employees.updateBankAccount(
      user,
      uuidSchema.parse(id),
      uuidSchema.parse(bankAccountId),
      dto as BankAccountDto,
    );
  }

  @Delete(':id/bank-accounts/:bankAccountId')
  @Require.write('employee')
  deleteBankAccount(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Param('bankAccountId') bankAccountId: string,
  ) {
    return this.employees.deleteBankAccount(user, uuidSchema.parse(id), uuidSchema.parse(bankAccountId));
  }
}
