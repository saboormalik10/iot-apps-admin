import { Module } from '@nestjs/common';
import { IngestModule } from '../ingest/ingest.module';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

@Module({
  imports: [IngestModule],
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}
