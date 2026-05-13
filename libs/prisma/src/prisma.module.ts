import { Global, Module } from '@nestjs/common';
import { AppConfigService } from '@hr/api/config';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => new PrismaService(config),
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
