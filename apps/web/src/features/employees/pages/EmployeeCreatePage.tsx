import { EmployeeForm } from '../components/EmployeeForm';
import { useCreateEmployeeMutation } from '../api/employeeApi';
import { useDepartmentsQuery, useJobTitlesQuery, useLocationsQuery, usePayGradesQuery } from '../../org/api/orgApi';
import { toast } from '../../../lib/toast';

export function EmployeeCreatePage() {
  const createEmployee = useCreateEmployeeMutation();
  const departments = useDepartmentsQuery();
  const jobTitles = useJobTitlesQuery();
  const payGrades = usePayGradesQuery();
  const locations = useLocationsQuery();

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Create employee</h1>
      <EmployeeForm
        departments={departments.data ?? []}
        jobTitles={jobTitles.data ?? []}
        payGrades={payGrades.data ?? []}
        locations={locations.data ?? []}
        isSaving={createEmployee.isPending}
        onSaveDraft={() => toast('Draft saved locally')}
        onSubmit={async (values) => {
          const employee = await createEmployee.mutateAsync(values);
          toast('Employee created');
          navigate(`/employees/${employee.id}`);
        }}
      />
    </section>
  );
}

function navigate(path: string) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
