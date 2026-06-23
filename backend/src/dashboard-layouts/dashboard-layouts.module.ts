import { Module } from '@nestjs/common';
import { DashboardLayoutsController } from './dashboard-layouts.controller';
import { DashboardLayoutsService } from './dashboard-layouts.service';

@Module({
  controllers: [DashboardLayoutsController],
  providers: [DashboardLayoutsService],
})
export class DashboardLayoutsModule {}
