import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmployeeTable } from './EmployeeTable';
import type { Employee, EmployeeListParams } from '../types/employee.types';

const params: EmployeeListParams = {
  search: '',
  department: '',
  status: '',
  employmentType: '',
  page: 1,
  pageSize: 10,
  sortBy: 'employeeNumber',
  sortOrder: 'asc',
};

const employees: Employee[] = [{
  id: 'emp-1',
  employeeNumber: 'EMP-001',
  workEmail: 'tanvir@company.com',
  employmentType: 'FULL_TIME',
  status: 'ACTIVE',
  joinedAt: '2026-05-29T00:00:00.000Z',
  department: { id: 'dept-1', name: 'HR' },
  jobTitle: { id: 'job-1', title: 'HR Manager' },
  location: { id: 'loc-1', name: 'Dhaka' },
}];

function renderTable(overrides: Partial<{ params: EmployeeListParams; employees: Employee[]; total: number }> = {}) {
  const onParamsChange = vi.fn();
  render(
    <EmployeeTable
      employees={overrides.employees ?? employees}
      total={overrides.total ?? 30}
      params={overrides.params ?? params}
      departments={[{ id: 'dept-1', name: 'HR', code: 'HR', isActive: true }]}
      onParamsChange={onParamsChange}
    />,
  );
  return onParamsChange;
}

describe('EmployeeTable filtering', () => {
  it('updates query state for department filter', async () => {
    const user = userEvent.setup();
    const onParamsChange = renderTable();

    await user.selectOptions(screen.getByLabelText(/department filter/i), 'dept-1');

    expect(onParamsChange).toHaveBeenCalledWith(expect.objectContaining({ department: 'dept-1', page: 1 }));
  });

  it('updates query state for status filter', async () => {
    const user = userEvent.setup();
    const onParamsChange = renderTable();

    await user.selectOptions(screen.getByLabelText(/status filter/i), 'ACTIVE');

    expect(onParamsChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'ACTIVE', page: 1 }));
  });

  it('updates query state for employee type filter', async () => {
    const user = userEvent.setup();
    const onParamsChange = renderTable();

    await user.selectOptions(screen.getByLabelText(/employee type filter/i), 'CONTRACT');

    expect(onParamsChange).toHaveBeenCalledWith(expect.objectContaining({ employmentType: 'CONTRACT', page: 1 }));
  });

  it('updates query state for search input', async () => {
    const user = userEvent.setup();
    const onParamsChange = renderTable();

    await user.type(screen.getByLabelText(/search employees/i), 't');

    expect(onParamsChange).toHaveBeenLastCalledWith(expect.objectContaining({ search: 't', page: 1 }));
  });

  it('updates query state for pagination', async () => {
    const user = userEvent.setup();
    const onParamsChange = renderTable();

    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(onParamsChange).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
  });

  it('updates query state for sorting', async () => {
    const user = userEvent.setup();
    const onParamsChange = renderTable();

    await user.click(screen.getByRole('button', { name: /email/i }));

    expect(onParamsChange).toHaveBeenCalledWith(expect.objectContaining({
      sortBy: 'workEmail',
      sortOrder: 'asc',
      page: 1,
    }));
  });

  it('renders empty state', () => {
    renderTable({ employees: [], total: 0 });
    expect(screen.getByText(/no employees found/i)).toBeInTheDocument();
  });
});
