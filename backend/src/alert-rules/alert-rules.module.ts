import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AlertRulesController } from './alert-rules.controller';
import { AlertRulesService } from './alert-rules.service';
import { AlertEvaluationService } from './alert-evaluation.service';

@Module({
  imports: [NotificationsModule],
  controllers: [AlertRulesController],
  providers: [AlertRulesService, AlertEvaluationService],
})
export class AlertRulesModule {}
