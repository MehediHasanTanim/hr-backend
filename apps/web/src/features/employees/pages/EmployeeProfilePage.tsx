import { EmployeeProfileTabs } from '../components/EmployeeProfileTabs';
import { useEmployeeQuery, useEmploymentHistoryQuery } from '../api/employeeApi';

export function EmployeeProfilePage({ id }: { id: string }) {
  const employee = useEmployeeQuery(id);
  const history = useEmploymentHistoryQuery(id);

  if (employee.isLoading) return <p>Loading profile...</p>;
  if (employee.error) return <p>Unable to load employee profile.</p>;
  if (!employee.data) return <p>Employee not found.</p>;

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{employee.data.employeeNumber}</h1>
        <p className="text-sm text-muted">{employee.data.workEmail}</p>
      </div>
      <EmployeeProfileTabs employee={employee.data} history={history.data ?? []} />
    </section>
  );
}
