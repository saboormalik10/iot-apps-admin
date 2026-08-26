import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { IngestService } from './ingest.service';
import { IngestBatchDto, IngestResponse } from './dto';
import { IngestCredentialGuard } from '../common/guards/service-credential.guard';
import { CurrentService } from '../common/decorators/service-credential.decorator';
import { AuthenticatedService } from '../common/guards/service-credential.guard';
import { ApiErrors } from '../common/decorators/api-errors.decorator';

const RESPONSE_EXAMPLE = {
  account: 'wxstation',
  organizationId: '6a437ef2ee000f4be3eb5b14',
  deviceId: '6a55e9c8e4b202e01a301a75',
  results: [
    { name: 'WindSonic_20260820_0409.csv', status: 'ingested', rows: 52, skipped: 0, dayKeys: ['2026-08-20'], truncated: false, warnings: 0, sensorsSeen: ['wind_speed', 'wind_dir'] },
    { name: 'WindSonic_20260820_0410.csv', status: 'duplicate', rows: 0 },
  ],
};

@ApiTags('Ingest')
@ApiBearerAuth()
@Controller('ingest')
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  @ApiOperation({
    summary: 'Ingest weather-station CSV files',
    description:
      'Accepts raw CSV files collected from an SFTP drop by the ingest agent. Authenticated with an ' +
      '`ingest` **service credential**, not a user token — the station has no user.\n\n' +
      'Always returns **200** with a per-file disposition, so one malformed file cannot block the rest ' +
      'of the batch. Idempotent on file content: re-sending the same bytes returns `duplicate`.',
  })
  @ApiBody({ type: IngestBatchDto })
  @ApiOkResponse({ schema: { example: { data: RESPONSE_EXAMPLE } } })
  @ApiErrors('badRequest', 'unauthorized')
  @Post('met/files')
  @HttpCode(200)
  // ThrottlerGuard is NOT registered globally in this app (see public.controller.ts),
  // so it is opted into explicitly. Generous by design: one agent posts for many
  // stations, and a catch-up after an outage is a legitimate burst. This exists to
  // contain a runaway agent, not to rate-limit normal traffic.
  @UseGuards(IngestCredentialGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  async ingestMet(
    @Body() body: IngestBatchDto,
    @CurrentService() service: AuthenticatedService,
  ): Promise<{ data: IngestResponse }> {
    const data = await this.ingestService.ingestFiles(
      service.organizationId,
      body.account,
      body.files ?? [],
      body.agentVersion,
      body.folder,
    );
    return { data };
  }
}
