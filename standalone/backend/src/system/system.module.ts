import { Module } from '@nestjs/common';
import { StreamModule } from '../stream/stream.module';
import { SystemController } from './system.controller';
import { SystemStatusService } from './system-status.service';

@Module({
  imports: [StreamModule],
  controllers: [SystemController],
  providers: [SystemStatusService],
})
export class SystemModule {}
