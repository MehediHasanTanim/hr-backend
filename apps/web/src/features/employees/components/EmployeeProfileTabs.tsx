import { useState } from 'react';
import { Card, Badge } from '../../../components/ui';
import type { Employee, EmploymentHistory } from '../types/employee.types';
import { EmploymentHistoryTimeline } from './EmploymentHistoryTimeline';

const tabs = ['Overview', 'Documents', 'History', 'Leave', 'Payroll'] as const;

export function EmployeeProfileTabs({ employee, history }: { employee: Employee; history: EmploymentHistory[] }) {
  const [active, setActive] = useState<(typeof tabs)[number]>('Overview');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`px-3 py-2 text-sm font-medium ${active === tab ? 'border-b-2 border-slate-900 text-slate-900' : 'text-muted'}`}
            onClick={() => setActive(tab)}
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>

      {active === 'Overview' ? <Overview employee={employee} /> : null}
      {active === 'Documents' ? <Placeholder title="Documents" text="Document listing and upload will appear here." /> : null}
      {active === 'History' ? <EmploymentHistoryTimeline history={history} /> : null}
      {active === 'Leave' ? <Placeholder title="Leave" text="Leave summary will appear here." /> : null}
      {active === 'Payroll' ? <Placeholder title="Payroll" text="Payroll summary will appear here." /> : null}
    </div>
  );
}

function Overview({ employee }: { employee: Employee }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Employment details</h2>
          <Badge>{employee.status}</Badge>
        </div>
        <Details rows={[
          ['Employee number', employee.employeeNumber],
          ['Type', employee.employmentType.replace('_', ' ')],
          ['Joined', formatDate(employee.joinedAt)],
          ['Department', employee.department?.name ?? '-'],
          ['Job title', employee.jobTitle?.title ?? '-'],
          ['Location', employee.location?.name ?? '-'],
          ['Manager', employee.manager?.workEmail ?? '-'],
        ]} />
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Contact information</h2>
        <Details rows={[
          ['Work email', employee.workEmail],
          ['Work phone', employee.workPhone ?? '-'],
          ['Personal email', employee.profile?.personalEmail ?? '-'],
          ['Personal phone', employee.profile?.personalPhone ?? '-'],
          ['National ID', employee.profile?.nationalId ?? '-'],
          ['Passport', employee.profile?.passportNumber ?? '-'],
        ]} />
      </Card>
      <Card className="lg:col-span-2">
        <h2 className="mb-3 font-semibold">Bank details</h2>
        {employee.bankAccounts?.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {employee.bankAccounts.map((account) => (
              <div key={account.id} className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium">{account.bankName}</p>
                <p className="text-muted">{account.accountName} · {account.accountNumber}</p>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted">No bank details on file.</p>}
      </Card>
    </div>
  );
}

function Details({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid gap-3 text-sm md:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="font-medium">{label}</dt>
          <dd className="text-muted">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Placeholder({ title, text }: { title: string; text: string }) {
  return <Card><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm text-muted">{text}</p></Card>;
}

function formatDate(date: string) {
  return date ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(date)) : '-';
}
