import { Module } from '@nestjs/common';
import { RbacCacheService } from './rbac-cache.service';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  controllers: [RolesController],
  providers: [RbacCacheService, RolesService],
  exports: [RbacCacheService, RolesService],
})
export class RolesModule {}
