import { Module } from '@nestjs/common';

import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { OpsHealthService } from './ops-health.service';

@Module({
  controllers: [PlatformController],
  providers: [PlatformService, OpsHealthService],
})
export class PlatformModule {}
