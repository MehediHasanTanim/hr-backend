// ---------------------------------------------------------------------------
// Sprint 5: Shared test factories for Documents, Policy, Esign, Notifications
// ---------------------------------------------------------------------------

export const makeEmployeeDocument = (overrides: Record<string, unknown> = {}) => ({
  id: 'doc-uuid-1',
  companyId: 'company-1',
  employeeId: 'emp-uuid-1',
  templateId: null,
  name: 'contract.pdf',
  type: 'CONTRACT',
  category: 'CONTRACT',
  fileUrl: null,
  fileSize: 204800,
  mimeType: 'application/pdf',
  s3Key: 'documents/emp-uuid-1/contract/uuid-v1.pdf',
  sha256Hash: 'a'.repeat(64),
  version: 1,
  description: null,
  expiresAt: null,
  isVerified: false,
  uploadedById: 'admin-uuid-1',
  createdAt: new Date('2025-01-01T00:00:00Z'),
  deletedAt: null,
  ...overrides,
});

export const makePolicy = (overrides: Record<string, unknown> = {}) => ({
  id: 'policy-uuid-1',
  companyId: 'company-1',
  title: 'Remote Work Policy',
  content: '## Remote Work Guidelines\n...',
  category: 'HR',
  status: 'DRAFT' as const,
  createdBy: 'admin-uuid-1',
  publishedBy: null,
  publishedAt: null,
  version: 1,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
  ...overrides,
});

export const makePolicyAcknowledgement = (overrides: Record<string, unknown> = {}) => ({
  id: 'ack-uuid-1',
  policyId: 'policy-uuid-1',
  employeeId: 'emp-uuid-1',
  companyId: 'company-1',
  acknowledgedAt: new Date('2025-01-02T00:00:00Z'),
  ...overrides,
});

export const makeEsignRequest = (overrides: Record<string, unknown> = {}) => ({
  id: 'esign-uuid-1',
  companyId: 'company-1',
  documentId: 'doc-uuid-1',
  requestedBy: 'admin-uuid-1',
  signerEmployeeId: 'emp-uuid-1',
  status: 'PENDING' as const,
  base64Signature: null as string | null,
  documentSha256AtSign: null as string | null,
  declineReason: null as string | null,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  signedAt: null as Date | null,
  declinedAt: null as Date | null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
  ...overrides,
});

export const makeNotification = (overrides: Record<string, unknown> = {}) => ({
  id: 'notif-uuid-1',
  companyId: 'company-1',
  userId: 'emp-uuid-1',
  type: 'LEAVE_APPROVED' as const,
  title: 'Leave Approved',
  body: 'Your leave has been approved.',
  actionUrl: null as string | null,
  metadata: null as Record<string, unknown> | null,
  isRead: false,
  readAt: null as Date | null,
  channel: 'IN_APP' as const,
  emailSent: false,
  emailSentAt: null as Date | null,
  deliveredAt: null as Date | null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  ...overrides,
});

export const makeMockRequestContext = (overrides: Partial<{
  userId: string;
  companyId: string;
  email: string;
  roles: string[];
  permissions: string[];
}> = {}) => ({
  userId: 'user-1',
  companyId: 'company-1',
  email: 'admin@test.com',
  roles: ['admin'],
  permissions: ['admin:read', 'admin:write'],
  sessionId: 'session-1',
  traceId: 'trace-1',
  ...overrides,
});
