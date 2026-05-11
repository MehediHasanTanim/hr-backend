export interface RequestContext {
  userId: string;
  companyId: string;
  email: string;
  roles: string[];
  permissions: string[];
  sessionId: string;
  traceId: string;
}
