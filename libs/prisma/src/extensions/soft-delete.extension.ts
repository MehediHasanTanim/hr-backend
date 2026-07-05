import { Prisma } from '@prisma/client';

const SOFT_DELETABLE = new Set([
  'Company',
  'Employee',
  'User',
  'Department',
  'Role',
  'EmployeeDocument',
  'Project',
  'IvrExtension',
  'Voicemail',
] as const);

type Args = { where?: Record<string, unknown>; data?: unknown } & Record<string, unknown>;
type QueryFn = (args: Args) => unknown;

/**
 * Prisma extension that converts hard deletes into soft deletes
 * (sets deletedAt instead of removing the row) and automatically
 * filters out soft-deleted records from read queries.
 */
export const softDeleteExtension = Prisma.defineExtension({
  name: 'soft-delete',
  query: {
    $allModels: {
      // ── Write operations: convert to soft delete ────────────────────

      async delete({ model, args, query }) {
        if (!SOFT_DELETABLE.has(model as never)) return query(args);

        return (query as unknown as QueryFn)({
          ...args,
          data: { deletedAt: new Date() },
        });
      },

      async deleteMany({ model, args, query }) {
        if (!SOFT_DELETABLE.has(model as never)) return query(args);

        return (query as unknown as QueryFn)({
          ...args,
          data: { deletedAt: new Date() },
        });
      },

      // ── Read operations: filter out soft-deleted records ────────────

      async findMany({ model, args, query }) {
        if (!SOFT_DELETABLE.has(model as never)) return query(args);

        return query({
          ...args,
          where: { ...(args.where as Record<string, unknown> ?? {}), deletedAt: null },
        });
      },

      async findUnique({ model, args, query }) {
        if (!SOFT_DELETABLE.has(model as never)) return query(args);

        return query({
          ...args,
          where: { ...(args.where as Record<string, unknown> ?? {}), deletedAt: null },
        });
      },

      async findFirst({ model, args, query }) {
        if (!SOFT_DELETABLE.has(model as never)) return query(args);

        return query({
          ...args,
          where: { ...(args.where as Record<string, unknown> ?? {}), deletedAt: null },
        });
      },

      async findUniqueOrThrow({ model, args, query }) {
        if (!SOFT_DELETABLE.has(model as never)) return query(args);

        return query({
          ...args,
          where: { ...(args.where as Record<string, unknown> ?? {}), deletedAt: null },
        });
      },

      async findFirstOrThrow({ model, args, query }) {
        if (!SOFT_DELETABLE.has(model as never)) return query(args);

        return query({
          ...args,
          where: { ...(args.where as Record<string, unknown> ?? {}), deletedAt: null },
        });
      },

      async count({ model, args, query }) {
        if (!SOFT_DELETABLE.has(model as never)) return query(args);

        return query({
          ...args,
          where: { ...(args.where as Record<string, unknown> ?? {}), deletedAt: null },
        });
      },
    },
  },
});
