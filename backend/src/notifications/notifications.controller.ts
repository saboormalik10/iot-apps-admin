import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtOrApiKeyGuard } from '../common/guards/jwt-or-apikey.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Consumers } from '../common/decorators/consumers.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { JWTPayload } from '../utils/jwt';
import { NotificationsService } from './notifications.service';
import { RegisterTokenDto, UnregisterTokenDto } from './dto';

const NOTIFICATION_EXAMPLE = {
  _id: '664a1f2e3c4d5e6f7a8b9c50',
  type: 'alert',
  title: 'Turbidity threshold exceeded',
  body: 'River Intake Probe read 512 NTU (> 300).',
  data: { ruleId: '664a1f2e3c4d5e6f7a8b9c60', deviceId: '664a1f2e3c4d5e6f7a8b9c0f', sensor: 'turbidity', sensorValue: 512, threshold: 300 },
  readAt: null,
  createdAt: '2026-07-03T09:00:00.000Z',
};

const TOKEN_EXAMPLE = {
  _id: '664a1f2e3c4d5e6f7a8b9c51',
  platform: 'android',
  appId: 'com.observator.neplink',
  deviceModel: 'Pixel 8',
  expiresAt: '2026-09-01T09:00:00.000Z',
};

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @ApiOperation({
    summary: 'Register a device push token',
    description:
      '**Call this once after login, with the push token your platform gives you** (FCM on Android, ' +
      'APNs on iOS). Safe to call again with the same token — nothing is duplicated. Today alerts ' +
      'are delivered to the admin dashboard; storing your token now means real push notifications ' +
      'can be switched on later **without any app change**.',
  })
  @Consumers('nep-link', 'met-link')
  @ApiBody({
    type: RegisterTokenDto,
    examples: {
      android: { summary: '📱 Android (FCM)', value: { platform: 'android', token: 'fcm_abc123def456', appId: 'com.observator.neplink', deviceModel: 'Pixel 8' } },
      ios: { summary: '📱 iOS (APNs)', value: { platform: 'ios', token: 'apns_def456ghi789', appId: 'com.observator.metlink', deviceModel: 'iPhone 15' } },
    },
  })
  @ApiCreatedResponse({ description: 'Registered token', schema: { example: { data: TOKEN_EXAMPLE } } })
  @ApiErrors('badRequest', 'unauthorized')
  @Post('token')
  @HttpCode(201)
  @UseGuards(JwtOrApiKeyGuard)
  async registerToken(@Body() body: RegisterTokenDto, @CurrentUser() user?: JWTPayload) {
    const doc = await this.notifications.registerToken(user!.organizationId, user!.userId, body);
    return { data: doc };
  }

  @ApiOperation({
    summary: 'Unregister a device push token',
    description:
      '**Call this on logout** (before revoking the tokens) so the phone stops being a push target. ' +
      'Send the same token you registered.',
  })
  @Consumers('nep-link', 'met-link')
  @ApiBody({ type: UnregisterTokenDto })
  @ApiNoContentResponse({ description: 'Token removed' })
  @ApiErrors('badRequest', 'unauthorized')
  @Delete('token')
  @HttpCode(204)
  @UseGuards(JwtOrApiKeyGuard)
  async unregisterToken(@Body() body: UnregisterTokenDto, @CurrentUser() user?: JWTPayload): Promise<void> {
    await this.notifications.unregisterToken(user!.organizationId, body.token);
  }

  @ApiOperation({
    summary: 'List my notifications (feed)',
    description:
      '**Call this to show the user\'s alert / notification inbox.** Returns the latest alerts ' +
      'for the logged-in user, newest first. Pass `unread=true` to filter to unread only. ' +
      'Use `PATCH /:id/read` or `POST /read-all` to mark items read.',
  })
  @Consumers('nep-link', 'met-link', 'admin')
  @ApiQuery({ name: 'unread', required: false, description: 'true → only unread' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (default 20, max 100)' })
  @ApiOkResponse({
    description: 'Paginated notification feed',
    schema: { example: { data: [NOTIFICATION_EXAMPLE], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }, unreadCount: 1 } },
  })
  @ApiErrors('unauthorized')
  @Get()
  @UseGuards(JwtOrApiKeyGuard)
  async list(
    @Query('unread') unread: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.notifications.listForUser(user.organizationId, user.userId, {
      unread: unread === 'true',
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @ApiOperation({ summary: 'List registered device tokens (admin dashboard)' })
  @ApiOkResponse({ description: 'Org device tokens', schema: { example: { data: [TOKEN_EXAMPLE] } } })
  @ApiErrors('unauthorized')
  @Get('tokens')
  @UseGuards(JwtAuthGuard)
  async listTokens(@CurrentUser() user: JWTPayload) {
    const data = await this.notifications.listTokens(user.organizationId);
    return { data };
  }

  @ApiOperation({ summary: 'Mark a notification read' })
  @Consumers('nep-link', 'met-link', 'admin')
  @ApiOkResponse({ description: 'Updated notification', schema: { example: { data: { ...NOTIFICATION_EXAMPLE, readAt: '2026-07-03T09:05:00.000Z' } } } })
  @ApiErrors('unauthorized', 'notFound')
  @Patch(':id/read')
  @UseGuards(JwtOrApiKeyGuard)
  async markRead(@Param('id') id: string, @CurrentUser() user: JWTPayload) {
    const doc = await this.notifications.markRead(user.organizationId, user.userId, id);
    return { data: doc };
  }

  @ApiOperation({ summary: 'Mark all my notifications read' })
  @Consumers('nep-link', 'met-link', 'admin')
  @ApiOkResponse({ description: 'Count updated', schema: { example: { data: { updated: 3 } } } })
  @ApiErrors('unauthorized')
  @Post('read-all')
  @HttpCode(200)
  @UseGuards(JwtOrApiKeyGuard)
  async markAllRead(@CurrentUser() user: JWTPayload) {
    const res = await this.notifications.markAllRead(user.organizationId, user.userId);
    return { data: res };
  }
}
