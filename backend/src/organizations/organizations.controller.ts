import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiConsumes,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard, RequirePermissions } from '../common/guards/permissions.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { JWTPayload } from '../utils/jwt';
import { OrganizationsService } from './organizations.service';
import { AcceptInviteDto, CreateOrgUserDto, InviteUserDto, UpdateBrandingDto, UpdateOrgDto, UpdateUserDto } from './dto';
import { assertAllowedFileType } from '../utils/storage.util';

/** Logos only: raster images the browser can render inline. */
const LOGO_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * 2 MB. A logo is a header asset a few hundred pixels wide — anything larger is
 * a photograph pasted in by mistake, and would slow every page that renders it.
 */
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

const logoMulter = {
  storage: memoryStorage(),
  limits: { fileSize: LOGO_MAX_BYTES },
  fileFilter(_req: Express.Request, file: Express.Multer.File, cb: (err: Error | null, accept: boolean) => void) {
    if (LOGO_MIME.has(file.mimetype)) cb(null, true);
    else
      cb(
        Object.assign(new Error(`Unsupported logo type: ${file.mimetype}. Use PNG, JPEG or WebP.`), {
          code: 'INVALID_MIME',
          statusCode: 415,
        }),
        false,
      );
  },
};

const LOGO_BODY = {
  schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } },
};

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  /* ─────────────────────────────────────────────────────────────────────────
   * EMAIL INVITATIONS — SWITCHED OFF (M15 W3)
   *
   * Customer logins are created directly by the super admin with an email and a
   * password; there is no invitation email in the flow. `POST me/users/invite`
   * and `POST accept-invite` are commented out rather than deleted so the
   * InviteToken model and mailer wiring stay intact if invitations return.
   * ───────────────────────────────────────────────────────────────────────── */


