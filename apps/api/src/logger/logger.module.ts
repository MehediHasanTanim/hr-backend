import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { AppConfigService } from '../config/config.service';
import { buildPinoOptions } from './pino.options';

@Global()
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => buildPinoOptions(
        new AppConfigService(configService),
      ),
    }),
  ],
})
export class LoggerModule {}
