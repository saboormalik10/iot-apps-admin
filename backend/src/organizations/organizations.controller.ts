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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
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
  @Post('accept-invite')
  @HttpCode(200)
  async acceptInvite(@Body() body: AcceptInviteDto) {
    const result = await this.organizationsService.acceptInvite(body);
    return { data: result };
  }

  @ApiOperation({ summary: 'Get the current organization' })
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyOrg(@CurrentUser() user?: JWTPayload) {
    const org = await this.organizationsService.getOrganization(user!.organizationId);
    return { data: org };
  }

  @ApiOperation({ summary: 'Update organization settings (admin only)' })
  @ApiBody({ type: UpdateOrgDto })
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
  @Get('me/users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async listUsers(@CurrentUser() user?: JWTPayload) {
    const users = await this.organizationsService.listUsers(user!.organizationId);
    return { data: users };
  }

  @ApiOperation({ summary: 'Invite a user by email (admin only)' })
  @ApiBody({ type: InviteUserDto })
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
