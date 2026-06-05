import { useMemo, useState } from 'react';
import { Button, Card, Input, Select, SecondaryButton, Badge } from '../../../components/ui';
import type { Department } from '../types/org.types';

interface DepartmentTreeListProps {
  departments: Department[];
  onSave: (data: Partial<Department>) => void;
  onDeactivate: (id: string) => void;
}

export function DepartmentTreeList({ departments, onSave, onDeactivate }: DepartmentTreeListProps) {
  const [editing, setEditing] = useState<Department | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [parentId, setParentId] = useState('');

  const invalidParentIds = useMemo(() => editing ? collectDescendantIds(editing, departments) : [], [editing, departments]);

  function startEdit(department: Department) {
    setEditing(department);
    setName(department.name);
    setCode(department.code);
    setParentId(department.parentId ?? '');
  }

  function clear() {
    setEditing(null);
    setName('');
    setCode('');
    setParentId('');
  }

  function submit() {
    const payload: Partial<Department> = {
      name,
      code,
      parentId: parentId || null,
      isActive: true,
    };
    if (editing) payload.id = editing.id;
    onSave(payload);
    clear();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card>
        <h2 className="mb-3 font-semibold">Department tree</h2>
        {departments.length === 0 ? <p className="text-sm text-muted">No departments yet.</p> : (
          <ul className="space-y-2">
            {treeify(departments).map((department) => (
              <DepartmentNode
                key={department.id}
                department={department}
                depth={0}
                onEdit={startEdit}
                onDeactivate={onDeactivate}
              />
            ))}
          </ul>
        )}
      </Card>
      <Card className="space-y-3">
        <h2 className="font-semibold">{editing ? 'Edit department' : 'Add department'}</h2>
        <label>
          <span className="mb-1 block text-sm font-medium">Name</span>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium">Code</span>
          <Input value={code} onChange={(event) => setCode(event.target.value)} />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium">Parent department</span>
          <Select value={parentId} onChange={(event) => setParentId(event.target.value)}>
            <option value="">No parent</option>
            {departments.map((department) => (
              <option
                key={department.id}
                value={department.id}
                disabled={department.id === editing?.id || invalidParentIds.includes(department.id)}
              >
                {department.name}
              </option>
            ))}
          </Select>
        </label>
        <div className="flex gap-2">
          <Button disabled={!name || !code} onClick={submit}>Save</Button>
          <SecondaryButton onClick={clear}>Clear</SecondaryButton>
        </div>
      </Card>
    </div>
  );
}

function DepartmentNode({ department, depth, onEdit, onDeactivate }: { department: Department; depth: number; onEdit: (department: Department) => void; onDeactivate: (id: string) => void }) {
  return (
    <li>
      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2" style={{ marginLeft: depth * 18 }}>
        <div>
          <p className="font-medium">{department.name} <span className="text-xs text-muted">({department.code})</span></p>
          <p className="text-xs text-muted">Head: {department.head?.workEmail ?? 'Unassigned'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{department.isActive ? 'Active' : 'Inactive'}</Badge>
          <SecondaryButton onClick={() => onEdit(department)}>Edit</SecondaryButton>
          <SecondaryButton onClick={() => onDeactivate(department.id)}>Deactivate</SecondaryButton>
        </div>
      </div>
      {department.children?.length ? (
        <ul className="mt-2 space-y-2">
          {department.children.map((child) => (
            <DepartmentNode key={child.id} department={child} depth={depth + 1} onEdit={onEdit} onDeactivate={onDeactivate} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function treeify(departments: Department[]): Department[] {
  const byId = new Map(departments.map((department) => [department.id, { ...department, children: [] as Department[] }]));
  const roots: Department[] = [];
  byId.forEach((department) => {
    if (department.parentId && byId.has(department.parentId)) {
      byId.get(department.parentId)?.children?.push(department);
    } else {
      roots.push(department);
    }
  });
  return roots;
}

function collectDescendantIds(target: Department, departments: Department[]): string[] {
  const direct = departments.filter((department) => department.parentId === target.id);
  return direct.flatMap((department) => [department.id, ...collectDescendantIds(department, departments)]);
}
