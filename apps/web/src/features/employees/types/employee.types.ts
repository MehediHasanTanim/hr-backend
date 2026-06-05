export type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE' | 'TERMINATED';
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';

export interface Lookup {
  id: string;
  name?: string;
  title?: string;
  code?: string;
}

export interface Employee {
  id: string;
  employeeNumber: string;
  workEmail: string;
  workPhone?: string | null;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  joinedAt: string;
  probationEndsAt?: string | null;
  department?: Lookup | null;
  jobTitle?: Lookup | null;
  location?: Lookup | null;
  payGrade?: Lookup | null;
  manager?: { id: string; employeeNumber: string; workEmail: string } | null;
  profile?: {
    personalEmail?: string | null;
    personalPhone?: string | null;
    nationalId?: string | null;
    passportNumber?: string | null;
  } | null;
  bankAccounts?: BankAccount[];
}

export interface BankAccount {
  id: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  routingNumber?: string | null;
  currency: string;
  isPrimary: boolean;
}

export interface EmploymentHistory {
  id: string;
  eventType: 'HIRED' | 'PROMOTED' | 'TRANSFERRED' | 'TERMINATED' | 'UPDATED';
  effectiveDate: string;
  notes?: string | null;
  createdById?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface EmployeeListParams {
  search?: string;
  department?: string;
  status?: string;
  employmentType?: string;
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export interface PaginatedEmployees {
  items: Employee[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BulkImportJob {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalRows: number;
  successfulRows: number;
  failedRows: number;
  errors?: Array<{ row: number; field?: string; message?: string; rawValue?: string; errors?: string[] }>;
}
