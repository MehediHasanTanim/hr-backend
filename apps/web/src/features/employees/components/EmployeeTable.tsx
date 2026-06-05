import { ArrowDown, ArrowUp, ChevronsUpDown, Eye, Pencil, Search, Trash2 } from 'lucide-react';
import type { Employee, EmployeeListParams } from '../types/employee.types';
import type { Department, Location } from '../../org/types/org.types';
import { Badge, Button, DangerButton, Input, SecondaryButton, Select } from '../../../components/ui';

interface EmployeeTableProps {
  employees: Employee[];
  total: number;
  params: EmployeeListParams;
  departments: Department[];
  locations?: Location[];
  isLoading?: boolean;
  error?: Error | null;
  onParamsChange: (next: EmployeeListParams) => void;
  onView?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function EmployeeTable({
  employees,
  total,
  params,
  departments,
  isLoading,
  error,
  onParamsChange,
  onView,
  onEdit,
  onDelete,
}: EmployeeTableProps) {
  const pages = Math.max(1, Math.ceil(total / params.pageSize));

  function patch(next: Partial<EmployeeListParams>) {
    onParamsChange({ ...params, ...next });
  }

  function sortBy(field: string) {
    patch({
      sortBy: field,
      sortOrder: params.sortBy === field && params.sortOrder === 'asc' ? 'desc' : 'asc',
      page: 1,
    });
  }

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">Unable to load employees.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <label className="relative">
          <span className="sr-only">Search employees</span>
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <Input
            aria-label="Search employees"
            className="pl-9"
            placeholder="Search name, email, number"
            value={params.search ?? ''}
            onChange={(event) => patch({ search: event.target.value, page: 1 })}
          />
        </label>
        <Select aria-label="Department filter" value={params.department ?? ''} onChange={(event) => patch({ department: event.target.value, page: 1 })}>
          <option value="">All departments</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>{department.name}</option>
          ))}
        </Select>
        <Select aria-label="Status filter" value={params.status ?? ''} onChange={(event) => patch({ status: event.target.value, page: 1 })}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="ON_LEAVE">On leave</option>
          <option value="TERMINATED">Terminated</option>
        </Select>
        <Select aria-label="Employee type filter" value={params.employmentType ?? ''} onChange={(event) => patch({ employmentType: event.target.value, page: 1 })}>
          <option value="">All types</option>
          <option value="FULL_TIME">Full time</option>
          <option value="PART_TIME">Part time</option>
          <option value="CONTRACT">Contract</option>
          <option value="INTERN">Intern</option>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-muted">
            <tr>
              <SortableHeader label="Employee name" field="employeeNumber" params={params} onSort={sortBy} />
              <SortableHeader label="Employee number" field="employeeNumber" params={params} onSort={sortBy} />
              <SortableHeader label="Email" field="workEmail" params={params} onSort={sortBy} />
              <th className="px-3 py-3">Department</th>
              <th className="px-3 py-3">Job title</th>
              <SortableHeader label="Status" field="status" params={params} onSort={sortBy} />
              <th className="px-3 py-3">Employee type</th>
              <th className="px-3 py-3">Location</th>
              <SortableHeader label="Joining date" field="joinedAt" params={params} onSort={sortBy} />
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <tr key={index} className="border-t border-border">
                  <td colSpan={10} className="px-3 py-3">
                    <div className="h-5 animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-muted">No employees found.</td>
              </tr>
            ) : employees.map((employee) => (
              <tr key={employee.id} className="border-t border-border">
                <td className="px-3 py-3 font-medium">{employeeName(employee)}</td>
                <td className="px-3 py-3">{employee.employeeNumber}</td>
                <td className="px-3 py-3">{employee.workEmail}</td>
                <td className="px-3 py-3">{employee.department?.name ?? '-'}</td>
                <td className="px-3 py-3">{employee.jobTitle?.title ?? '-'}</td>
                <td className="px-3 py-3"><Badge>{employee.status}</Badge></td>
                <td className="px-3 py-3">{employee.employmentType.replace('_', ' ')}</td>
                <td className="px-3 py-3">{employee.location?.name ?? '-'}</td>
                <td className="px-3 py-3">{formatDate(employee.joinedAt)}</td>
                <td className="px-3 py-3">
                  <div className="flex gap-2">
                    <SecondaryButton aria-label={`View ${employee.employeeNumber}`} onClick={() => onView?.(employee.id)}><Eye className="h-4 w-4" /></SecondaryButton>
                    <SecondaryButton aria-label={`Edit ${employee.employeeNumber}`} onClick={() => onEdit?.(employee.id)}><Pencil className="h-4 w-4" /></SecondaryButton>
                    <DangerButton aria-label={`Delete ${employee.employeeNumber}`} onClick={() => onDelete?.(employee.id)}><Trash2 className="h-4 w-4" /></DangerButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">Page {params.page} of {pages}</span>
        <div className="flex gap-2">
          <SecondaryButton disabled={params.page <= 1} onClick={() => patch({ page: params.page - 1 })}>Previous</SecondaryButton>
          <Button disabled={params.page >= pages} onClick={() => patch({ page: params.page + 1 })}>Next</Button>
        </div>
      </div>
    </div>
  );
}

function SortableHeader({ label, field, params, onSort }: { label: string; field: string; params: EmployeeListParams; onSort: (field: string) => void }) {
  const active = params.sortBy === field;
  const Icon = !active ? ChevronsUpDown : params.sortOrder === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className="px-3 py-3">
      <button className="inline-flex items-center gap-1" onClick={() => onSort(field)} type="button">
        {label}
        <Icon className="h-3.5 w-3.5" />
      </button>
    </th>
  );
}

function employeeName(employee: Employee) {
  const emailName = employee.workEmail.split('@')[0]?.replace(/[._-]/g, ' ');
  return emailName || employee.employeeNumber;
}

function formatDate(date: string) {
  return date ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(date)) : '-';
}
