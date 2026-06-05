import Tree from 'react-d3-tree';
import { Card } from '../../../components/ui';
import type { OrgChartNode } from '../types/org.types';

type TreeNode = {
  name: string;
  attributes: Record<string, string | number>;
  children: TreeNode[];
};

export function OrgChartTree({ nodes }: { nodes: OrgChartNode[] }) {
  if (nodes.length === 0) return <Card className="text-sm text-muted">No reporting hierarchy found.</Card>;

  const data = nodes.map(toTreeNode);
  const headcount = countNodes(nodes);

  return (
    <Card className="h-[680px] p-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-semibold">Reporting hierarchy</h2>
        <span className="text-sm text-muted">{headcount} employees</span>
      </div>
      <div className="h-[620px]">
        <Tree
          data={data}
          orientation="vertical"
          translate={{ x: 520, y: 80 }}
          zoomable
          collapsible
          nodeSize={{ x: 260, y: 150 }}
          renderCustomNodeElement={({ nodeDatum, toggleNode }) => (
            <g onClick={toggleNode}>
              <rect width="210" height="88" x="-105" y="-44" rx="8" fill="#fff" stroke="#d7dde8" />
              <text textAnchor="middle" y="-16" fill="#17202a" fontSize="14" fontWeight="600">{nodeDatum.name}</text>
              <text textAnchor="middle" y="8" fill="#667085" fontSize="12">{nodeDatum.attributes?.jobTitle}</text>
              <text textAnchor="middle" y="30" fill="#667085" fontSize="12">{nodeDatum.attributes?.department} · {nodeDatum.attributes?.reports} reports</text>
            </g>
          )}
        />
      </div>
    </Card>
  );
}

function toTreeNode(node: OrgChartNode): TreeNode {
  return {
    name: node.name,
    attributes: {
      jobTitle: node.jobTitle ?? 'Unassigned',
      department: node.department ?? 'No department',
      reports: node.children.length,
    },
    children: node.children.map(toTreeNode),
  };
}

function countNodes(nodes: OrgChartNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0);
}
