import { Module } from '@nestjs/common';
import { MssController } from './mss.controller';
import { MssService } from './mss.service';

@Module({
  controllers: [MssController],
  providers: [MssService],
  exports: [MssService],
})
export class MssModule {}
