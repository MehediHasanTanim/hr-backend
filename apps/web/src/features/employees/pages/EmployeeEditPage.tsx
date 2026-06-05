import { EmployeeForm } from '../components/EmployeeForm';
import { useEmployeeQuery, useUpdateEmployeeMutation } from '../api/employeeApi';
import { useDepartmentsQuery, useJobTitlesQuery, useLocationsQuery, usePayGradesQuery } from '../../org/api/orgApi';
import { toast } from '../../../lib/toast';

export function EmployeeEditPage({ id }: { id: string }) {
  const employee = useEmployeeQuery(id);
  const updateEmployee = useUpdateEmployeeMutation(id);
  const departments = useDepartmentsQuery();
  const jobTitles = useJobTitlesQuery();
  const payGrades = usePayGradesQuery();
  const locations = useLocationsQuery();

  if (employee.isLoading) return <p>Loading employee...</p>;
  if (!employee.data) return <p>Employee not found.</p>;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Edit employee</h1>
      <EmployeeForm
        defaultValues={{
          employeeNumber: employee.data.employeeNumber,
          workEmail: employee.data.workEmail,
          email: employee.data.profile?.personalEmail ?? employee.data.workEmail,
          phone: employee.data.workPhone ?? '',
          joinedAt: employee.data.joinedAt?.slice(0, 10),
          employmentType: employee.data.employmentType,
          status: employee.data.status,
          departmentId: employee.data.department?.id ?? '',
          jobTitleId: employee.data.jobTitle?.id ?? '',
          payGradeId: employee.data.payGrade?.id ?? '',
          locationId: employee.data.location?.id ?? '',
          bankName: employee.data.bankAccounts?.[0]?.bankName ?? '',
          accountName: employee.data.bankAccounts?.[0]?.accountName ?? '',
          accountNumber: '',
          routingNumber: employee.data.bankAccounts?.[0]?.routingNumber ?? '',
        }}
        departments={departments.data ?? []}
        jobTitles={jobTitles.data ?? []}
        payGrades={payGrades.data ?? []}
        locations={locations.data ?? []}
        isSaving={updateEmployee.isPending}
        onSubmit={async (values) => {
          await updateEmployee.mutateAsync(values);
          toast('Employee updated');
          navigate(`/employees/${id}`);
        }}
      />
    </section>
  );
}

function navigate(path: string) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
