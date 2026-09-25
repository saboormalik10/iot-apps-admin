import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  UseGuards,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
  ApiOkResponse,
  ApiNoContentResponse,
  ApiProduces,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../common/guards/permissions.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { JWTPayload } from '../utils/jwt';
import { brandedFilename, csvProvenance, exportLabel } from '../utils/export-branding.util';
import { RecordsService } from './records.service';
import { UpdateRecordDto } from './dto';

const RECORD_EXAMPLE = {
  _id: '664a1f2e3c4d5e6f7a8b9c20',
  deviceId: '664a1f2e3c4d5e6f7a8b9c0f',
  deviceName: 'MET-LINK-001',
  dateStart: '2026-05-01 14:32:00',
  dateEnd: '2026-05-01 15:32:00',
  localRecordId: 42,
  measureCount: 0,
  syncedAt: '2026-06-23T10:00:00.000Z',
};

@ApiTags('MET Records')
@ApiBearerAuth()
@Controller('records')
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  @ApiOperation({ summary: 'List all MET-LINK records in the organisation (admin dashboard)' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Filter by device ObjectId' })
  @ApiQuery({ name: 'from', required: false, description: 'Unix ms — start of range' })
  @ApiQuery({ name: 'to', required: false, description: 'Unix ms — end of range' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (default 20, max 100)' })
  @ApiOkResponse({ description: 'Paginated records', schema: { example: { data: [RECORD_EXAMPLE], meta: { page: 1, limit: 20, total: 1, pages: 1 } } } })
  @ApiErrors('unauthorized')
  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('data:read')
  async listRecords(
    @Query('deviceId') deviceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: JWTPayload,
  ) {
    return this.recordsService.listRecords({
      organizationId: user!.organizationId,
      deviceId,
      from: from ? Number(from) : undefined,
      to: to ? Number(to) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 100) : 20,
    });
  }

  @ApiOperation({ summary: 'Get record detail (admin dashboard)' })
  @ApiOkResponse({ description: 'Record detail', schema: { example: { data: RECORD_EXAMPLE } } })
  @ApiErrors('unauthorized', 'notFound')
  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('data:read')
  async getRecord(@Param('id') id: string, @CurrentUser() user?: JWTPayload) {
    const record = await this.recordsService.getRecord(user!.organizationId, id);
    return { data: record };
  }

  @ApiOperation({ summary: 'Update record comment (admin dashboard)' })
  @ApiBody({ type: UpdateRecordDto })
  @ApiOkResponse({ description: 'Updated record', schema: { example: { data: RECORD_EXAMPLE } } })
  @ApiErrors('badRequest', 'unauthorized', 'notFound')
  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('content:write')
  async updateRecord(
    @Param('id') id: string,
    @Body() body: UpdateRecordDto,
    @CurrentUser() user?: JWTPayload,
  ) {
    const record = await this.recordsService.updateRecord(user!.organizationId, id, body);
    return { data: record };
  }

  @ApiOperation({ summary: 'Delete record and cascade-delete all measures (admin dashboard)' })
  @ApiNoContentResponse({ description: 'Record deleted' })
  @ApiErrors('unauthorized', 'notFound')
  @Delete(':id')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('content:write')
  async deleteRecord(@Param('id') id: string, @CurrentUser() user?: JWTPayload, @ClientIp() ipAddress?: string | null): Promise<void> {
    await this.recordsService.deleteRecord(
      user!.organizationId,
      id,
      { userId: user!.userId, email: user!.email ?? '', ipAddress },
    );
  }

  @ApiOperation({ summary: 'Get paginated measures for a record (admin dashboard)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (default 1000, max 5000)' })
  @ApiOkResponse({ description: 'Paginated measures' })
  @ApiErrors('unauthorized', 'notFound')
  @ApiOperation({
    summary: 'Bucketed series for the record chart',
    description:
      'Equal-width buckets across the window, one averaged point each. Reading raw rows instead would return the ' +
      'first N measures of the record — at 1 Hz that is the first half hour, so a channel sampled once a minute ' +
      'contributes a handful of points and its chart reads as empty.',
  })
  @Get(':id/series')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('data:read')
  async getSeries(
    @Param('id') id: string,
    @Query('fields') fields?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('points') points?: string,
    @CurrentUser() user?: JWTPayload,
  ) {
    const ms = (v?: string) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);
    const data = await this.recordsService.getSeries({
      organizationId: user!.organizationId,
      recordId: id,
      fields: (fields ?? '').split(',').map((f) => f.trim()).filter(Boolean),
      from: ms(from),
      to: ms(to),
      points: ms(points),
    });
    return { data };
  }

  @Get(':id/measures')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('data:read')
  async getMeasures(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @CurrentUser() user?: JWTPayload,
  ) {
    // A finite number or nothing — `Number('')` is 0, which would silently become
    // a lower bound of 1970 and read as "the whole day" by accident.
    const ms = (v?: string) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);
    return this.recordsService.getMeasures({
      organizationId: user!.organizationId,
      recordId: id,
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 5000) : 1000,
      from: ms(from),
      to: ms(to),
    });
  }

  @ApiOperation({ summary: 'Export record as CSV (admin dashboard)' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV file download', content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } } })
  @ApiErrors('unauthorized', 'notFound')
  @Get(':id/export.csv')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('data:read', 'data:export')
  async exportCsv(
    @Param('id') id: string,
    @Res() res: Response,
    @CurrentUser() user?: JWTPayload,
  ): Promise<void> {
    const [csv, label] = await Promise.all([
      this.recordsService.exportRecordCsv(user!.organizationId, id),
      exportLabel(user!.organizationId),
    ]);
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${brandedFilename(label, `MET-Link-${dateStr}`, 'csv')}"`,
    );
    // Provenance line first: the file outlives the session it came from.
    res.send(label ? `${csvProvenance(label)}\n${csv}` : csv);
  }
}
