export interface Department {
  id: string;
  name: string;
  code: string;
  parentId?: string | null;
  isActive: boolean;
  head?: { employeeNumber: string; workEmail: string } | null;
  children?: Department[];
}

export interface OrgChartNode {
  id: string;
  name: string;
  jobTitle?: string | null;
  department?: string | null;
  managerId?: string | null;
  children: OrgChartNode[];
}

export interface Location {
  id: string;
  name: string;
  code: string;
}

export interface JobTitle {
  id: string;
  title: string;
  code?: string | null;
}

export interface PayGrade {
  id: string;
  name: string;
  code: string;
}
