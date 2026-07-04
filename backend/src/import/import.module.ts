import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

@Module({
  imports: [SyncModule],
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}
