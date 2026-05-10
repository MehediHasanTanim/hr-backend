export { PrismaClient } from '@prisma/client';
export { PrismaModule } from './prisma.module';
export { PrismaService } from './prisma.service';
export { withTenantScope } from './extensions/tenant-scope.extension';
export { softDeleteExtension } from './extensions/soft-delete.extension';
