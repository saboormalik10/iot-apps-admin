import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { StreamTypesService } from './stream-types.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../common/guards/permissions.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { JWTPayload } from '../utils/jwt';

/**
 * Stream types, as a CUSTOMER sees them — read-only, and only their own stations.
 *
 * Deliberately a separate controller from the platform one rather than relaxing
 * its guard. `SuperAdminGuard` sits at that controller's CLASS level so the
 * question "what spans customers?" stays answerable by grepping one symbol
 * (M19 W3); moving it to per-method would quietly give that up. Here the scope
 * is the caller's own organisation and nothing else, which is the whole
 * difference between the two endpoints.
 *
 * READ-ONLY on purpose. Switching a stream off stops data arriving, and a
 * customer doing that by accident would lose readings until somebody noticed —
 * so the toggle lives on the platform controller, behind a super admin.
 */
@ApiTags('Stream types')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('stream-types')
export class StreamTypesOrgController {
  constructor(private readonly streamTypes: StreamTypesService) {}

  @ApiOperation({
    summary: 'List stream types, with THIS organisation’s stations only',
    description:
      'The same formats a platform administrator sees, but the `stations` on each type are limited to the ' +
      'caller’s own organisation. Each carries whether that station is currently ingesting the format; changing ' +
      'it requires a platform administrator.',
  })
  @ApiOkResponse({ description: 'Stream types with your stations' })
  @ApiErrors('unauthorized', 'forbidden')
  @Get()
  @RequirePermissions('data:read')
  async list(@CurrentUser() user: JWTPayload) {
    return { data: await this.streamTypes.list(user.organizationId) };
  }
}
