import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { DevicesModule } from './devices/devices.module';
import { SessionsModule } from './sessions/sessions.module';
import { RecordsModule } from './records/records.module';
import { FilesModule } from './files/files.module';
import { SyncModule } from './sync/sync.module';
import { SystemModule } from './system/system.module';

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
    SystemModule,
    AuthModule,
    DevicesModule,
    SessionsModule,
    RecordsModule,
    FilesModule,
    SyncModule,
  ],
})
export class AppModule {}
