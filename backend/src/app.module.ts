import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { AuthModule } from './auth/auth.module';
import { DevicesModule } from './devices/devices.module';
import { SessionsModule } from './sessions/sessions.module';
import { RecordsModule } from './records/records.module';
import { FilesModule } from './files/files.module';
import { SyncModule } from './sync/sync.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DashboardLayoutsModule } from './dashboard-layouts/dashboard-layouts.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SystemModule } from './system/system.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ShareModule } from './share/share.module';
// Alerts are switched off for now (product decision). Unregistering the module
// removes BOTH the /v1/alert-rules endpoints and AlertEvaluationService, so no
// threshold is evaluated and no `alert` notification is ever created. The module
// and its files are left intact — re-enable by uncommenting these two lines.
// import { AlertRulesModule } from './alert-rules/alert-rules.module';
import { ExportModule } from './export/export.module';
import { ImportModule } from './import/import.module';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: () => {
        const uri = process.env.MONGO_URI;
        if (!uri) {
          console.error('❌ MONGO_URI is not set in .env');
          process.exit(1);
        }
        return {
          uri,
          serverSelectionTimeoutMS: 8000,
          connectTimeoutMS: 8000,
        };
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
    EventEmitterModule.forRoot(),
    RealtimeModule,
    SystemModule,
    AuthModule,
    DevicesModule,
    SessionsModule,
    RecordsModule,
    FilesModule,
    SyncModule,
    DashboardModule,
    DashboardLayoutsModule,
    AnalyticsModule,
    UsersModule,
    OrganizationsModule,
    AuditModule,
    NotificationsModule,
    ShareModule,
    // AlertRulesModule,   ← alerts disabled, see the import above
    ExportModule,
    ImportModule,
  ],
})
export class AppModule {}
