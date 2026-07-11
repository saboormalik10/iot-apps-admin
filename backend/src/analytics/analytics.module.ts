import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { DailySummaryService } from './daily-summary.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, DailySummaryService],
  exports: [DailySummaryService],
})
export class AnalyticsModule {}
