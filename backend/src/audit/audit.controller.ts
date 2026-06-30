import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JWTPayload } from '../utils/jwt';
import { AuditService } from './audit.service';
import { AuditAction, AuditResourceType } from '../models/AuditLog';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @ApiOperation({ summary: 'List organization audit-log entries (admin only)' })
  @ApiQuery({ name: 'action', required: false, enum: ['create', 'update', 'delete', 'invite', 'revoke', 'export', 'login', 'logout'] })
  @ApiQuery({ name: 'resourceType', required: false, enum: ['device', 'user', 'session', 'record', 'alertRule', 'shareToken', 'org', 'settings'] })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by acting user id' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date — inclusive lower bound' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date — inclusive upper bound' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 50, description: 'Max 100' })
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async list(
    @CurrentUser() user?: JWTPayload,
    @Query('action') action?: AuditAction,
    @Query('resourceType') resourceType?: AuditResourceType,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.listAuditLogs(user!.organizationId, {
      action,
      resourceType,
      userId,
      from,
      to,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
