import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiBody,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { JWTPayload } from '../utils/jwt';
import { DashboardLayoutsService, CreateLayoutInput } from './dashboard-layouts.service';
import { IDashboardTile } from '../models/DashboardLayout';
import { CreateLayoutDto, UpdateLayoutDto } from './dto';

@ApiTags('Dashboard Layouts')
@ApiBearerAuth()
@Controller('dashboard-layouts')
@UseGuards(JwtAuthGuard)
export class DashboardLayoutsController {
  constructor(private readonly service: DashboardLayoutsService) {}

  @ApiOperation({ summary: "List the current user's saved layouts (optionally per device)" })
  @ApiQuery({ name: 'deviceId', required: false })
  @ApiOkResponse({ description: 'Saved layouts' })
  @ApiErrors('unauthorized')
  @Get()
  async list(@Query('deviceId') deviceId: string, @CurrentUser() user: JWTPayload) {
    const data = await this.service.list(user.organizationId, user.userId, deviceId);
    return { data };
  }

  @ApiOperation({ summary: 'Save a new dashboard layout' })
  @ApiBody({ type: CreateLayoutDto })
  @ApiCreatedResponse({ description: 'Created layout' })
  @ApiErrors('badRequest', 'unauthorized')
  @Post()
  @HttpCode(201)
  async create(@Body() body: CreateLayoutInput, @CurrentUser() user: JWTPayload) {
    const data = await this.service.create(user.organizationId, user.userId, body);
    return { data };
  }

  @ApiOperation({ summary: 'Update layout name or tiles' })
  @ApiBody({ type: UpdateLayoutDto })
  @ApiOkResponse({ description: 'Updated layout' })
  @ApiErrors('badRequest', 'unauthorized', 'notFound')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; tiles?: IDashboardTile[] },
    @CurrentUser() user: JWTPayload,
  ) {
    const data = await this.service.update(user.organizationId, user.userId, id, body);
    return { data };
  }

  @ApiOperation({ summary: 'Delete a saved layout' })
  @ApiNoContentResponse({ description: 'Layout deleted' })
  @ApiErrors('unauthorized', 'notFound')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: JWTPayload): Promise<void> {
    await this.service.remove(user.organizationId, user.userId, id);
  }

  @ApiOperation({ summary: 'Set this layout as the default for its device' })
  @ApiOkResponse({ description: 'Default layout set' })
  @ApiErrors('unauthorized', 'notFound')
  @Patch(':id/set-default')
  async setDefault(@Param('id') id: string, @CurrentUser() user: JWTPayload) {
    const data = await this.service.setDefault(user.organizationId, user.userId, id);
    return { data };
  }
}
