import { Module } from '@nestjs/common';
import { IngestModule } from '../ingest/ingest.module';
import { StreamController } from './stream.controller';
import { StreamService } from './stream.service';

@Module({
  imports: [IngestModule],
  controllers: [StreamController],
  providers: [StreamService],
  exports: [StreamService],
})
export class StreamModule {}
