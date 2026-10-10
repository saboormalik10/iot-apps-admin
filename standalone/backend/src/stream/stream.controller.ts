import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../common/guards/permissions.guard';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import type { JWTPayload } from '../utils/jwt';
import { UpdateStreamConnectionDto } from './dto';
import { StreamService } from './stream.service';

@ApiTags('Sensor stream')
@ApiBearerAuth()
@Controller('stream')
export class StreamController {
  constructor(private readonly stream: StreamService) {}

  @ApiOperation({
    summary: 'Sensor stream status',
    description:
      'Whether the TCP listener is running and the sensor is connected, when the last reading arrived, ' +
      'how many readings came in over the last minute (about 60 when healthy), and the error counters — ' +
      'checksum failures, column-count mismatches, readings dropped as late.',
  })
  @ApiOkResponse({ description: 'Listener, connection and counters' })
  @ApiErrors('unauthorized', 'forbidden')
  @Get('status')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('data:read')
  getStatus() {
    return { data: this.stream.getStatus() };
  }

  @ApiOperation({
    summary: 'The last lines the sensor sent',
    description:
      'The last 100 lines received, oldest first, each with the time it arrived and what became of it (a reading, ' +
      'part of one, a header, or refused and why). Control bytes are shown as <STX>, <ETX> and \\xNN. What a ' +
      'technician copies to support when readings do not arrive as expected.',
  })
  @ApiOkResponse({ description: 'Recent lines, oldest first' })
  @ApiErrors('unauthorized', 'forbidden')
  @Get('recent-lines')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('system:read')
  recentLines() {
    return { data: this.stream.getRecentLines() };
  }

  @ApiOperation({
    summary: 'Change how this PC reaches the sensor',
    description:
      'Either the converter connects to this PC (`listen`, on the port the installer opened), or this PC ' +
      "dials the converter (`connect`, at `remoteHost`:`remotePort`). Saved on the station, so it outlasts a " +
      'restart and wins over the settings file; applied at once. Returns the new stream status — a converter ' +
      "that cannot be reached shows there as the status's `error`, while the reader keeps trying.",
  })
  @ApiBody({ type: UpdateStreamConnectionDto })
  @ApiOkResponse({ description: 'The stream status after the change' })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden')
  @Put('connection')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('device:write')
  async setConnection(
    @Body() body: UpdateStreamConnectionDto,
    @CurrentUser() user?: JWTPayload,
    @ClientIp() ipAddress?: string | null,
  ) {
    const status = await this.stream.setConnection(body, { userId: user!.userId, email: user!.email ?? '', ipAddress });
    return { data: status };
  }
}
