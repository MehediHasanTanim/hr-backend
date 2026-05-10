import { describe, expect, it, vi } from 'vitest';
import { applyTenantScopeOperation } from '../tenant-scope.extension';

describe('TENANT SCOPE EXTENSION', () => {
  describe('READ operations', () => {
    it('findMany — injects companyId and deletedAt:null into where clause', async () => {
      const query = vi.fn();
      await applyTenantScopeOperation({ companyId: 'company-a', model: 'Employee', operation: 'findMany', args: {}, query });
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-a', deletedAt: null }) }));
    });

    it('findMany — preserves existing where conditions alongside injected filters', async () => {
      const query = vi.fn();
      await applyTenantScopeOperation({ companyId: 'company-a', model: 'Employee', operation: 'findMany', args: { where: { status: 'ACTIVE' } }, query });
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'ACTIVE', companyId: 'company-a', deletedAt: null }) }));
    });

    it('findFirst — injects companyId and deletedAt:null', async () => {
      const query = vi.fn();
      await applyTenantScopeOperation({ companyId: 'company-a', model: 'Employee', operation: 'findFirst', args: {}, query });
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-a', deletedAt: null }) }));
    });

    it('findFirstOrThrow — injects companyId and deletedAt:null', async () => {
      const query = vi.fn();
      await applyTenantScopeOperation({ companyId: 'company-a', model: 'Employee', operation: 'findFirstOrThrow', args: {}, query });
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-a', deletedAt: null }) }));
    });

    it('findUnique — injects companyId and deletedAt:null', async () => {
      const query = vi.fn();
      await applyTenantScopeOperation({ companyId: 'company-a', model: 'Employee', operation: 'findUnique', args: { where: { id: 'x' } }, query });
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'x', companyId: 'company-a', deletedAt: null }) }));
    });

    it('count — injects companyId and deletedAt:null', async () => {
      const query = vi.fn();
      await applyTenantScopeOperation({ companyId: 'company-a', model: 'Employee', operation: 'count', args: {}, query });
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-a', deletedAt: null }) }));
    });

    it('aggregate — injects companyId and deletedAt:null', async () => {
      const query = vi.fn();
      await applyTenantScopeOperation({ companyId: 'company-a', model: 'Employee', operation: 'aggregate', args: {}, query });
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-a', deletedAt: null }) }));
    });

    it('groupBy — injects companyId and deletedAt:null', async () => {
      const query = vi.fn();
      await applyTenantScopeOperation({ companyId: 'company-a', model: 'Employee', operation: 'groupBy', args: { by: ['status'] }, query });
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-a', deletedAt: null }) }));
    });
  });

  describe('WRITE operations', () => {
    it('update — injects companyId into where (prevents cross-tenant update)', async () => {
      const query = vi.fn();
      await applyTenantScopeOperation({ companyId: 'company-a', model: 'Employee', operation: 'update', args: { where: { id: 'x' } }, query });
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'x', companyId: 'company-a' }) }));
    });

    it('updateMany — injects companyId into where', async () => {
      const query = vi.fn();
      await applyTenantScopeOperation({ companyId: 'company-a', model: 'Employee', operation: 'updateMany', args: {}, query });
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-a' }) }));
    });

    it('delete — injects companyId into where (soft-delete picks this up later)', async () => {
      const query = vi.fn();
      await applyTenantScopeOperation({ companyId: 'company-a', model: 'Employee', operation: 'delete', args: { where: { id: 'x' } }, query });
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'x', companyId: 'company-a' }) }));
    });

    it('deleteMany — injects companyId into where', async () => {
      const query = vi.fn();
      await applyTenantScopeOperation({ companyId: 'company-a', model: 'Employee', operation: 'deleteMany', args: {}, query });
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-a' }) }));
    });
  });

  describe('CREATE operations', () => {
    it('create — injects companyId into data', async () => {
      const query = vi.fn();
      await applyTenantScopeOperation({ companyId: 'company-a', model: 'Employee', operation: 'create', args: { data: { workEmail: 'a@x.com' } }, query });
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ companyId: 'company-a' }) }));
    });

    it('createMany (array) — injects companyId into every item in data array', async () => {
      const query = vi.fn();
      await applyTenantScopeOperation({ companyId: 'company-a', model: 'Employee', operation: 'createMany', args: { data: [{ workEmail: 'a@x.com' }, { workEmail: 'b@x.com' }] }, query });
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ data: [{ workEmail: 'a@x.com', companyId: 'company-a' }, { workEmail: 'b@x.com', companyId: 'company-a' }] }));
    });

    it('upsert — injects companyId into data', async () => {
      const query = vi.fn();
      await applyTenantScopeOperation({ companyId: 'company-a', model: 'Employee', operation: 'upsert', args: { where: { id: '1' }, create: {}, update: {}, data: { workEmail: 'a@x.com' } }, query });
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ companyId: 'company-a' }) }));
    });
  });

  describe('UNSCOPED models (User, UserSession, RefreshToken, Permission)', () => {
    it('findMany on User — does NOT inject companyId', async () => {
      const query = vi.fn();
      await applyTenantScopeOperation({ companyId: 'company-a', model: 'User', operation: 'findMany', args: {}, query });
      expect(query).toHaveBeenCalledWith(expect.not.objectContaining({ where: expect.objectContaining({ companyId: 'company-a' }) }));
    });

    it('findMany on User — DOES inject deletedAt:null (soft-delete applies)', async () => {
      const query = vi.fn();
      await applyTenantScopeOperation({ companyId: 'company-a', model: 'User', operation: 'findMany', args: {}, query });
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }));
    });

    it('findMany on Permission — passes args through completely unchanged', async () => {
      const query = vi.fn();
      const args = { where: { action: 'read' } };
      await applyTenantScopeOperation({ companyId: 'company-a', model: 'Permission', operation: 'findMany', args, query });
      expect(query).toHaveBeenCalledWith(args);
    });

    it('create on User — does NOT inject companyId into data', async () => {
      const query = vi.fn();
      await applyTenantScopeOperation({ companyId: 'company-a', model: 'User', operation: 'create', args: { data: { email: 'x@y.com' } }, query });
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ data: expect.not.objectContaining({ companyId: 'company-a' }) }));
    });

    it('update on RefreshToken — does NOT inject companyId into where', async () => {
      const query = vi.fn();
      await applyTenantScopeOperation({ companyId: 'company-a', model: 'RefreshToken', operation: 'update', args: { where: { id: '1' } }, query });
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: { id: '1' } }));
    });
  });

  describe('CROSS-TENANT safety', () => {
    it('Two separate scoped clients with different companyIds produce independent where clauses', async () => {
      const queryA = vi.fn();
      const queryB = vi.fn();
      await applyTenantScopeOperation({ companyId: 'company-a', model: 'Employee', operation: 'findMany', args: {}, query: queryA });
      await applyTenantScopeOperation({ companyId: 'company-b', model: 'Employee', operation: 'findMany', args: {}, query: queryB });

      expect(queryA).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-a', deletedAt: null }) }));
      expect(queryB).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-b', deletedAt: null }) }));
    });

    it('companyId from scope cannot be overridden by passing companyId in args.where', async () => {
      const query = vi.fn();
      await applyTenantScopeOperation({ companyId: 'company-a', model: 'Employee', operation: 'findMany', args: { where: { companyId: 'other-company' } }, query });
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-a', deletedAt: null }) }));
    });

    it("A query with where: { companyId: 'other-company' } is overwritten with scoped companyId", async () => {
      const query = vi.fn();
      await applyTenantScopeOperation({ companyId: 'company-a', model: 'Employee', operation: 'updateMany', args: { where: { companyId: 'other-company' } }, query });
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-a' }) }));
    });
  });
});
