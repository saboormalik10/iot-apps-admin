import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { StationsService } from './stations.service';
import { ProvisionService } from './provision.service';
import { ProvisionStationDto } from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';
import { PermissionsGuard, RequirePermissions } from '../common/guards/permissions.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { JWTPayload } from '../utils/jwt';

/**
 * Station provisioning for platform administrators.
 *
 * Behind `SuperAdminGuard`, the same guard as the cross-customer views: creating
 * an OS-level login on the ingest box is platform work, and an organisation
 * admin must not be able to do it for themselves. `role:delete` and
 * `station:provision` are the two permissions the guard layer re-reads from the
 * database for exactly this reason.
 */
@ApiTags('Stations (platform)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminGuard, PermissionsGuard, ThrottlerGuard)
@RequirePermissions('station:provision')
@Controller('platform/stations')
export class StationsController {
  constructor(
    private readonly stations: StationsService,
    private readonly provision: ProvisionService,
  ) {}

  @ApiOperation({
    summary: 'Provision a station for a customer',
    description:
      'Creates the device and the folder mapping INACTIVE, then queues the work for the agent on the SFTP box. ' +
      'The mapping activates only when the agent confirms the Unix account exists, so a half-finished provisioning ' +
      'is inert rather than dangerous — ingest rejects an inactive mapping. The account name is derived from the ' +
      'customer when omitted.',
  })
  @ApiBody({ type: ProvisionStationDto })
  @ApiCreatedResponse({
    description: 'The pending station',
    schema: {
      example: {
        data: {
          stationAccountId: '664a…',
          deviceId: '664b…',
          account: 'wx-acme-marine',
          folderPath: 'Acme Marine/Demo Tower',
          status: 'pending',
          jobId: '664c…',
        },
      },
    },
  })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden', 'notFound')
  @Post()
  @HttpCode(201)
  async provisionStation(@Body() body: ProvisionStationDto, @CurrentUser() user: JWTPayload) {
    return {
      data: await this.stations.provisionStation(body, { userId: user.userId, email: user.email ?? '' }),
    };
  }

  @ApiOperation({
    summary: "A customer's stations and their provisioning state",
    description: '`isActive` is the truth; the job status explains why a station is not active yet.',
  })
  @ApiOkResponse({ description: 'Stations for the customer' })
  @ApiErrors('unauthorized', 'forbidden')
  @Get(':organizationId')
  async list(@Param('organizationId') organizationId: string) {
    return { data: await this.stations.list(organizationId) };
  }

  @ApiOperation({ summary: 'Recent provisioning jobs for a customer' })
  @ApiOkResponse({ description: 'Jobs, newest first' })
  @ApiErrors('unauthorized', 'forbidden')
  @Get(':organizationId/jobs')
  async jobs(@Param('organizationId') organizationId: string) {
    return { data: await this.provision.list(organizationId) };
  }

  @ApiOperation({
    summary: "Rotate a station's SFTP password",
    description:
      'Queues the work for the agent. The new password is NOT stored in the job result — it is held as a one-read ' +
      'secret, collected once through `/secret/:jobId`, and expires in 15 minutes whether it is read or not.',
  })
  @ApiOkResponse({ schema: { example: { data: { jobId: '664a…', account: 'wx-acme-01', status: 'pending' } } } })
  @ApiErrors('unauthorized', 'forbidden', 'notFound')
  @Post(':stationAccountId/rotate')
  @HttpCode(200)
  async rotate(@Param('stationAccountId') id: string, @CurrentUser() user: JWTPayload) {
    return { data: await this.stations.rotatePassword(id, { userId: user.userId, email: user.email ?? '' }) };
  }

  @ApiOperation({
    summary: 'Revoke a station',
    description:
      'Stops routing IMMEDIATELY — before the agent runs — because revocation is what happens when a station is ' +
      'compromised, and waiting for a queue poll to stop accepting its data would be the wrong way round. The agent ' +
      'then LOCKS the Unix account. The account is never deleted and its uploaded files are retained.',
  })
  @ApiOkResponse({ schema: { example: { data: { jobId: '664a…', account: 'wx-acme-01', isActive: false } } } })
  @ApiErrors('unauthorized', 'forbidden', 'notFound')
  @Post(':stationAccountId/revoke')
  @HttpCode(200)
  async revoke(@Param('stationAccountId') id: string, @CurrentUser() user: JWTPayload) {
    return { data: await this.stations.revokeStation(id, { userId: user.userId, email: user.email ?? '' }) };
  }

  @ApiOperation({
    summary: 'Restore a revoked station',
    description:
      'Rotates the password as part of restoring — re-enabling without a fresh one would hand access back to ' +
      'whoever prompted the revocation. Routing resumes when the agent confirms.',
  })
  @ApiOkResponse({ schema: { example: { data: { jobId: '664a…', account: 'wx-acme-01', status: 'pending' } } } })
  @ApiErrors('unauthorized', 'forbidden', 'notFound')
  @Post(':stationAccountId/restore')
  @HttpCode(200)
  async restore(@Param('stationAccountId') id: string, @CurrentUser() user: JWTPayload) {
    return { data: await this.stations.restoreStation(id, { userId: user.userId, email: user.email ?? '' }) };
  }

  @ApiOperation({
    summary: 'Collect a generated password — ONCE',
    description:
      'Returns the password and immediately discards it. A second call returns null, as does a call after 15 ' +
      'minutes. It is never written to the job result, which is readable for 90 days and lands in backups. ' +
      'POST, not GET, because collecting CONSUMES the secret — a GET is meant to be safe to repeat, and a proxy ' +
      'prefetch or browser preload would silently burn it.',
  })
  @ApiOkResponse({ schema: { example: { data: { password: 'k3Jf…', collected: true } } } })
  @ApiErrors('unauthorized', 'forbidden')
  // Tighter than the other routes: this one returns a password.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('secret/:jobId')
  @HttpCode(200)
  async secret(@Param('jobId') jobId: string) {
    const password = await this.provision.collectSecret(jobId, { by: 'operator' });
    return { data: { password, collected: password !== null } };
  }
}
