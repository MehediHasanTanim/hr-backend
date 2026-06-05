import { Plus, Upload } from 'lucide-react';
import { Button, Card, SecondaryButton } from '../../../components/ui';
import { useDeleteEmployeeMutation, useEmployeesQuery } from '../api/employeeApi';
import { EmployeeTable } from '../components/EmployeeTable';
import type { EmployeeListParams } from '../types/employee.types';
import { useDepartmentsQuery } from '../../org/api/orgApi';

export function EmployeeListPage() {
  const params = readParams();
  const employees = useEmployeesQuery(params);
  const departments = useDepartmentsQuery();
  const deleteEmployee = useDeleteEmployeeMutation();

  function setParams(next: EmployeeListParams) {
    const search = new URLSearchParams();
    Object.entries(next).forEach(([key, value]) => {
      if (value !== undefined && value !== '') search.set(key, String(value));
    });
    window.history.pushState(null, '', `/employees?${search.toString()}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Employees</h1>
          <p className="text-sm text-muted">Manage employees, assignments, and lifecycle state.</p>
        </div>
        <div className="flex gap-2">
          <SecondaryButton onClick={() => navigate('/employees/import')}><Upload className="h-4 w-4" /> Import</SecondaryButton>
          <Button onClick={() => navigate('/employees/create')}><Plus className="h-4 w-4" /> New employee</Button>
        </div>
      </div>
      <Card>
        <EmployeeTable
          employees={employees.data?.items ?? []}
          total={employees.data?.total ?? 0}
          params={params}
          departments={departments.data ?? []}
          isLoading={employees.isLoading}
          error={employees.error}
          onParamsChange={setParams}
          onView={(id) => navigate(`/employees/${id}`)}
          onEdit={(id) => navigate(`/employees/${id}/edit`)}
          onDelete={(id) => {
            if (window.confirm('Delete this employee?')) deleteEmployee.mutate(id);
          }}
        />
      </Card>
    </section>
  );
}

function readParams(): EmployeeListParams {
  const params = new URLSearchParams(window.location.search);
  return {
    search: params.get('search') ?? '',
    department: params.get('department') ?? '',
    status: params.get('status') ?? '',
    employmentType: params.get('employmentType') ?? '',
    page: Number(params.get('page') ?? 1),
    pageSize: Number(params.get('pageSize') ?? 25),
    sortBy: params.get('sortBy') ?? 'employeeNumber',
    sortOrder: (params.get('sortOrder') as 'asc' | 'desc') ?? 'asc',
  };
}

function navigate(path: string) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
