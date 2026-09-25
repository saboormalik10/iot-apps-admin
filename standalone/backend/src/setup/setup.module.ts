import { Module } from '@nestjs/common';
import { FirstRunService } from './first-run.service';

@Module({
  providers: [FirstRunService],
  exports: [FirstRunService],
})
export class SetupModule {}
