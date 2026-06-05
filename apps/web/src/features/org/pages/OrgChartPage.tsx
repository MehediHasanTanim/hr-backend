import { OrgChartTree } from '../components/OrgChartTree';
import { useOrgChartQuery } from '../api/orgApi';

export function OrgChartPage() {
  const chart = useOrgChartQuery();

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Organization chart</h1>
        <p className="text-sm text-muted">Explore reporting lines, managers, and direct reports.</p>
      </div>
      {chart.isLoading ? <p>Loading org chart...</p> : null}
      {chart.error ? <p className="text-red-600">Unable to load org chart.</p> : null}
      {chart.data ? <OrgChartTree nodes={chart.data} /> : null}
    </section>
  );
}
