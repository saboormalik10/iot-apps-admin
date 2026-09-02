import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { assertAllowedFileType } from '../utils/storage.util';
import { JWTPayload } from '../utils/jwt';
import { ImportService } from './import.service';
import { ImportFileDto } from './dto';

const CSV_MIME = new Set(['text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/csv']);

const multerOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(_req: Express.Request, file: Express.Multer.File, cb: (err: Error | null, accept: boolean) => void) {
    if (CSV_MIME.has(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error(`Unsupported file type: ${file.mimetype}`), { code: 'INVALID_MIME', statusCode: 415 }), false);
  },
};

const FILE_BODY = {
  schema: {
    type: 'object',
    required: ['file', 'deviceId'],
    properties: {
      file: { type: 'string', format: 'binary' },
      deviceId: { type: 'string', description: 'Target device ObjectId' },
    },
  },
};

const SUMMARY_EXAMPLE = { data: { inserted: 3600, upserted: 1, skipped: 0, errors: [] } };

@ApiTags('Import')
@ApiBearerAuth()
@Controller('import')
@UseGuards(JwtAuthGuard, PermissionsGuard, RolesGuard)
@Roles('admin')
@RequirePermissions('import:write')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  // ── NEP CSV import — DISABLED (M15 W4) ──────────────────────────────────
  // Commented out here at the route level rather than deleted: `importNep` was
  // removed from ImportService when NEP was switched off, so this cannot compile
  // while it is live. Restoring NEP means restoring both together.
//   @ApiOperation({
//     summary: 'Import historical NEP sessions from a CSV (admin)',
//     description: 'Accepts the NEP export header (`SessionId,Timestamp,Turbidity_NTU,…`). Idempotent per SessionId. multipart with `file` + `deviceId`.',
//   })
//   @ApiConsumes('multipart/form-data')
//   @ApiBody(FILE_BODY)
//   @ApiCreatedResponse({ description: 'Import summary', schema: { example: SUMMARY_EXAMPLE } })
//   @ApiErrors('badRequest', 'unauthorized', 'forbidden', 'notFound', 'unsupportedMediaType')
//   @Post('nep')
//   @HttpCode(201)
//   @UseInterceptors(FileInterceptor('file', multerOptions))
//   async importNep(
//     @Body() body: { deviceId: string },
//     @UploadedFile() file: Express.Multer.File,
//     @CurrentUser() user: JWTPayload,
//   ) {
//     if (!file) throw new BadRequestException({ error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' } });
//     await assertAllowedFileType(file.buffer, file.mimetype);
//     const data = await this.importService.importNep(user.organizationId, body.deviceId, file.buffer, {
//       userId: user.userId,
//       email: user.email ?? '',
//     });
//     return { data };
//   }

  @ApiOperation({
    summary: 'Dry-run a MET import — WRITES NOTHING',
    description:
      'Reports what the import would do: how many rows, which local days would be created or appended to, the ' +
      'sensors detected, and — importantly — whether these exact bytes have ALREADY been ingested, in which case ' +
      'importing again would insert nothing. Uses the same parser and the same content hash as the real path, so ' +
      'the answer cannot drift from what actually happens.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_BODY)
  @ApiOkResponse({
    description: 'The plan. `persisted` is always false.',
    schema: {
      example: {
        data: {
          ok: true,
          rowsWouldInsert: 60,
          duplicateOf: null,
          days: [{ dayKey: '2026-08-25', existingMeasures: 1440, action: 'append' }],
          persisted: false,
        },
      },
    },
  })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden', 'notFound', 'unsupportedMediaType')
  @Post('met/dry-run')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async dryRunMet(
    @Body() body: ImportFileDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JWTPayload,
  ) {
    if (!file) throw new BadRequestException({ error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' } });
    await assertAllowedFileType(file.buffer, file.mimetype);
    return {
      data: await this.importService.dryRunMet(user.organizationId, body.deviceId, file.buffer, file.originalname),
    };
  }

  @ApiOperation({
    summary: 'Import historical MET measures from a CSV (admin)',
    description: 'Accepts the MET export header (`Timestamp,Temp_C,Humidity_%,…`). Creates one MetRecord for the file. multipart with `file` + `deviceId`.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_BODY)
  @ApiCreatedResponse({ description: 'Import summary', schema: { example: { data: { inserted: 240, upserted: 1, skipped: 0, errors: [] } } } })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden', 'notFound', 'unsupportedMediaType')
  @Post('met')
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async importMet(
    @Body() body: ImportFileDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JWTPayload,
  ) {
    if (!file) throw new BadRequestException({ error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' } });
    await assertAllowedFileType(file.buffer, file.mimetype);
    const data = await this.importService.importMet(user.organizationId, body.deviceId, file.buffer, {
      userId: user.userId,
      email: user.email ?? '',
    });
    return { data };
  }
}
