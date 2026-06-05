import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Building2, GitBranch, Upload, Users } from 'lucide-react';
import { EmployeeCreatePage } from './features/employees/pages/EmployeeCreatePage';
import { EmployeeEditPage } from './features/employees/pages/EmployeeEditPage';
import { EmployeeImportPage } from './features/employees/pages/EmployeeImportPage';
import { EmployeeListPage } from './features/employees/pages/EmployeeListPage';
import { EmployeeProfilePage } from './features/employees/pages/EmployeeProfilePage';
import { DepartmentManagementPage } from './features/org/pages/DepartmentManagementPage';
import { OrgChartPage } from './features/org/pages/OrgChartPage';

export function App() {
  const location = useLocation();
  const [toast, setToast] = useState('');

  useEffect(() => {
    const handler = (event: Event) => {
      setToast((event as CustomEvent<string>).detail);
      window.setTimeout(() => setToast(''), 3000);
    };
    window.addEventListener('app-toast', handler);
    return () => window.removeEventListener('app-toast', handler);
  }, []);

  const route = useMemo(() => matchRoute(location.pathname), [location.pathname]);

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-white p-4 md:block">
        <div className="mb-6 flex items-center gap-2 text-lg font-semibold">
          <Building2 className="h-5 w-5" />
          HR ERP
        </div>
        <nav className="space-y-1">
          <NavItem icon={<Users className="h-4 w-4" />} label="Employees" href="/employees" active={location.pathname.startsWith('/employees') && !location.pathname.endsWith('/import')} />
          <NavItem icon={<Upload className="h-4 w-4" />} label="Import" href="/employees/import" active={location.pathname === '/employees/import'} />
          <NavItem icon={<GitBranch className="h-4 w-4" />} label="Org chart" href="/org-chart" active={location.pathname === '/org-chart'} />
          <NavItem icon={<Building2 className="h-4 w-4" />} label="Departments" href="/departments" active={location.pathname === '/departments'} />
        </nav>
      </aside>
      <main className="mx-auto max-w-7xl px-4 py-6 md:ml-64 md:px-8">
        {route}
      </main>
      {toast ? (
        <div className="fixed bottom-4 right-4 rounded-md bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">{toast}</div>
      ) : null}
    </div>
  );
}

function NavItem({ icon, label, href, active }: { icon: ReactNode; label: string; href: string; active: boolean }) {
  return (
    <button
      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
      onClick={() => navigate(href)}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function matchRoute(pathname: string) {
  if (pathname === '/' || pathname === '/employees') return <EmployeeListPage />;
  if (pathname === '/employees/create') return <EmployeeCreatePage />;
  if (pathname === '/employees/import') return <EmployeeImportPage />;
  const editMatch = pathname.match(/^\/employees\/([^/]+)\/edit$/);
  if (editMatch?.[1]) return <EmployeeEditPage id={editMatch[1]} />;
  const profileMatch = pathname.match(/^\/employees\/([^/]+)$/);
  if (profileMatch?.[1]) return <EmployeeProfilePage id={profileMatch[1]} />;
  if (pathname === '/org-chart') return <OrgChartPage />;
  if (pathname === '/departments') return <DepartmentManagementPage />;
  return <EmployeeListPage />;
}

function useLocation() {
  const [location, setLocation] = useState(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }));
  useEffect(() => {
    const update = () => setLocation({
      pathname: window.location.pathname,
      search: window.location.search,
    });
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  return location;
}

function navigate(path: string) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
