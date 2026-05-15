import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import * as mongoose from 'mongoose';

@ApiTags('System')
@Controller()
export class SystemController {
  @ApiOperation({ summary: 'Health check', description: 'Returns server and database status.' })
  @Get('health')
  health(): Record<string, unknown> {
    return {
      status: 'ok',
      db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @ApiOperation({ summary: 'API version info' })
  @Get('version')
  version(): Record<string, unknown> {
    return { version: '1.0.0', env: process.env.NODE_ENV ?? 'development' };
  }
}
