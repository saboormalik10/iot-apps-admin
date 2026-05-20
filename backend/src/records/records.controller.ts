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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtOrApiKeyGuard } from '../common/guards/jwt-or-apikey.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JWTPayload } from '../utils/jwt';
import { RecordsService, CreateRecordInput, MeasureInput } from './records.service';

@ApiTags('MET Records')
@ApiBearerAuth()
@Controller('records')
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  @ApiOperation({ summary: 'List all MET-LINK records in the organisation' })
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

  @ApiOperation({ summary: 'Upload a MET-LINK logging record from the mobile app' })
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

  @ApiOperation({ summary: 'Get record detail' })
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getRecord(@Param('id') id: string, @CurrentUser() user?: JWTPayload) {
    const record = await this.recordsService.getRecord(user!.organizationId, id);
    return { data: record };
  }

  @ApiOperation({ summary: 'Update record comment' })
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

  @ApiOperation({ summary: 'Delete record and cascade-delete all measures' })
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

  @ApiOperation({ summary: 'Bulk upload measures for a record' })
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

  @ApiOperation({ summary: 'Get paginated measures for a record' })
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

  @ApiOperation({ summary: 'Export record as CSV' })
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
