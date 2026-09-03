import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { PlatformService } from './platform.service';
import { OpsHealthService } from './ops-health.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JWTPayload } from '../utils/jwt';
import { CreateCustomerDto } from './dto';

const OVERVIEW_EXAMPLE = {
  data: {
    customers: 2,
    stations: 4,
    online: 3,
    users: 7,
    readings24h: 172_800,
    silent: 1,
    rows: [
      {
        organizationId: '664a1f2e3c4d5e6f7a8b9c0e',
        name: 'Observator Instruments AU',
        timezone: 'Australia/Sydney',
        stations: 3,
        online: 3,
        users: 4,
        alertRules: 2,
        readings24h: 172_800,
        lastDataAt: '2026-08-25T11:19:30.000Z',
        uploadFolders: ['Observator/Demo Tower'],
      },
    ],
    generatedAt: '2026-08-25T11:20:00.000Z',
  },
};

/**
 * Cross-customer reporting. PLATFORM ADMINISTRATORS ONLY.
 *
 * Every route here reads across tenant boundaries, which nothing else in the API
 * does. `SuperAdminGuard` is applied at the CONTROLLER level so a future route
 * added to this file cannot accidentally ship without it.
 */
@ApiTags('Platform')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly platformService: PlatformService,
    private readonly opsHealth: OpsHealthService,
  ) {}

  @ApiOperation({
    summary: 'Every station across every customer (platform administrator only)',
    description:
      'The stations list widened across tenants, each row carrying the customer that owns it. ' +
      '`GET /devices` stays scoped to one organisation deliberately — cross-customer reads live here, ' +
      'behind SuperAdminGuard, so the tenancy boundary is greppable rather than conditional.',
  })
  @ApiQuery({ name: 'organizationId', required: false, description: 'Filter to one customer' })
  @ApiQuery({ name: 'type', required: false, description: 'MET-LINK | NEP-LINK' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false, description: 'Max 100' })
  @ApiOkResponse({ description: 'Stations with their owning customer' })
  @ApiErrors('unauthorized', 'forbidden')
  @Get('devices')
  async devices(
    @Query('organizationId') organizationId?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.platformService.devices({
      organizationId,
      type,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @ApiOperation({
    summary: 'Customers that own at least one station — the filter options',
    description:
      'Only customers with stations. A filter listing customers with nothing behind them is a list of dead ends.',
  })
  @ApiOkResponse({ description: 'Customers, alphabetical' })
  @ApiErrors('unauthorized', 'forbidden')
  @Get('device-customers')
  async deviceCustomers() {
    return { data: await this.platformService.deviceCustomers() };
  }

  @ApiOperation({
    summary: 'Cross-customer overview (platform administrator only)',
    description:
      'Totals across every customer plus a per-customer breakdown: stations, how many are online, users, active ' +
      'alert rules, readings in the last 24 hours, and the upload folders each customer owns. `silent` counts ' +
      'customers that have stations but sent nothing in 24 hours — the ones worth chasing.',
  })
  @ApiOkResponse({ description: 'Platform overview', schema: { example: OVERVIEW_EXAMPLE } })
  @ApiErrors('unauthorized', 'forbidden')
  @Get('overview')
  async overview() {
    return { data: await this.platformService.overview() };
  }

  @ApiOperation({
    summary: 'Create a customer and its first administrator (platform administrator only)',
    description:
      'Creates the organisation, its upload folder and an ACTIVE admin account in one step. No email invitation — ' +
      'the password is set directly and handed over. The organisation is rolled back if the administrator cannot ' +
      'be created, so there is never a customer nobody can sign in to. The upload folder must be unique: two ' +
      'customers sharing one would route a station\'s data to the wrong tenant.',
  })
  @ApiBody({ type: CreateCustomerDto })
  @ApiCreatedResponse({
    description: 'The new customer',
    schema: {
      example: {
        data: {
          organizationId: '664a…',
          name: 'Acme Marine Services',
          slug: 'acme-marine-services',
          uploadFolder: 'Acme Marine',
          timezone: 'Australia/Sydney',
          admin: { id: '664b…', email: 'ops@acme.example' },
        },
      },
    },
  })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden')
  @Post('customers')
  @HttpCode(201)
  async createCustomer(@Body() body: CreateCustomerDto, @CurrentUser() user: JWTPayload) {
    return {
      data: await this.platformService.createCustomer(body, { userId: user.userId, email: user.email ?? '' }),
    };
  }

  @ApiOperation({
    summary: 'Operational health across every customer',
    description:
      'Checks the SILENT failures — the ones that raise nothing anywhere: a station that has stopped reporting ' +
      '(indistinguishable from calm weather, and from a full disk on the ingest box), a TTL that has stopped ' +
      'deleting (the collection just grows), a rollup that has stopped advancing, and files the platform could not ' +
      'read. Pull-based deliberately: there is no scheduler in this codebase, and inventing one to send alerts ' +
      'would add a moving part that itself needs monitoring. Point a prober at this and alert on `status`.',
  })
  @ApiOkResponse({
    description: 'ok | warn | fail, worst-wins, with what to do about each',
    schema: {
      example: {
        data: {
          status: 'warn',
          checks: [
            {
              key: 'silentStations',
              status: 'warn',
              summary: '1 of 2 station(s) silent for over 15 minutes',
              action: 'Check the logger and the SFTP upload folder. A full disk looks exactly like this.',
            },
          ],
        },
      },
    },
  })
  @ApiErrors('unauthorized', 'forbidden')
  @Get('health')
  async health() {
    return { data: await this.opsHealth.check() };
  }
}