//   @ApiOperation({ summary: 'Accept an invitation and set password (public, returns tokens)' })
//   @ApiBody({ type: AcceptInviteDto })
//   @ApiOkResponse({ description: 'Account activated (auto-login)', schema: { example: { data: { user: { id: '664a1f2e3c4d5e6f7a8b9c0d', email: 'new.user@observator.com', role: 'viewer' }, accessToken: 'eyJ…', refreshToken: 'a1b2…' } } } })
//   @ApiErrors('badRequest')
//   @Post('accept-invite')
//   @HttpCode(200)
//   async acceptInvite(@Body() body: AcceptInviteDto) {
//     const result = await this.organizationsService.acceptInvite(body);
//     return { data: result };
//   }

  @ApiOperation({
    summary: 'List every customer organisation (platform administrator only)',
    description:
      'One of the few queries that deliberately spans tenants — it powers the organisation switcher. ' +
      'The super-admin check is re-read from the database, not taken from the token.',
  })
  @ApiOkResponse({
    description: 'All organisations with device and user counts',
    schema: {
      example: {
        data: [
          { _id: '664a…', name: 'Observator Instruments AU', slug: 'observator-instruments-au', timezone: 'Australia/Sydney', country: 'AU', deviceCount: 3, userCount: 4 },
        ],
      },
    },
  })
  @ApiErrors('unauthorized', 'forbidden')
  // Guards are per-route on this controller, not class-level — without this the
  // handler runs unauthenticated and `user` is undefined.
  @UseGuards(JwtAuthGuard)
  @Get()
  async listAll(@CurrentUser() user: JWTPayload) {
    return { data: await this.organizationsService.listAll(user.userId) };
  }

  @ApiOperation({
    summary: 'Get this organisation\'s branding',
    description:
      'Fallbacks are already applied — `displayName` falls back to the organisation name — so every surface ' +
      '(shell, exports, share pages) renders the same values without each one reimplementing the rules. ' +
      '`isCustomised` is false when nothing has been set, which tells the shell to use the platform default ' +
      'rather than a half-applied theme.',
  })
  @ApiOkResponse({
    description: 'Resolved branding',
    schema: {
      example: {
        data: {
          displayName: 'Acme Marine',
          logoUrl: '',
          accentColor: '#1f6feb',
          supportEmail: 'support@acme.example',
          isCustomised: true,
          updatedAt: '2026-08-25T11:20:00.000Z',
        },
      },
    },
  })
  @ApiErrors('unauthorized')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('org:read')
  @Get('me/branding')
  async getBranding(@CurrentUser() user: JWTPayload) {
    return { data: await this.organizationsService.getBranding(user.organizationId) };
  }

  @ApiOperation({
    summary: 'Update this organisation\'s branding',
    description:
      'A customer changes their own; a platform administrator switched into them edits theirs, because the ' +
      'token\'s `organizationId` is re-pointed. An EMPTY STRING clears a field back to the platform default.',
  })
  @ApiBody({ type: UpdateBrandingDto })
  @ApiOkResponse({ description: 'The updated branding' })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden')
  @UseGuards(JwtAuthGuard, PermissionsGuard, RolesGuard)
  @RequirePermissions('org:write')
  @Roles('admin')
  @Patch('me/branding')
  async updateBranding(@Body() body: UpdateBrandingDto, @CurrentUser() user: JWTPayload) {
    return {
      data: await this.organizationsService.updateBranding(user.organizationId, body, {
        userId: user.userId,
        email: user.email ?? '',
      }),
    };
  }

  @ApiOperation({
    summary: 'Upload this organisation\'s logo',
    description:
      'PNG, JPEG or WebP, up to 2 MB. Validated by MAGIC BYTES, not the declared type, which is trivially ' +
      'spoofable. Replacing a logo deletes the previous file — but only after the new one is saved, so a failed ' +
      'upload never leaves the customer with no logo.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody(LOGO_BODY)
  @ApiOkResponse({ description: 'The updated branding' })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden', 'unsupportedMediaType')
  @UseGuards(JwtAuthGuard, PermissionsGuard, RolesGuard)
  @RequirePermissions('org:write')
  @Roles('admin')
  @Post('me/branding/logo')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', logoMulter))
  async uploadLogo(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: JWTPayload) {
    if (!file) throw new BadRequestException({ error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' } });
    // Re-checked against the real content, since multer only saw the header.
    await assertAllowedFileType(file.buffer, file.mimetype);
    return {
      data: await this.organizationsService.uploadLogo(user.organizationId, file, {
        userId: user.userId,
        email: user.email ?? '',
      }),
    };
  }

  @ApiOperation({
    summary: 'Remove this organisation\'s logo',
    description: 'Falls back to the wordmark. The stored file is deleted too.',
  })
  @ApiOkResponse({ description: 'The updated branding' })
  @ApiErrors('unauthorized', 'forbidden')
  @UseGuards(JwtAuthGuard, PermissionsGuard, RolesGuard)
  @RequirePermissions('org:write')
  @Roles('admin')
  @Delete('me/branding/logo')
  @HttpCode(200)
  async removeLogo(@CurrentUser() user: JWTPayload) {
    return {
      data: await this.organizationsService.removeLogo(user.organizationId, {
        userId: user.userId,
        email: user.email ?? '',
      }),
    };
  }

  @ApiOperation({ summary: 'Get the current organization' })
  @ApiOkResponse({ description: 'Organization document', schema: { example: { data: { id: '664a1f2e3c4d5e6f7a8b9c0e', name: 'Observator Instruments AU', slug: 'observator-instruments-au', country: 'AU', timezone: 'Australia/Melbourne' } } } })
  @ApiErrors('unauthorized')
  @Get('me')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('org:read')
  async getMyOrg(@CurrentUser() user?: JWTPayload) {
    const org = await this.organizationsService.getOrganization(user!.organizationId);
    return { data: org };
  }

  @ApiOperation({ summary: 'Update organization settings (admin only)' })
  @ApiBody({ type: UpdateOrgDto })
  @ApiOkResponse({ description: 'Updated organization' })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden')
  @Patch('me')
  @UseGuards(JwtAuthGuard, PermissionsGuard, RolesGuard)
  @Roles('admin')
  @RequirePermissions('org:write')
  async updateMyOrg(@Body() body: UpdateOrgDto, @CurrentUser() user?: JWTPayload) {
    const org = await this.organizationsService.updateOrganization(user!.organizationId, body, {
      userId: user!.userId,
      email: user!.email ?? '',
      perms: user!.perms,
      sup: user!.sup,
    });
    return { data: org };
  }

  @ApiOperation({ summary: 'List all users in the organization (admin only)' })
  @ApiOkResponse({ description: 'Org members', schema: { example: { data: [{ id: '664a1f2e3c4d5e6f7a8b9c0d', email: 'admin@observator.com', firstName: 'Dana', lastName: 'Galbraith', role: 'admin', isActive: true, lastLoginAt: '2026-06-23T09:00:00.000Z', invitedAt: null }] } } })
  @ApiErrors('unauthorized', 'forbidden')
  @Get('me/users')
  @UseGuards(JwtAuthGuard, PermissionsGuard, RolesGuard)
  @Roles('admin')
  @RequirePermissions('user:read')
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
  @UseGuards(JwtAuthGuard, PermissionsGuard, RolesGuard)
  @Roles('admin')
  @RequirePermissions('user:read')
  async listMobileUsers(@CurrentUser() user?: JWTPayload) {
    const users = await this.organizationsService.listMobileUsers(user!.organizationId);
    return { data: users };
  }

//   @ApiOperation({ summary: 'Invite a user by email (admin only)' })
//   @ApiBody({ type: InviteUserDto })
//   @ApiCreatedResponse({ description: 'Invited (email sent); 409 if the email already exists', schema: { example: { data: { user: { id: '664a1f2e3c4d5e6f7a8b9c0d', email: 'new.user@observator.com', role: 'viewer', isActive: false } } } } })
//   @ApiErrors('badRequest', 'unauthorized', 'forbidden')
//   @Post('me/users/invite')
//   @HttpCode(201)
//   @UseGuards(JwtAuthGuard, PermissionsGuard, RolesGuard)
//   @Roles('admin')
//   async inviteUser(@Body() body: InviteUserDto, @CurrentUser() user?: JWTPayload) {
//     const result = await this.organizationsService.inviteUser(user!.organizationId, body, {
//       userId: user!.userId,
//       email: user!.email ?? '',
//     });
//     return { data: result };
//   }

  @ApiOperation({
    summary: 'Add a user to this organisation',
    description:
      'Creates an ACTIVE user with the password supplied — there is no invitation email in this ' +
      'deployment. Pass `roleId` to grant a custom role, or `role` for one of the three built-in ' +
      'keys. The password is never returned or logged; show it to the operator once.',
  })
  @ApiBody({ type: CreateOrgUserDto })
  @ApiCreatedResponse({ description: 'The created user' })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden', 'conflict')
  @Post('me/users')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard, PermissionsGuard, RolesGuard)
  @Roles('admin')
  @RequirePermissions('user:write')
  async createUser(@Body() body: CreateOrgUserDto, @CurrentUser() user?: JWTPayload) {
    const created = await this.organizationsService.createUser(user!.organizationId, body, {
      userId: user!.userId,
      email: user!.email ?? '',
      perms: user!.perms,
      sup: user!.sup,
    });
    return { data: created };
  }

  @ApiOperation({
    summary: 'Remove a user from this organisation',
    description:
      'Soft-deletes the user, ends their sessions and frees their email address for re-use. ' +
      'Refuses to remove the last active admin, or the caller themselves.',
  })
  @ApiNoContentResponse({ description: 'User removed' })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden', 'notFound')
  @Delete('me/users/:id')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, PermissionsGuard, RolesGuard)
  @Roles('admin')
  @RequirePermissions('user:write')
  async deleteUser(@Param('id') id: string, @CurrentUser() user?: JWTPayload): Promise<void> {
    await this.organizationsService.deleteUser(user!.organizationId, id, {
      userId: user!.userId,
      email: user!.email ?? '',
      perms: user!.perms,
      sup: user!.sup,
    });
  }

  @ApiOperation({ summary: "Update a user's role or active status (admin only)" })
  @ApiBody({ type: UpdateUserDto })
  @ApiOkResponse({ description: 'Updated user (blocks self-edit + last-admin removal)' })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden', 'notFound')
  @Patch('me/users/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard, RolesGuard)
  @Roles('admin')
  @RequirePermissions('user:write')
  async updateUser(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @CurrentUser() user?: JWTPayload,
  ) {
    const updated = await this.organizationsService.updateUser(user!.organizationId, id, body, {
      userId: user!.userId,
      email: user!.email ?? '',
      perms: user!.perms,
      sup: user!.sup,
    });
    return { data: updated };
  }
}
