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

export const softDeleteExtension = Prisma.defineExtension({
  name: 'soft-delete',
  query: {
    $allModels: {
      async delete({ model, args, query }) {
        if (!SOFT_DELETABLE.has(model as never)) return query(args);

        return (query as unknown as (nextArgs: object) => Promise<unknown>)({
          ...args,
          data: { deletedAt: new Date() },
        });
      },

      async deleteMany({ model, args, query }) {
        if (!SOFT_DELETABLE.has(model as never)) return query(args);

        return (query as unknown as (nextArgs: object) => Promise<unknown>)({
          ...args,
          data: { deletedAt: new Date() },
        });
      },
    },
  },
});
