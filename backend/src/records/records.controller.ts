import {
  Controller,
  Get,
  Post,
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
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiProduces,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtOrApiKeyGuard } from '../common/guards/jwt-or-apikey.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Consumers } from '../common/decorators/consumers.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { JWTPayload } from '../utils/jwt';
import { RecordsService, CreateRecordInput, MeasureInput } from './records.service';
import { CreateRecordDto, UpdateRecordDto, BulkMeasuresDto } from './dto';

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
  @UseGuards(JwtAuthGuard)
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

  @ApiOperation({
    summary: 'Upload a MET-LINK logging record from the mobile app',
    description: 'Used by the MET-LINK app. `localRecordId` (SQLite id_record) is the idempotency key. Save the returned `_id` for the measures upload.',
  })
  @Consumers('met-link')
  @ApiBody({
    type: CreateRecordDto,
    examples: {
      metLink: {
        summary: '📱 MET-LINK record',
        value: {
          deviceId: '664a1f2e3c4d5e6f7a8b9c0f',
          deviceName: 'Weather Station Roof',
          dateStart: '2026-05-01 14:32:00',
          dateEnd: '2026-05-01 15:32:00',
          comment: 'Rooftop station — manual inspection',
          urlMaps: null,
          localRecordId: 42,
          isDemoMode: false,
        },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Created record', schema: { example: { data: RECORD_EXAMPLE } } })
  @ApiErrors('badRequest', 'unauthorized', 'notFound')
  @Post()
  @HttpCode(201)
  @UseGuards(JwtOrApiKeyGuard)
  async createRecord(@Body() body: CreateRecordInput, @CurrentUser() user?: JWTPayload) {
    const record = await this.recordsService.createRecord(
      user!.organizationId,
      body,
      { userId: user!.userId, email: user!.email ?? '' },
    );
    return { data: record };
  }

  @ApiOperation({ summary: 'Get record detail (admin dashboard)' })
  @ApiOkResponse({ description: 'Record detail', schema: { example: { data: RECORD_EXAMPLE } } })
  @ApiErrors('unauthorized', 'notFound')
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getRecord(@Param('id') id: string, @CurrentUser() user?: JWTPayload) {
    const record = await this.recordsService.getRecord(user!.organizationId, id);
    return { data: record };
  }

  @ApiOperation({ summary: 'Update record comment (admin dashboard)' })
  @ApiBody({ type: UpdateRecordDto })
  @ApiOkResponse({ description: 'Updated record', schema: { example: { data: RECORD_EXAMPLE } } })
  @ApiErrors('badRequest', 'unauthorized', 'notFound')
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async updateRecord(
    @Param('id') id: string,
    @Body() body: { comment?: string },
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
  @UseGuards(JwtAuthGuard)
  async deleteRecord(@Param('id') id: string, @CurrentUser() user?: JWTPayload): Promise<void> {
    await this.recordsService.deleteRecord(
      user!.organizationId,
      id,
      { userId: user!.userId, email: user!.email ?? '' },
    );
  }

  @ApiOperation({
    summary: 'Bulk upload measures for a record',
    description: 'Used by the MET-LINK app immediately after the record upload. `:id` is the record `_id`. First row must be the header row. Max 10 000 rows per call.',
  })
  @Consumers('met-link')
  @ApiBody({
    type: BulkMeasuresDto,
    examples: {
      metLink: {
        summary: '📱 MET-LINK measures (header row first)',
        value: {
          measures: [
            { dataSentence: 'Wind speed,Unit,Description,Temperature,Unit,Description,Humidity,Unit,Description,Pressure,Unit,Description', timeStamp: '2026-05-01 14:32:00' },
            { dataSentence: '12.5,m/s,relative,23.4,°C,TEMP,63.5,%,RH,1.025,B,PRESS', timeStamp: '2026-05-01 14:32:01' },
          ],
        },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Measures inserted', schema: { example: { data: { inserted: 2, dataRows: 1, headerRows: 1 } } } })
  @ApiErrors('badRequest', 'unauthorized', 'notFound')
  @Post(':id/measures')
  @HttpCode(201)
  @UseGuards(JwtOrApiKeyGuard)
  async bulkInsertMeasures(
    @Param('id') id: string,
    @Body() body: { measures: MeasureInput[] },
    @CurrentUser() user?: JWTPayload,
  ) {
    const result = await this.recordsService.bulkInsertMeasures(
      user!.organizationId,
      id,
      body.measures,
    );
    return { data: result };
  }

  @ApiOperation({ summary: 'Get paginated measures for a record (admin dashboard)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (default 1000, max 5000)' })
  @ApiOkResponse({ description: 'Paginated measures' })
  @ApiErrors('unauthorized', 'notFound')
  @Get(':id/measures')
  @UseGuards(JwtAuthGuard)
  async getMeasures(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: JWTPayload,
  ) {
    return this.recordsService.getMeasures({
      organizationId: user!.organizationId,
      recordId: id,
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 5000) : 1000,
    });
  }

  @ApiOperation({ summary: 'Export record as CSV (admin dashboard)' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV file download', content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } } })
  @ApiErrors('unauthorized', 'notFound')
  @Get(':id/export.csv')
  @UseGuards(JwtAuthGuard)
  async exportCsv(
    @Param('id') id: string,
    @Res() res: Response,
    @CurrentUser() user?: JWTPayload,
  ): Promise<void> {
    const csv = await this.recordsService.exportRecordCsv(user!.organizationId, id);
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="MET-Link-${dateStr}.csv"`);
    res.send(csv);
  }
}
