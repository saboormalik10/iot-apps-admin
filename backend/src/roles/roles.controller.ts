import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RolesService, RoleActor } from './roles.service';
import { RoleInputDto, RoleUpdateDto } from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../common/guards/permissions.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { JWTPayload } from '../utils/jwt';
import { PERMISSION_GROUPS } from '../common/permissions';

const ROLE_EXAMPLE = {
  _id: '6a8cb65020dea9248703bf74',
  organizationId: null,
  key: 'operator',
  name: 'Operator',
  description: 'Day-to-day use: view everything, manage alerts, add comments and export.',
  permissions: ['alert:read', 'alert:write', 'data:export', 'data:read'],
  isSystem: true,
  isDefault: false,
  userCount: 1,
};

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  private actor(user: JWTPayload): RoleActor {
    return {
      userId: user.userId,
      email: user.email ?? '',
      organizationId: user.organizationId,
      isSuperAdmin: user.sup === true,
    };
  }

  @ApiOperation({
    summary: 'The permission catalogue',
    description:
      'Grouped permissions with plain-English labels, so the role editor never hard-codes its own list. ' +
      'The catalogue lives in code — a permission nothing enforces cannot exist.',
  })
  @ApiOkResponse({ schema: { example: { data: [{ group: 'Data', permissions: [{ key: 'data:read', label: 'View dashboards and analytics' }] }] } } })
  @ApiErrors('unauthorized', 'forbidden')
  @Get('permissions')
  @RequirePermissions('role:read')
  listPermissions() {
    return { data: PERMISSION_GROUPS };
  }

  @ApiOperation({
    summary: 'List roles',
    description: 'Shared system roles plus any owned by the caller\'s organisation. Each carries `userCount`.',
  })
  @ApiOkResponse({ schema: { example: { data: [ROLE_EXAMPLE] } } })
  @ApiErrors('unauthorized', 'forbidden')
  @Get()
  @RequirePermissions('role:read')
  async list(@CurrentUser() user: JWTPayload) {
    return { data: await this.rolesService.list(this.actor(user)) };
  }

  @ApiOperation({
    summary: 'How many people hold this role',
    description: 'Used by the delete flow to prompt for a replacement before removing a role that is in use.',
  })
  @ApiOkResponse({ schema: { example: { data: { roleId: '…', name: 'Operator', userCount: 3, users: [] } } } })
  @ApiErrors('unauthorized', 'forbidden', 'notFound')
  @Get(':id/usage')
  @RequirePermissions('role:read')
  async usage(@Param('id') id: string, @CurrentUser() user: JWTPayload) {
    return { data: await this.rolesService.usage(id, this.actor(user)) };
  }

  @ApiOperation({
    summary: 'Create a role',
    description: 'A platform administrator creates a SHARED role; anyone else creates one inside their own organisation.',
  })
  @ApiBody({ type: RoleInputDto })
  @ApiOkResponse({ schema: { example: { data: ROLE_EXAMPLE } } })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden')
  @Post()
  @RequirePermissions('role:write')
  async create(@Body() body: RoleInputDto, @CurrentUser() user: JWTPayload) {
    return { data: await this.rolesService.create(body, this.actor(user)) };
  }

  @ApiOperation({
    summary: 'Update a role',
    description:
      'Name, description and permissions. The machine `key` never changes — the JWT and the legacy role guard both read it. ' +
      'A system role can only be edited by a platform administrator, since every organisation shares it.',
  })
  @ApiBody({ type: RoleUpdateDto })
  @ApiOkResponse({ schema: { example: { data: ROLE_EXAMPLE } } })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden', 'notFound')
  @Patch(':id')
  @RequirePermissions('role:write')
  async update(@Param('id') id: string, @Body() body: RoleUpdateDto, @CurrentUser() user: JWTPayload) {
    return { data: await this.rolesService.update(id, body, this.actor(user)) };
  }

  @ApiOperation({
    summary: 'Delete a role, reassigning anyone who holds it',
    description:
      'Soft delete — `deletedAt` is set and the key is freed for reuse. If ANY user holds the role, ' +
      '`replacementRoleId` is required and every holder is moved to it in the same transaction; without it the ' +
      'call returns 409 ROLE_IN_USE with the number affected, which is what the confirmation dialog shows. ' +
      'Refused with 409 WOULD_LOCK_OUT if the replacement would leave an organisation with nobody able to manage users.',
  })
  @ApiOkResponse({ schema: { example: { data: { deleted: '6a8c…', usersMoved: 3, replacementRoleId: '6a8d…' } } } })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden', 'notFound', 'conflict')
  @Delete(':id')
  @RequirePermissions('role:delete')
  async remove(
    @Param('id') id: string,
    @Query('replacementRoleId') replacementRoleId: string | undefined,
    @CurrentUser() user: JWTPayload,
  ) {
    return { data: await this.rolesService.remove(id, this.actor(user), replacementRoleId) };
  }
}
