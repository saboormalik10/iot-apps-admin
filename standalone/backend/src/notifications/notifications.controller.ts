import {
  Controller,
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
  ApiQuery,
  ApiOkResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { JWTPayload } from '../utils/jwt';
import { NotificationsService } from './notifications.service';

const NOTIFICATION_EXAMPLE = {
  _id: '664a1f2e3c4d5e6f7a8b9c50',
  type: 'alert',
  title: 'Strong wind',
  body: 'wind_speed gt 60km/h — read 65.5km/h',
  data: { ruleId: '664a1f2e3c4d5e6f7a8b9c60', deviceId: '664a1f2e3c4d5e6f7a8b9c0f', sensor: 'wind_speed', sensorValue: 18.2, threshold: 60 },
  readAt: null,
  createdAt: '2026-07-03T09:00:00.000Z',
};

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @ApiOperation({
    summary: 'List my notifications (feed)',
    description:
      '**Call this to show the user\'s alert / notification inbox.** Returns the latest alerts ' +
      'for the logged-in user, newest first. Pass `unread=true` to filter to unread only. ' +
      'Use `PATCH /:id/read` or `POST /read-all` to mark items read.',
  })
  @ApiQuery({ name: 'unread', required: false, description: 'true → only unread' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (default 20, max 100)' })
  @ApiOkResponse({
    description: 'Paginated notification feed',
    schema: { example: { data: [NOTIFICATION_EXAMPLE], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }, unreadCount: 1 } },
  })
  @ApiErrors('unauthorized')
  @Get()
  @UseGuards(JwtAuthGuard)
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

  @ApiOperation({ summary: 'Mark a notification read' })
  @ApiOkResponse({ description: 'Updated notification', schema: { example: { data: { ...NOTIFICATION_EXAMPLE, readAt: '2026-07-03T09:05:00.000Z' } } } })
  @ApiErrors('unauthorized', 'notFound')
  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  async markRead(@Param('id') id: string, @CurrentUser() user: JWTPayload) {
    const doc = await this.notifications.markRead(user.organizationId, user.userId, id);
    return { data: doc };
  }

  @ApiOperation({ summary: 'Mark all my notifications read' })
  @ApiOkResponse({ description: 'Count updated', schema: { example: { data: { updated: 3 } } } })
  @ApiErrors('unauthorized')
  @Post('read-all')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async markAllRead(@CurrentUser() user: JWTPayload) {
    const res = await this.notifications.markAllRead(user.organizationId, user.userId);
    return { data: res };
  }
}
