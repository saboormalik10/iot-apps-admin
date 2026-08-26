import { Module } from '@nestjs/common';
// import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

/**
 * Mobile sync — SWITCHED OFF (M15 W3).
 *
 * The station uploads files over SFTP and never calls our API, so the mobile
 * sync endpoints have no traffic. Unregistering the CONTROLLER removes all four
 * routes — `GET /sync/status`, `POST /sync/upload`, `GET /sync/download`,
 * `PATCH /sync/device-status` — while leaving every file intact.
 *
 * WHY NOT UNREGISTER THE WHOLE MODULE FROM app.module.ts: `ImportModule` imports
 * this module and `ImportService` injects `SyncService` (import.service.ts:95
 * routes the NEP CSV import through `syncUpload`). Removing the module from
 * AppModule alone would therefore NOT remove the routes — ImportModule would pull
 * it straight back in. The controller is the right seam.
 *
 * To restore: uncomment the import and the `controllers` line.
 */
@Module({
  // controllers: [SyncController],   ← mobile sync disabled, see above
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
