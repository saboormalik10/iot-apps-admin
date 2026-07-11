import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { JWTPayload } from '../utils/jwt';
import { OrganizationsService } from './organizations.service';
import { UpdateOrgDto, InviteUserDto, UpdateUserDto, AcceptInviteDto } from './dto';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @ApiOperation({ summary: 'Accept an invitation and set password (public, returns tokens)' })
  @ApiBody({ type: AcceptInviteDto })
  @ApiOkResponse({ description: 'Account activated (auto-login)', schema: { example: { data: { user: { id: '664a1f2e3c4d5e6f7a8b9c0d', email: 'new.user@observator.com', role: 'viewer' }, accessToken: 'eyJ…', refreshToken: 'a1b2…' } } } })
  @ApiErrors('badRequest')
  @Post('accept-invite')
  @HttpCode(200)
  async acceptInvite(@Body() body: AcceptInviteDto) {
    const result = await this.organizationsService.acceptInvite(body);
    return { data: result };
  }

  @ApiOperation({ summary: 'Get the current organization' })
  @ApiOkResponse({ description: 'Organization document', schema: { example: { data: { id: '664a1f2e3c4d5e6f7a8b9c0e', name: 'Observator Instruments AU', slug: 'observator-instruments-au', country: 'AU', timezone: 'Australia/Melbourne' } } } })
  @ApiErrors('unauthorized')
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyOrg(@CurrentUser() user?: JWTPayload) {
    const org = await this.organizationsService.getOrganization(user!.organizationId);
    return { data: org };
  }

  @ApiOperation({ summary: 'Update organization settings (admin only)' })
  @ApiBody({ type: UpdateOrgDto })
  @ApiOkResponse({ description: 'Updated organization' })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden')
  @Patch('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateMyOrg(@Body() body: UpdateOrgDto, @CurrentUser() user?: JWTPayload) {
    const org = await this.organizationsService.updateOrganization(user!.organizationId, body, {
      userId: user!.userId,
      email: user!.email ?? '',
    });
    return { data: org };
  }

  @ApiOperation({ summary: 'List all users in the organization (admin only)' })
  @ApiOkResponse({ description: 'Org members', schema: { example: { data: [{ id: '664a1f2e3c4d5e6f7a8b9c0d', email: 'admin@observator.com', firstName: 'Dana', lastName: 'Galbraith', role: 'admin', isActive: true, lastLoginAt: '2026-06-23T09:00:00.000Z', invitedAt: null }] } } })
  @ApiErrors('unauthorized', 'forbidden')
  @Get('me/users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async listUsers(@CurrentUser() user?: JWTPayload) {
    const users = await this.organizationsService.listUsers(user!.organizationId);
    return { data: users };
  }

  @ApiOperation({
    summary: 'List mobile-app users with upload activity (admin only)',
    description:
      'Users who signed up from the MET-LINK / NEP-LINK apps (or have app activity), each with: ' +
      'profile basics, which app they signed up from (mobileAppType), MET-record and NEP-session ' +
      'upload counts, the last upload time, and every device they registered or synced data for. ' +
      'Powers the admin panel Users page (MET users / NEP users tabs).',
  })
  @ApiOkResponse({
    description: 'Mobile users with activity stats',
    schema: {
      example: {
        data: [
          {
            id: '664a1f2e3c4d5e6f7a8b9c0d',
            email: 'field.tech@observator.com',
            firstName: 'Sam',
            lastName: 'Rivers',
            role: 'operator',
            isActive: true,
            mobileAppType: 'NEP-LINK',
            createdAt: '2026-06-01T08:00:00.000Z',
            lastLoginAt: '2026-07-09T10:00:00.000Z',
            metRecordCount: 0,
            nepSessionCount: 12,
            lastUploadAt: '2026-07-09T10:30:00.000Z',
            devices: [{ id: '664a1f2e3c4d5e6f7a8b9c0f', name: 'NEP-LINK-001', type: 'NEP-LINK' }],
          },
        ],
      },
    },
  })
  @ApiErrors('unauthorized', 'forbidden')
  @Get('me/mobile-users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async listMobileUsers(@CurrentUser() user?: JWTPayload) {
    const users = await this.organizationsService.listMobileUsers(user!.organizationId);
    return { data: users };
  }

  @ApiOperation({ summary: 'Invite a user by email (admin only)' })
  @ApiBody({ type: InviteUserDto })
  @ApiCreatedResponse({ description: 'Invited (email sent); 409 if the email already exists', schema: { example: { data: { user: { id: '664a1f2e3c4d5e6f7a8b9c0d', email: 'new.user@observator.com', role: 'viewer', isActive: false } } } } })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden')
  @Post('me/users/invite')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async inviteUser(@Body() body: InviteUserDto, @CurrentUser() user?: JWTPayload) {
    const result = await this.organizationsService.inviteUser(user!.organizationId, body, {
      userId: user!.userId,
      email: user!.email ?? '',
    });
    return { data: result };
  }

  @ApiOperation({ summary: "Update a user's role or active status (admin only)" })
  @ApiBody({ type: UpdateUserDto })
  @ApiOkResponse({ description: 'Updated user (blocks self-edit + last-admin removal)' })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden', 'notFound')
  @Patch('me/users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateUser(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @CurrentUser() user?: JWTPayload,
  ) {
    const updated = await this.organizationsService.updateUser(user!.organizationId, id, body, {
      userId: user!.userId,
      email: user!.email ?? '',
    });
    return { data: updated };
  }
}
