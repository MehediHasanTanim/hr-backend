import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';

/**
 * Cleanup helper: delete test data in reverse FK order.
 * Each integration test describe block should maintain its own cleanupIds array.
 */
export async function cleanupTestData(
  app: INestApplication,
  cleanupIds: { table: string; id: string }[],
): Promise<void> {
  const prisma = app.get(PrismaService);

  for (const { table, id } of cleanupIds.reverse()) {
    try {
      await prisma.unscopedClient.$executeRawUnsafe(
        `DELETE FROM "${table}" WHERE id = $1`,
        id,
      );
    } catch {
      // Row may have been cascade-deleted; ignore
    }
  }
}

/**
 * Helper to generate unique test emails to prevent cross-test contamination.
 */
export function uniqueEmail(prefix = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@hr-test.internal`;
}
