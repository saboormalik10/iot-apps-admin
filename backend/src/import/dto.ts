import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

/**
 * Body of the multipart import routes (M24 W1).
 *
 * These routes previously bound an inline `{ deviceId: string }`, which erases at
 * runtime — so `deviceId` reached `new Types.ObjectId(...)` unchecked and a
 * malformed value produced a 500 rather than a 400.
 *
 * The file itself is validated separately and by content: `assertAllowedFileType`
 * checks MAGIC BYTES, not the declared mimetype, which is what stops a CSV
 * renamed `.png` (M20 W2).
 */
export class ImportFileDto {
  @ApiProperty({ description: 'Target device ObjectId' })
  @IsMongoId()
  deviceId!: string;
}
