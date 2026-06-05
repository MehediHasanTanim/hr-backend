import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../../lib/apiClient';
import type {
  BulkImportJob,
  Employee,
  EmployeeListParams,
  EmploymentHistory,
  PaginatedEmployees,
} from '../types/employee.types';
import type { EmployeeFormValues } from '../schemas/employee.schema';

function toSearchParams(params: object) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  return search.toString();
}

export function listEmployees(params: EmployeeListParams) {
  const query = toSearchParams(params);
  return apiRequest<PaginatedEmployees>(`/employees?${query}`);
}

export function getEmployee(id: string) {
  return apiRequest<Employee>(`/employees/${id}`);
}

export function createEmployee(values: EmployeeFormValues) {
  return apiRequest<Employee>('/employees', {
    method: 'POST',
    body: JSON.stringify(toEmployeePayload(values)),
  });
}

export function updateEmployee(id: string, values: EmployeeFormValues) {
  return apiRequest<Employee>(`/employees/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(toEmployeePayload(values)),
  });
}

export function deleteEmployee(id: string) {
  return apiRequest<{ id: string; deleted: boolean }>(`/employees/${id}`, { method: 'DELETE' });
}

export function getEmploymentHistory(employeeId: string) {
  return apiRequest<EmploymentHistory[]>(`/employees/${employeeId}/employment-history`);
}

export function createBankAccount(employeeId: string, values: EmployeeFormValues) {
  return apiRequest(`/employees/${employeeId}/bank-accounts`, {
    method: 'POST',
    body: JSON.stringify({
      accountName: values.accountName,
      accountNumber: values.accountNumber,
      routingNumber: values.routingNumber,
      bankName: values.bankName,
      bankCode: values.branchName,
      currency: 'USD',
      isPrimary: true,
    }),
  });
}

export function bulkImportEmployees(csv: string) {
  return apiRequest<BulkImportJob>('/bulk-import/employees', {
    method: 'POST',
    body: JSON.stringify({ csv }),
  });
}

export function getBulkImportJob(jobId: string) {
  return apiRequest<BulkImportJob>(`/bulk-import/jobs/${jobId}`);
}

export function useEmployeesQuery(params: EmployeeListParams) {
  return useQuery({
    queryKey: ['employees', params],
    queryFn: () => listEmployees(params),
  });
}

export function useEmployeeQuery(id: string) {
  return useQuery({
    queryKey: ['employee', id],
    queryFn: () => getEmployee(id),
    enabled: Boolean(id),
  });
}

export function useCreateEmployeeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createEmployee,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  });
}

export function useUpdateEmployeeMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: EmployeeFormValues) => updateEmployee(id, values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['employee', id] });
    },
  });
}

export function useDeleteEmployeeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteEmployee,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  });
}

export function useEmploymentHistoryQuery(employeeId: string) {
  return useQuery({
    queryKey: ['employment-history', employeeId],
    queryFn: () => getEmploymentHistory(employeeId),
    enabled: Boolean(employeeId),
  });
}

export function useBulkImportMutation() {
  return useMutation({ mutationFn: bulkImportEmployees });
}

export function useBulkImportJobQuery(jobId?: string) {
  return useQuery({
    queryKey: ['bulk-import-job', jobId],
    queryFn: () => getBulkImportJob(jobId ?? ''),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'PENDING' || status === 'PROCESSING' ? 2000 : false;
    },
  });
}

function toEmployeePayload(values: EmployeeFormValues) {
  return {
    employeeNumber: values.employeeNumber,
    firstName: values.firstName,
    lastName: values.lastName,
    email: values.email,
    workEmail: values.workEmail,
    workPhone: values.phone,
    employmentType: values.employmentType,
    status: values.status,
    joinedAt: values.joinedAt,
    probationEndsAt: values.probationEndsAt || undefined,
    departmentId: values.departmentId || undefined,
    jobTitleId: values.jobTitleId || undefined,
    payGradeId: values.payGradeId || undefined,
    managerId: values.managerId || undefined,
    locationId: values.locationId || undefined,
    nationalId: values.nationalId || undefined,
    passportNumber: values.passportNumber || undefined,
    personalEmail: values.email,
    personalPhone: values.phone,
  };
}
