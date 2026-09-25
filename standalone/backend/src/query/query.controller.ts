import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../common/guards/permissions.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { JWTPayload } from '../utils/jwt';
import { QueryService, type QueryInput } from './query.service';
import type { Resolution } from './columns';

const COMMON_QUERY = [
  { name: 'deviceId', required: true, description: 'The station' },
  { name: 'from', required: true, description: 'Start, Unix ms (inclusive)' },
  { name: 'to', required: true, description: 'End, Unix ms (exclusive)' },
  { name: 'fields', required: true, description: 'Comma-separated column keys, from GET /query/columns' },
  { name: 'resolution', required: false, description: 'minute (default) | hour | day' },
];

@ApiTags('Query')
@ApiBearerAuth()
@Controller('query')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class QueryController {
  constructor(private readonly query: QueryService) {}

  @ApiOperation({ summary: 'Columns the station can offer, in the organisation’s units' })
  @ApiQuery({ name: 'deviceId', required: true })
  @ApiOkResponse({ description: 'Columns, timezone, rain-day start hour, resolutions' })
  @ApiErrors('unauthorized', 'forbidden', 'notFound')
  @Get('columns')
  @RequirePermissions('data:read')
  async columns(@Query('deviceId') deviceId: string, @CurrentUser() user: JWTPayload) {
    return { data: await this.query.columnsFor(user.organizationId, deviceId) };
  }

  @ApiOperation({
    summary: 'Chosen columns over a range — a page of rows',
    description:
      'One row per minute, hour or day. Hours and days: means for levels, a vector mean for wind direction, the ' +
      'highest gust, and rain as a total. A day starts at the station’s rain-day hour.',
  })
  @ApiQuery(COMMON_QUERY[0]) @ApiQuery(COMMON_QUERY[1]) @ApiQuery(COMMON_QUERY[2]) @ApiQuery(COMMON_QUERY[3]) @ApiQuery(COMMON_QUERY[4])
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false, description: '1–500, default 100' })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden', 'notFound')
  @Get('measures')
  @RequirePermissions('data:read')
  async measures(@Query() raw: Record<string, string>, @CurrentUser() user: JWTPayload) {
    return { data: await this.query.rows(parse(raw, user)) };
  }

  @ApiOperation({ summary: 'The same rows as a CSV file, streamed' })
  @ApiQuery(COMMON_QUERY[0]) @ApiQuery(COMMON_QUERY[1]) @ApiQuery(COMMON_QUERY[2]) @ApiQuery(COMMON_QUERY[3]) @ApiQuery(COMMON_QUERY[4])
  @ApiErrors('badRequest', 'unauthorized', 'forbidden', 'notFound')
  @Get('measures.csv')
  @RequirePermissions('data:read', 'data:export')
  async measuresCsv(@Query() raw: Record<string, string>, @CurrentUser() user: JWTPayload, @Res() res: Response) {
    const q = parse(raw, user);
    // Everything that can fail is checked before the first byte: once the header
    // row is out, an error can no longer become a proper 400.
    await this.query.rows({ ...q, page: 1, limit: 1 });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    await this.query.csv(q, res, (name) => res.setHeader('Content-Disposition', `attachment; filename="${name}"`));
    res.end();
  }
}

function parse(raw: Record<string, string>, user: JWTPayload): QueryInput {
  return {
    organizationId: user.organizationId,
    deviceId: raw.deviceId ?? '',
    from: Number(raw.from),
    to: Number(raw.to),
    fields: (raw.fields ?? '').split(',').map((f) => f.trim()).filter(Boolean),
    resolution: ((raw.resolution ?? 'minute').trim() || 'minute') as Resolution,
    page: raw.page ? Number(raw.page) : undefined,
    limit: raw.limit ? Number(raw.limit) : undefined,
  };
}
