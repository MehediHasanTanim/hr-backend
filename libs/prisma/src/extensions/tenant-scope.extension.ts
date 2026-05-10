import { Prisma } from '@prisma/client';

const UNSCOPED_MODELS = new Set([
  'User',
  'UserSession',
  'RefreshToken',
  'Permission',
] as const);

const SOFT_DELETE_ONLY_MODELS = new Set(['User'] as const);

type Args = { where?: Record<string, unknown>; data?: unknown } & Record<string, unknown>;
type QueryFn = (args: Args) => unknown;

interface ScopeOperationInput {
  companyId: string;
  model: string;
  operation: string;
  args: Args;
  query: QueryFn;
}

export function applyTenantScopeOperation(input: ScopeOperationInput): unknown {
  const { companyId, model, operation, args, query } = input;
  const isUnscoped = UNSCOPED_MODELS.has(model as never);
  const isSoftDeleteOnly = SOFT_DELETE_ONLY_MODELS.has(model as never);
  const nextArgs: Args = { ...args };

  const readOps = [
    'findMany',
    'findFirst',
    'findFirstOrThrow',
    'findUnique',
    'findUniqueOrThrow',
    'count',
    'aggregate',
    'groupBy',
  ];

  if (readOps.includes(operation)) {
    if (!isUnscoped) {
      nextArgs.where = {
        ...(nextArgs.where ?? {}),
        companyId,
        deletedAt: null,
      };
    } else if (isSoftDeleteOnly) {
      nextArgs.where = {
        ...(nextArgs.where ?? {}),
        deletedAt: null,
      };
    }

    return query(nextArgs);
  }

  const writeOps = ['update', 'updateMany', 'delete', 'deleteMany'];
  if (writeOps.includes(operation)) {
    if (!isUnscoped) {
      nextArgs.where = {
        ...(nextArgs.where ?? {}),
        companyId,
      };
    }

    return query(nextArgs);
  }

  const createOps = ['create', 'createMany', 'upsert'];
  if (createOps.includes(operation) && !isUnscoped) {
    if (operation === 'create' || operation === 'upsert') {
      nextArgs.data = { ...(nextArgs.data as Record<string, unknown>), companyId };
    }

    if (operation === 'createMany') {
      const data = nextArgs.data;
      if (Array.isArray(data)) {
        nextArgs.data = data.map((item) => ({ ...(item as Record<string, unknown>), companyId }));
      } else {
        nextArgs.data = {
          ...(data as Record<string, unknown>),
          data: Array.isArray((data as { data?: unknown[] }).data)
            ? ((data as { data: Record<string, unknown>[] }).data).map((item) => ({ ...item, companyId }))
            : (data as { data?: unknown[] }).data,
        };
      }
    }

    return query(nextArgs);
  }

  return query(args);
}

export function withTenantScope(companyId: string): ReturnType<typeof Prisma.defineExtension> {
  return Prisma.defineExtension({
    name: 'tenant-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return applyTenantScopeOperation({
            companyId,
            model,
            operation,
            args: args as Args,
            query: query as QueryFn,
          });
        },
      },
    },
  });
}
