import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { JWTPayload } from '../utils/jwt';
import { AlertRulesService } from './alert-rules.service';
import { CreateAlertRuleDto, UpdateAlertRuleDto } from './dto';

const ALERT_RULE_EXAMPLE = {
  _id: '664a1f2e3c4d5e6f7a8b9c60',
  name: 'High turbidity',
  deviceId: '664a1f2e3c4d5e6f7a8b9c0f',
  appType: 'NEP',
  sensor: 'turbidity',
  condition: 'gt',
  threshold: 300,
  unit: 'NTU',
  isActive: true,
  notifyUserIds: ['664a1f2e3c4d5e6f7a8b9c0d'],
  cooldownMinutes: 60,
  lastTriggeredAt: null,
  triggerHistory: [],
  createdAt: '2026-07-03T09:00:00.000Z',
};

@ApiTags('Alert Rules')
@ApiBearerAuth()
@Controller('alert-rules')
export class AlertRulesController {
  constructor(private readonly service: AlertRulesService) {}

  @ApiOperation({ summary: 'Create an alert rule (auto-evaluated on incoming data)' })
  @ApiBody({ type: CreateAlertRuleDto })
  @ApiCreatedResponse({ description: 'Created alert rule', schema: { example: { data: ALERT_RULE_EXAMPLE } } })
  @ApiErrors('badRequest', 'unauthorized', 'notFound')
  @Post()
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  async create(@Body() body: CreateAlertRuleDto, @CurrentUser() user: JWTPayload) {
    const rule = await this.service.create(user.organizationId, body, { userId: user.userId, email: user.email ?? '' });
    return { data: rule };
  }

  @ApiOperation({ summary: 'List alert rules' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Filter by device ObjectId' })
  @ApiQuery({ name: 'isActive', required: false, description: 'true | false' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (default 20)' })
  @ApiOkResponse({
    description: 'Paginated alert rules',
    schema: { example: { data: [ALERT_RULE_EXAMPLE], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } },
  })
  @ApiErrors('unauthorized')
  @Get()
  @UseGuards(JwtAuthGuard)
  async list(
    @Query('deviceId') deviceId: string,
    @Query('isActive') isActive: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.service.list(user.organizationId, {
      deviceId,
      isActive: isActive === undefined ? undefined : isActive === 'true',
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @ApiOperation({ summary: 'Get an alert rule' })
  @ApiOkResponse({ description: 'Alert rule', schema: { example: { data: ALERT_RULE_EXAMPLE } } })
  @ApiErrors('unauthorized', 'notFound')
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async get(@Param('id') id: string, @CurrentUser() user: JWTPayload) {
    const rule = await this.service.get(user.organizationId, id);
    return { data: rule };
  }

  @ApiOperation({ summary: 'Update an alert rule (also used to toggle isActive)' })
  @ApiBody({ type: UpdateAlertRuleDto })
  @ApiOkResponse({ description: 'Updated alert rule', schema: { example: { data: ALERT_RULE_EXAMPLE } } })
  @ApiErrors('badRequest', 'unauthorized', 'notFound')
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(@Param('id') id: string, @Body() body: UpdateAlertRuleDto, @CurrentUser() user: JWTPayload) {
    const rule = await this.service.update(user.organizationId, id, body, { userId: user.userId, email: user.email ?? '' });
    return { data: rule };
  }

  @ApiOperation({ summary: 'Delete an alert rule' })
  @ApiNoContentResponse({ description: 'Alert rule deleted' })
  @ApiErrors('unauthorized', 'notFound')
  @Delete(':id')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string, @CurrentUser() user: JWTPayload): Promise<void> {
    await this.service.remove(user.organizationId, id, { userId: user.userId, email: user.email ?? '' });
  }
}
