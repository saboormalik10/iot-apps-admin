import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

// NOTE: these two endpoints bypass the global `v1` prefix (see main.ts), so they
// are served at the domain ROOT (`/health`, `/version`) — NOT under `/v1`. The
// Swagger server is `/v1`, so use the absolute root URL in "Try it out".
@ApiTags('System')
@Controller()
export class SystemController {
  // Inject the Nest-managed Mongoose connection (the top-level `mongoose.connection`
  // default connection is not the one @nestjs/mongoose actually connects).
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @ApiOperation({ summary: 'Health check', description: 'Returns server and database status. **Served at the root path `/health`** (not under `/v1`).' })
  @ApiOkResponse({ description: 'Server is healthy', schema: { example: { status: 'ok', db: 'connected', uptime: 3600, timestamp: '2026-06-23T10:00:00.000Z' } } })
  @Get('health')
  health(): Record<string, unknown> {
    return {
      status: 'ok',
      db: this.connection.readyState === 1 ? 'connected' : 'disconnected',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @ApiOperation({ summary: 'API version info', description: '**Served at the root path `/version`** (not under `/v1`).' })
  @ApiOkResponse({ description: 'Version info', schema: { example: { version: '1.0.0', env: 'production' } } })
  @Get('version')
  version(): Record<string, unknown> {
    return { version: '1.0.0', env: process.env.NODE_ENV ?? 'development' };
  }
}
