import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { AuthModule } from './auth/auth.module';
import { DevicesModule } from './devices/devices.module';
// NEP sessions — switched off (M15 W4). NEP data came only from the mobile apps,
// which are disabled; the module and its files stay intact for M22, when water
// quality is onboarded as an SFTP stream type.
// import { SessionsModule } from './sessions/sessions.module';
import { RecordsModule } from './records/records.module';
import { FilesModule } from './files/files.module';
// Mobile sync — fully switched off (M15 W4). ImportModule's NEP path was its last
// consumer of SyncService; with that disabled the module has no dependents left.
// import { SyncModule } from './sync/sync.module';
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
// Alerts re-enabled in M17: the wind alarm is a product the client sells, and the
// SFTP ingest already emits MET_MEASURES, which AlertEvaluationService listens to.
import { AlertRulesModule } from './alert-rules/alert-rules.module';
import { ExportModule } from './export/export.module';
import { ImportModule } from './import/import.module';
import { IngestModule } from './ingest/ingest.module';
import { RolesModule } from './roles/roles.module';
import { PlatformModule } from './platform/platform.module';
import { ProvisionModule } from './provision/provision.module';

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
          // Matches the raw connection in main.ts — see the note there. Left ON
          // outside production so a developer's schema change still applies.
          autoIndex: process.env.NODE_ENV !== 'production',
          connectTimeoutMS: 8000,
        };
      },
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 10 }],
      /**
       * Rate limiting is a production control, and the e2e suite is not the
       * traffic it is meant to stop: ~19 login calls across the suites would
       * blow a 10/min budget from a single IP and fail unrelated tests with 429s.
       *
       * The WIRING is still asserted — `throttle-coverage.e2e-spec.ts` fails the
       * build if a @Throttle route loses its guard, which is the defect this
       * actually guards against (M24 W1). Runtime behaviour was verified against
       * a running server: 30 failed logins → 10×401 then 20×429.
       */
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    EventEmitterModule.forRoot(),
    RealtimeModule,
    SystemModule,
    AuthModule,
    DevicesModule,
    // SessionsModule,   ← NEP disabled (M15 W4)
    RecordsModule,
    FilesModule,
    // SyncModule,   ← mobile sync disabled (M15 W3/W4)
    DashboardModule,
    DashboardLayoutsModule,
    AnalyticsModule,
    UsersModule,
    OrganizationsModule,
    AuditModule,
    NotificationsModule,
    ShareModule,
    AlertRulesModule,
    ExportModule,
    ImportModule,
    IngestModule,
    RolesModule,
    PlatformModule,
    ProvisionModule,
  ],
})
export class AppModule {}
