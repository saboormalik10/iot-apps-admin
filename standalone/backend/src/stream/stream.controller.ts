import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../common/guards/permissions.guard';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
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
}
