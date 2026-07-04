import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiProduces,
  ApiOkResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { JWTPayload } from '../utils/jwt';
import { ExportService } from './export.service';

@ApiTags('Export')
@ApiBearerAuth()
@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @ApiOperation({
    summary: 'Export all NEP sessions for a device as a ZIP',
    description: 'ZIP contains one CSV per session (`sessions/<id>.csv`) plus a `manifest.json` listing each session and its photo URLs.',
  })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId' })
  @ApiQuery({ name: 'from', required: false, description: 'Unix ms (startTimestamp lower bound)' })
  @ApiQuery({ name: 'to', required: false, description: 'Unix ms (startTimestamp upper bound)' })
  @ApiProduces('application/zip')
  @ApiOkResponse({ description: 'ZIP archive (application/zip)' })
  @ApiErrors('badRequest', 'unauthorized', 'notFound')
  @Get('sessions.zip')
  @UseGuards(JwtAuthGuard)
  async exportSessions(
    @Query('deviceId') deviceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: JWTPayload,
    @Res() res: Response,
  ): Promise<void> {
    await this.exportService.streamSessionsZip(user.organizationId, deviceId, from, to, res, {
      userId: user.userId,
      email: user.email ?? '',
    });
  }
}
