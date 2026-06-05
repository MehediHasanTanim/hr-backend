import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../../lib/apiClient';
import type { Department, JobTitle, Location, OrgChartNode, PayGrade } from '../types/org.types';

export function useDepartmentsQuery() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: () => apiRequest<Department[]>('/departments'),
  });
}

export function useLocationsQuery() {
  return useQuery({
    queryKey: ['locations'],
    queryFn: () => apiRequest<Location[]>('/locations'),
  });
}

export function useJobTitlesQuery() {
  return useQuery({
    queryKey: ['job-titles'],
    queryFn: () => apiRequest<JobTitle[]>('/job-titles'),
  });
}

export function usePayGradesQuery() {
  return useQuery({
    queryKey: ['pay-grades'],
    queryFn: () => apiRequest<PayGrade[]>('/pay-grades'),
  });
}

export function useOrgChartQuery() {
  return useQuery({
    queryKey: ['org-chart'],
    queryFn: () => apiRequest<OrgChartNode[]>('/org-chart'),
  });
}

export function useCreateDepartmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Department>) =>
      apiRequest<Department>('/departments', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['departments'] }),
  });
}

export function useUpdateDepartmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Department> }) =>
      apiRequest<Department>(`/departments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['departments'] }),
  });
}
