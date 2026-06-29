// Document events
export const DOCUMENT_UPLOADED = 'hr.document.uploaded';
export const DOCUMENT_SIGNED_URL_GENERATED = 'hr.document.signed_url_generated';

// Policy events
export const POLICY_CREATED = 'hr.policy.created';
export const POLICY_UPDATED = 'hr.policy.updated';
export const POLICY_PUBLISHED = 'hr.policy.published';
export const POLICY_ARCHIVED = 'hr.policy.archived';
export const POLICY_ACKNOWLEDGED = 'hr.policy.acknowledged';

// Esign events
export const ESIGN_REQUEST_CREATED = 'hr.esign.request_created';
export const ESIGN_DOCUMENT_SIGNED = 'hr.esign.signed';
export const ESIGN_REQUEST_DECLINED = 'hr.esign.declined';
export const ESIGN_REQUEST_EXPIRED = 'hr.esign.expired';

// Leave events (for notification wiring)
export const LEAVE_REQUESTED = 'hr.leave.requested';
export const LEAVE_APPROVED = 'hr.leave.approved';
export const LEAVE_REJECTED = 'hr.leave.rejected';

// Payslip events
export const PAYSLIP_READY = 'hr.payslip.ready';

// Audit events
export const AUDIT_EXPORT_QUEUED = 'hr.audit.export_queued';
export const AUDIT_EXPORT_READY = 'hr.audit.export_ready';

// Audit action constants
export const AUDIT_ACTIONS = {
  DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
  DOCUMENT_SIGNED_URL_GENERATED: 'DOCUMENT_SIGNED_URL_GENERATED',
  POLICY_CREATED: 'POLICY_CREATED',
  POLICY_UPDATED: 'POLICY_UPDATED',
  POLICY_PUBLISHED: 'POLICY_PUBLISHED',
  POLICY_ARCHIVED: 'POLICY_ARCHIVED',
  POLICY_ACKNOWLEDGED: 'POLICY_ACKNOWLEDGED',
  ESIGN_REQUEST_CREATED: 'ESIGN_REQUEST_CREATED',
  ESIGN_DOCUMENT_SIGNED: 'ESIGN_DOCUMENT_SIGNED',
  ESIGN_REQUEST_DECLINED: 'ESIGN_REQUEST_DECLINED',
  ESIGN_REQUEST_EXPIRED: 'ESIGN_REQUEST_EXPIRED',
  AUDIT_EXPORT_QUEUED: 'AUDIT_EXPORT_QUEUED',
} as const;
