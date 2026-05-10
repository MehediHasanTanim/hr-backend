import { Controller, Get } from '@nestjs/common';
import type { ApiResponse } from '@hr/shared';

interface HealthPayload {
  status: 'ok';
  timestamp: string;
}

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): ApiResponse<HealthPayload> {
    return {
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
