import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { StreamTypesService } from './stream-types.service';
import { PreviewStreamDto, SetStationStreamDto } from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';
import { ApiErrors } from '../common/decorators/api-errors.decorator';

/**
 * Stream types — what formats the platform can read.
 *
 * Platform administrators only: a stream type decides how a customer's files are
 * interpreted, and getting it wrong turns their readings into nonsense that
 * still looks like data.
 */
@ApiTags('Stream types (platform)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('platform/stream-types')
export class StreamTypesController {
  constructor(private readonly streamTypes: StreamTypesService) {}

  @ApiOperation({
    summary: 'List stream types with their column specs',
    description:
      'Joins the configured types with the parsers installed in code. `parserAvailable: false` marks a type whose ' +
      'parser is missing — it would accept stations and then reject every file they send, so it is surfaced here ' +
      'rather than discovered from a quarantine folder.',
  })
  @ApiOkResponse({
    description: 'Stream types',
    schema: {
      example: {
        data: [
          {
            key: 'met-csv',
            name: 'Wind / MET CSV',
            isEnabled: true,
            isBuiltIn: true,
            parserAvailable: true,
            stationCount: 2,
            columns: [{ field: 'windDirRelDeg', aliases: ['direction', 'direction_deg'], numeric: true, fixedUnit: null }],
          },
        ],
      },
    },
  })
  @ApiErrors('unauthorized', 'forbidden')
  @Get()
  async list() {
    return { data: await this.streamTypes.list() };
  }

  @ApiOperation({
    summary: 'Preview a sample file — WRITES NOTHING',
    description:
      'Parses a sample and reports what would be stored: which header cells were recognised, which were IGNORED, ' +
      'the sensors detected, and the first rows exactly as they would be saved. The alternative way to answer ' +
      '"will this file work?" is to point a station at it and read the quarantine folder.',
  })
  @ApiBody({ type: PreviewStreamDto })
  @ApiOkResponse({ description: 'What would be stored. `persisted` is always false.' })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden')
  @Post('preview')
  @HttpCode(200)
  async preview(@Body() body: PreviewStreamDto) {
    return { data: await this.streamTypes.preview(body.streamKey, body.content, body.filename) };
  }

  @ApiOperation({
    summary: 'Allow or stop ONE station ingesting ONE stream type',
    description:
      'Per station, not per format: one customer pausing a feed must not stop everyone else. Checked on the ' +
      'ingest path — a file for a disabled type is REJECTED and quarantined, never silently dropped, so it can ' +
      'be replayed once the type is switched back on.\n\nReplaces the old type-level toggle, which was never ' +
      'enforced anywhere: ingest resolves its parser from the code registry and never read it, so the switch ' +
      'looked like a kill switch and stopped nothing.',
  })
  @ApiBody({ type: SetStationStreamDto })
  @ApiOkResponse({ description: 'The updated station' })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden', 'notFound')
  @Patch(':key/stations/:stationAccountId')
  async setStationEnabled(
    @Param('key') key: string,
    @Param('stationAccountId') stationAccountId: string,
    @Body() body: SetStationStreamDto,
  ) {
    return { data: await this.streamTypes.setStationEnabled(stationAccountId, key, body.enabled) };
  }
}
