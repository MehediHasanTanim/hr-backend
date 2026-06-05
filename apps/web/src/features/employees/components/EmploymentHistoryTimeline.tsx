import { Badge, Card } from '../../../components/ui';
import type { EmploymentHistory } from '../types/employee.types';

export function EmploymentHistoryTimeline({ history }: { history: EmploymentHistory[] }) {
  const sorted = [...history].sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime());

  if (sorted.length === 0) {
    return <Card className="text-sm text-muted">No employment history yet.</Card>;
  }

  return (
    <ol className="space-y-3">
      {sorted.map((item) => (
        <li key={item.id} className="relative rounded-lg border border-border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge>{labelFor(item.eventType)}</Badge>
            <time className="text-sm text-muted">{formatDate(item.effectiveDate)}</time>
          </div>
          <dl className="mt-3 grid gap-3 text-sm md:grid-cols-3">
            <div>
              <dt className="font-medium">Old value</dt>
              <dd className="text-muted">{String(item.metadata?.oldValue ?? '-')}</dd>
            </div>
            <div>
              <dt className="font-medium">New value</dt>
              <dd className="text-muted">{String(item.metadata?.newValue ?? '-')}</dd>
            </div>
            <div>
              <dt className="font-medium">Changed by</dt>
              <dd className="text-muted">{item.createdById ?? '-'}</dd>
            </div>
          </dl>
          {item.notes ? <p className="mt-3 text-sm text-slate-700">{item.notes}</p> : null}
        </li>
      ))}
    </ol>
  );
}

function labelFor(eventType: EmploymentHistory['eventType']) {
  return {
    HIRED: 'Hired',
    PROMOTED: 'Promoted',
    TRANSFERRED: 'Transferred',
    TERMINATED: 'Terminated',
    UPDATED: 'Updated',
  }[eventType];
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(date));
}
