import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Button, Card, SecondaryButton } from '../../../components/ui';
import { useBulkImportJobQuery, useBulkImportMutation } from '../api/employeeApi';

export function EmployeeImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [jobId, setJobId] = useState<string>();
  const importMutation = useBulkImportMutation();
  const job = useBulkImportJobQuery(jobId);

  async function startImport() {
    if (!file) return;
    const csv = await file.text();
    const created = await importMutation.mutateAsync(csv);
    setJobId(created.id);
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Import employees</h1>
      <Card className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium">CSV file</span>
          <input
            aria-label="CSV file"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              if (selected && !selected.name.endsWith('.csv')) {
                setFile(null);
                setFileError('Upload a CSV file.');
                return;
              }
              setFile(selected);
              setFileError('');
            }}
          />
        </label>
        {file ? <p className="text-sm text-muted">{file.name} · {(file.size / 1024).toFixed(1)} KB</p> : null}
        {fileError ? <p className="text-sm text-red-600">{fileError}</p> : null}
        <div className="flex gap-2">
          <Button disabled={!file || importMutation.isPending} onClick={startImport}><Upload className="h-4 w-4" /> Start import</Button>
          <SecondaryButton onClick={() => setJobId(undefined)}>Retry</SecondaryButton>
        </div>
      </Card>

      {job.data ? (
        <Card>
          <div className="grid gap-3 md:grid-cols-4">
            <Metric label="Status" value={job.data.status} />
            <Metric label="Total rows" value={job.data.totalRows} />
            <Metric label="Successful" value={job.data.successfulRows} />
            <Metric label="Failed" value={job.data.failedRows} />
          </div>
          {job.data.errors?.length ? (
            <table className="mt-4 w-full text-left text-sm">
              <thead><tr><th>Row</th><th>Field</th><th>Error message</th><th>Raw value</th></tr></thead>
              <tbody>
                {job.data.errors.map((error, index) => (
                  <tr key={`${error.row}-${index}`} className="border-t border-border">
                    <td className="py-2">{error.row}</td>
                    <td>{error.field ?? '-'}</td>
                    <td>{error.message ?? error.errors?.join(', ')}</td>
                    <td>{error.rawValue ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </Card>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div><p className="text-xs uppercase text-muted">{label}</p><p className="text-lg font-semibold">{value}</p></div>;
}
