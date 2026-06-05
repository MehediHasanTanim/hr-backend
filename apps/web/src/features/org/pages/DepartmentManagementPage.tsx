import { DepartmentTreeList } from '../components/DepartmentTreeList';
import { useCreateDepartmentMutation, useDepartmentsQuery, useUpdateDepartmentMutation } from '../api/orgApi';

export function DepartmentManagementPage() {
  const departments = useDepartmentsQuery();
  const createDepartment = useCreateDepartmentMutation();
  const updateDepartment = useUpdateDepartmentMutation();

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Departments</h1>
        <p className="text-sm text-muted">Maintain department hierarchy and assignment readiness.</p>
      </div>
      {departments.isLoading ? <p>Loading departments...</p> : null}
      {departments.error ? <p className="text-red-600">Unable to load departments.</p> : null}
      <DepartmentTreeList
        departments={departments.data ?? []}
        onSave={(data) => {
          if (data.id) updateDepartment.mutate({ id: data.id, data });
          else createDepartment.mutate(data);
        }}
        onDeactivate={(id) => updateDepartment.mutate({ id, data: { isActive: false } })}
      />
    </section>
  );
}
