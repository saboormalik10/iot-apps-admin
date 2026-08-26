import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { ProvisionService } from './provision.service';
import { ClaimJobDto, JobResultDto } from './dto';
import { ProvisionCredentialGuard, AuthenticatedService } from '../common/guards/service-credential.guard';
import { CurrentService } from '../common/decorators/service-credential.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';

/**
 * The agent's half of provisioning. MACHINE ONLY — no user JWT reaches here.
 *
 * The agent POLLS: it opens an outbound connection, takes at most one job, does
 * it, reports back. Nothing listens on the SFTP box, so there is no inbound
 * port, no TLS certificate to manage and no service to attack. The credential is
 * `kind: 'provision'`, separate from the ingest one that lives on the same box —
 * a leaked ingest token (used every minute, far more exposed) must not be able
 * to create Unix accounts.
 */
@ApiTags('Provisioning (agent)')
@ApiBearerAuth()
@UseGuards(ProvisionCredentialGuard, ThrottlerGuard)
@Controller('provision')
export class ProvisionController {
  constructor(private readonly provisionService: ProvisionService) {}

  @ApiOperation({
    summary: 'Claim the next provisioning job',
    description:
      'Returns at most ONE job, claimed atomically so two agents cannot run the same one. Returns `null` when the ' +
      'queue is empty — the normal case, since the agent polls continuously. A claim whose lease has expired is ' +
      'reclaimable, so an agent killed mid-job does not strand it.',
  })
  @ApiBody({ type: ClaimJobDto })
  @ApiOkResponse({
    description: 'A job, or null',
    schema: { example: { data: { id: '664a…', type: 'createStationAccount', args: { account: 'wx-acme-01', folder: 'Tower A' } } } },
  })
  @ApiErrors('unauthorized', 'forbidden')
  // Generous: a 10-second poll is 6/min, so this only contains a runaway agent.
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('jobs/claim')
  @HttpCode(200)
  async claim(@Body() body: ClaimJobDto, @CurrentService() service: AuthenticatedService) {
    void service;
    return { data: await this.provisionService.claimNext(body.agentId) };
  }

  @ApiOperation({
    summary: 'Report the outcome of a job',
    description:
      'A failure below the attempt ceiling returns the job to the queue so a transient problem retries; at the ' +
      'ceiling it stays failed and becomes visible. Any secret-shaped field in `result` is stripped before storage.',
  })
  @ApiBody({ type: JobResultDto })
  @ApiOkResponse({ description: 'The updated job' })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden', 'notFound')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('jobs/:id/result')
  @HttpCode(200)
  async report(@Param('id') id: string, @Body() body: JobResultDto, @CurrentService() service: AuthenticatedService) {
    void service;
    return { data: await this.provisionService.report(id, body) };
  }

  @ApiOperation({ summary: 'Agent health probe', description: 'Confirms the credential works before the first poll.' })
  @ApiOkResponse({ schema: { example: { data: { ok: true, kind: 'provision' } } } })
  @ApiErrors('unauthorized', 'forbidden')
  @Get('ping')
  async ping(@CurrentService() service: AuthenticatedService) {
    return { data: { ok: true, kind: service.kind } };
  }
}
