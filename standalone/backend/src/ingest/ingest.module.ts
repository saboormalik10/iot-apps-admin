import { Module } from '@nestjs/common';
import { IngestService } from './ingest.service';

/**
 * The ingest pipeline — QC, 1-minute aggregation, storage, rollups, live events.
 *
 * No HTTP controller: the cloud portal received files from an SFTP agent over
 * HTTP, authenticated by service credentials. The standalone reads the sensor
 * over TCP in-process (see `stream/`), so that endpoint and its credentials are
 * gone — there is nothing on the network to accept data except the stream port.
 */
@Module({
  providers: [IngestService],
  exports: [IngestService],
})
export class IngestModule {}
